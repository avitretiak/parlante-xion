import { Client, type UsingClient } from 'seyfert';
import { Kazagumo } from 'kazagumo';
import { PlayerState } from 'kazagumo';
import type { KazagumoPlayer } from 'kazagumo';
import { Connectors, Constants, type Node, type ShoukakuOptions } from 'shoukaku';
import { destroyPlayer, playersManager } from '../managers/players';
import type { ParlantePlayer, ResumeSnapshot } from '../structures/player';
import { buildNodeConfig } from '#parlante/config';
import { debug, info, warn, error as logError } from '#parlante/utils/system/logger';
import { getGuildSettings } from '#parlante/utils/config/get-guild-settings';
import { escapeDiscordMarkdown, getTrackTitle } from '#parlante/utils/general/string';
import messages from '#parlante/utils/constants/messages';

// How long to wait before attempting to replay after a voice WS close.
// Chosen to be longer than Discord's typical voice reconnect handshake (~1-2s)
// but short enough not to noticeably stall playback.
const RECONNECT_RESUME_DELAY_MS = 5_000;
const RECONNECT_RESUME_MAX_DELAY_MS = 30_000;
// Maximum retry attempts before giving up on auto-resume.
const RECONNECT_RESUME_MAX_RETRIES = 6;
const RECOVERY_FAILURE_RESET_MS = 120_000;
const RECOVERY_RESET_THRESHOLD = 2;
const STUCK_RECOVERY_RESET_THRESHOLD = 7;
const RECOVERY_LOCK_MS = 5_000;

// Node recovery: after NodeLink restarts (resumed=false), Shoukaku's
// resumeByLibrary PATCHes player state back but it may silently fail.
// The watchdog verifies playback actually started within this window.
const NODE_RECOVERY_VERIFY_DELAY_MS = 15_000;
const NODE_RECOVERY_REPLAY_REWIND_MS = 2_000;
const NODE_RECOVERY_MAX_REPLAY_ATTEMPTS = 3;
const NODE_RECOVERY_REPLAY_INTERVAL_MS = 5_000;
const PLAYBACK_STALL_THRESHOLD_MS = 20_000;
const PLAYBACK_STALL_RECOVERY_COOLDOWN_MS = 30_000;
const PLAYBACK_STALL_WATCHDOG_INTERVAL_MS = 5_000;
const RESUME_NATURAL_PROGRESS_MIN_MS = 1_000;
// Cooldown between automatic addNode re-adds after the node left the pool
// (Shoukaku's internal reconnect budget is 6 × 10s = 60s; re-add roughly once
// per budget while NodeLink is down, and within 10s of it coming back).
const NODE_READD_COOLDOWN_MS = 10_000;

type RecoveryState = {
  consecutiveFailures: number;
  lastFailureAt: number;
  recovering: boolean;
};

type TrackDiagnostics = {
  title?: string;
  identifier?: string;
  uri?: string;
  sourceName?: string;
  isStream?: boolean;
  isSeekable?: boolean;
  length?: number;
};

type PlayerExceptionClientError = {
  client?: string;
  message?: string;
};

type PlayerExceptionDiagnostics = {
  message?: string;
  severity?: string;
  cause?: string;
  clientErrors: PlayerExceptionClientError[];
};

type RecoveryContext = {
  trigger: 'playerException' | 'playerStuck' | 'playerResolveError';
  reason?: string;
  cause?: string;
  severity?: string;
};

type NodeRecoveryEntry = {
  snapshot: ResumeSnapshot;
  watchdogTimer: NodeJS.Timeout;
  replayAttempts: number;
  baselinePosition: number;
};

type PlaybackProgressEntry = {
  lastPosition: number;
  lastProgressAt: number;
  lastRecoveryAt: number;
};

type TrackRecoveryState = {
  trackId: string;
  sameTrackReplayPending: boolean;
  sameTrackReplayUsed: boolean;
  replayDisabled: boolean;
  graceUntil: number;
  lastReplayAt: number;
};

const isTransientVoiceException = (context?: RecoveryContext): boolean => {
  if (!context || context.trigger !== 'playerException') return false;
  const reason = context.reason ?? '';
  const cause = context.cause ?? '';
  const combined = `${reason} ${cause}`.toLowerCase();
  return (
    cause === 'VOICE_CONNECTION_RESET' ||
    combined.includes('econnreset') ||
    combined.includes('alreadyingroup') ||
    combined.includes('failed to set external sender')
  );
};

const buildResumeSnapshot = (
  player: KazagumoPlayer,
  parlantePlayer: ParlantePlayer,
): ResumeSnapshot | null => {
  const current = player.queue.current;
  if (!current) return null;
  if (player.state === PlayerState.DESTROYING || player.state === PlayerState.DESTROYED) {
    return null;
  }

  const trackId =
    (current as { identifier?: string }).identifier ??
    (current as { info?: { identifier?: string } }).info?.identifier ??
    (current as { track?: string }).track ??
    '';
  const isStream = (current as { isStream?: boolean }).isStream ?? false;
  const isSeekable = (current as { isSeekable?: boolean }).isSeekable ?? true;
  const length = (current as { length?: number }).length ?? 0;

  return {
    trackId,
    position: isStream || !isSeekable ? 0 : parlantePlayer.lastKnownPosition,
    paused: player.paused,
    isStream,
    isSeekable,
    length,
  };
};

const getPlayerExceptionDiagnostics = (data: unknown): PlayerExceptionDiagnostics => {
  if (!data || typeof data !== 'object') {
    return { clientErrors: [] };
  }

  const exception = (data as { exception?: unknown }).exception;
  if (!exception || typeof exception !== 'object') {
    return { clientErrors: [] };
  }

  const parsed = exception as {
    message?: string;
    severity?: string;
    cause?: string;
    errors?: unknown;
  };

  const clientErrors = Array.isArray(parsed.errors)
    ? parsed.errors
        .filter((error): error is PlayerExceptionClientError =>
          Boolean(error && typeof error === 'object'),
        )
        .map((error) => ({
          client: error.client,
          message: error.message,
        }))
    : [];

  return {
    message: parsed.message,
    severity: parsed.severity,
    cause: parsed.cause,
    clientErrors,
  };
};

const getTrackDiagnostics = (track: unknown): TrackDiagnostics => {
  if (!track || typeof track !== 'object') return {};
  const t = track as {
    title?: string;
    identifier?: string;
    uri?: string;
    sourceName?: string;
    isStream?: boolean;
    isSeekable?: boolean;
    length?: number;
    info?: {
      title?: string;
      identifier?: string;
      uri?: string;
      sourceName?: string;
      isStream?: boolean;
      isSeekable?: boolean;
      length?: number;
    };
  };

  return {
    title: t.title ?? t.info?.title,
    identifier: t.identifier ?? t.info?.identifier,
    uri: t.uri ?? t.info?.uri,
    sourceName: t.sourceName ?? t.info?.sourceName,
    isStream: t.isStream ?? t.info?.isStream,
    isSeekable: t.isSeekable ?? t.info?.isSeekable,
    length: t.length ?? t.info?.length,
  };
};

const getTrackId = (track: unknown): string => {
  if (!track || typeof track !== 'object') return '';
  const t = track as { identifier?: string; track?: string; info?: { identifier?: string } };
  return t.identifier ?? t.info?.identifier ?? t.track ?? '';
};

const NODE_STATE_NAMES: Record<number, string> = {
  [Constants.State.CONNECTING]: 'CONNECTING',
  [Constants.State.CONNECTED]: 'CONNECTED',
  [Constants.State.DISCONNECTING]: 'DISCONNECTING',
  [Constants.State.DISCONNECTED]: 'DISCONNECTED',
};

/**
 * Compact snapshot of a Shoukaku node for diagnostics. `sessionId` is null
 * while a node is reconnecting — every player REST call then goes to
 * `/sessions/null` and fails with 404. This makes "node down" stalls
 * distinguishable from genuinely stuck tracks in the logs.
 */
const describeNodeState = (node: Node | undefined): Record<string, unknown> => {
  if (!node) {
    return { name: null, state: null, sessionId: null, reconnects: null, wsAlive: false };
  }
  return {
    name: node.name,
    state: NODE_STATE_NAMES[node.state] ?? node.state,
    sessionId: node.sessionId,
    reconnects: node.reconnects,
    wsAlive: Boolean(node.ws),
  };
};

/**
 * Node-recovery watchdog verdict. The local `paused` flag is pre-restart state
 * and can never prove remote health (Shoukaku's resumeByLibrary uses
 * `Promise.allSettled`, so the flag survives silently failed restores). Only
 * real playback progress beyond the baseline confirms recovery; paused
 * players are confirmed by an awaited remote request instead (see
 * `verifyAndReplayIfNeeded`).
 */
export const isNodeRecoveryHealthy = (
  player: Pick<KazagumoPlayer, 'playing' | 'paused' | 'position'>,
  baselinePosition: number,
): boolean => player.playing && player.position > 0 && player.position > baselinePosition;

export function initKazagumo(client: Client): Kazagumo {
  const typedClient = client as unknown as UsingClient;
  const recoveryStates = new Map<string, RecoveryState>();
  const nodeRecoveries = new Map<string, NodeRecoveryEntry>();
  const playbackProgress = new Map<string, PlaybackProgressEntry>();
  const trackRecoveryByGuild = new Map<string, TrackRecoveryState>();
  let lastNodeReaddAt = 0;

  const clearRecoveryState = (guildId: string): void => {
    recoveryStates.delete(guildId);
  };

  const getOrCreateRecoveryState = (guildId: string): RecoveryState => {
    const existing = recoveryStates.get(guildId);
    if (existing) return existing;

    const created: RecoveryState = {
      consecutiveFailures: 0,
      lastFailureAt: 0,
      recovering: false,
    };
    recoveryStates.set(guildId, created);
    return created;
  };

  const registerRecoveryFailure = (guildId: string): number => {
    const state = getOrCreateRecoveryState(guildId);
    const now = Date.now();

    if (now - state.lastFailureAt > RECOVERY_FAILURE_RESET_MS) {
      state.consecutiveFailures = 1;
      state.lastFailureAt = now;
      return state.consecutiveFailures;
    }

    state.consecutiveFailures += 1;
    state.lastFailureAt = now;
    return state.consecutiveFailures;
  };

  const scheduleRecoveryUnlock = (guildId: string, delayMs = RECOVERY_LOCK_MS): void => {
    setTimeout(() => {
      const state = recoveryStates.get(guildId);
      if (!state) return;
      state.recovering = false;
    }, delayMs);
  };

  const getResumeDelayMs = (attempt: number): number => {
    const exponent = Math.max(0, attempt - 1);
    const baseDelay = RECONNECT_RESUME_DELAY_MS * Math.pow(2, exponent);
    const cappedDelay = Math.min(baseDelay, RECONNECT_RESUME_MAX_DELAY_MS);
    const jitter = Math.floor(Math.random() * 1000);
    return cappedDelay + jitter;
  };

  const clearNodeRecovery = (guildId: string): void => {
    const entry = nodeRecoveries.get(guildId);
    if (!entry) return;
    clearTimeout(entry.watchdogTimer);
    nodeRecoveries.delete(guildId);
  };

  const clearPlaybackProgress = (guildId: string): void => {
    playbackProgress.delete(guildId);
  };

  const clearTrackRecovery = (guildId: string): void => {
    trackRecoveryByGuild.delete(guildId);
  };

  const getOrCreateTrackRecovery = (guildId: string, trackId: string): TrackRecoveryState => {
    const existing = trackRecoveryByGuild.get(guildId);
    if (existing && existing.trackId === trackId) return existing;

    const created: TrackRecoveryState = {
      trackId,
      sameTrackReplayPending: false,
      sameTrackReplayUsed: false,
      replayDisabled: false,
      graceUntil: 0,
      lastReplayAt: 0,
    };
    trackRecoveryByGuild.set(guildId, created);
    return created;
  };

  const shouldSuppressTrackReplay = (guildId: string, trackId: string): boolean => {
    if (nodeRecoveries.has(guildId)) return true;
    if (recoveryStates.get(guildId)?.recovering) return true;
    const state = trackRecoveryByGuild.get(guildId);
    if (!state || state.trackId !== trackId) return false;
    if (state.replayDisabled) return true;
    return Date.now() < state.graceUntil;
  };

  const setTrackRecoveryGrace = (guildId: string, trackId: string, graceMs: number): void => {
    const state = getOrCreateTrackRecovery(guildId, trackId);
    state.graceUntil = Math.max(state.graceUntil, Date.now() + graceMs);
  };

  const markTrackReplayDisabled = (guildId: string, trackId: string): void => {
    const state = getOrCreateTrackRecovery(guildId, trackId);
    state.sameTrackReplayPending = false;
    state.sameTrackReplayUsed = true;
    state.replayDisabled = true;
  };

  const releasePendingSameTrackReplay = (guildId: string, trackId: string): void => {
    const state = trackRecoveryByGuild.get(guildId);
    if (!state || state.trackId !== trackId) return;
    state.sameTrackReplayPending = false;
  };

  const markSameTrackReplayExecuted = (guildId: string, trackId: string): void => {
    const state = getOrCreateTrackRecovery(guildId, trackId);
    state.sameTrackReplayPending = false;
    state.sameTrackReplayUsed = true;
    state.lastReplayAt = Date.now();
    state.graceUntil = Math.max(
      state.graceUntil,
      state.lastReplayAt + PLAYBACK_STALL_RECOVERY_COOLDOWN_MS,
    );
  };

  const skipCurrentOrDestroy = async (
    player: KazagumoPlayer,
    reason: string,
    trackId: string,
  ): Promise<void> => {
    const guildId = player.guildId;
    const parlantePlayer = playersManager.get(guildId);
    parlantePlayer?.cancelResumeTimer();
    markTrackReplayDisabled(guildId, trackId);
    clearPlaybackProgress(guildId);
    warn(`[${guildId}] ${reason}: terminal recovery for track=${trackId || 'unknown'}`);

    if (player.queue.size > 0) {
      try {
        await player.skip();
      } catch (err) {
        // NodeLink can be mid-restart when a stall is detected; skip() then
        // rejects and would otherwise surface as an unhandled rejection.
        debug(`[${guildId}] ${reason}: skip failed`, err);
      }
      return;
    }

    try {
      await destroyPlayer(kazagumo, guildId);
    } catch (err) {
      debug(`[${guildId}] ${reason}: teardown failed`, err);
    }
  };

  const tryScheduleSameTrackReplay = async (
    player: KazagumoPlayer,
    parlantePlayer: ParlantePlayer,
    snapshot: ResumeSnapshot,
    source: string,
  ): Promise<'scheduled' | 'suppressed' | 'terminal'> => {
    const guildId = player.guildId;
    const state = getOrCreateTrackRecovery(guildId, snapshot.trackId);
    if (shouldSuppressTrackReplay(guildId, snapshot.trackId)) {
      debug(`[${guildId}] ${source}: replay suppressed`, { trackId: snapshot.trackId });
      return 'suppressed';
    }

    if (state.sameTrackReplayPending) {
      state.sameTrackReplayPending = false;
    }

    if (state.sameTrackReplayUsed) {
      state.replayDisabled = true;
      warn(
        `[${guildId}] ${source}: repeat same-track recovery denied for track=${snapshot.trackId}`,
      );
      return 'terminal';
    }

    state.sameTrackReplayPending = true;
    state.lastReplayAt = Date.now();
    state.graceUntil = state.lastReplayAt + PLAYBACK_STALL_RECOVERY_COOLDOWN_MS;
    const nonce = parlantePlayer.scheduleResumeTimer(getResumeDelayMs(1), () => {
      void attemptResume(guildId, nonce, snapshot, 1, true);
    });
    return 'scheduled';
  };

  const startNodeRecoveryWatchdog = (guildId: string, snapshot: ResumeSnapshot): void => {
    clearNodeRecovery(guildId);

    const timer = setTimeout(() => {
      void verifyAndReplayIfNeeded(guildId);
    }, NODE_RECOVERY_VERIFY_DELAY_MS);

    nodeRecoveries.set(guildId, {
      snapshot,
      watchdogTimer: timer,
      replayAttempts: 0,
      baselinePosition: snapshot.position,
    });
  };

  async function verifyAndReplayIfNeeded(guildId: string): Promise<void> {
    const entry = nodeRecoveries.get(guildId);
    if (!entry) return;

    const kPlayer = kazagumo.players.get(guildId);
    if (!kPlayer) {
      debug(`[${guildId}] Node recovery watchdog: player gone, clearing`);
      nodeRecoveries.delete(guildId);
      return;
    }

    if (isNodeRecoveryHealthy(kPlayer, entry.baselinePosition)) {
      debug(
        `[${guildId}] Node recovery watchdog: player ${kPlayer.paused ? 'paused' : 'playing'}, recovery succeeded`,
      );
      nodeRecoveries.delete(guildId);
      return;
    }

    if (kPlayer.state === PlayerState.DESTROYING || kPlayer.state === PlayerState.DESTROYED) {
      debug(`[${guildId}] Node recovery watchdog: player destroying, clearing`);
      nodeRecoveries.delete(guildId);
      return;
    }

    const current = kPlayer.queue.current;
    if (!current) {
      debug(`[${guildId}] Node recovery watchdog: no current track, clearing`);
      nodeRecoveries.delete(guildId);
      return;
    }

    const currentTrackId = getTrackId(current);

    // Node must be CONNECTED with a live session: PATCHing while it is
    // reconnecting goes to /sessions/null and is guaranteed to fail. Wait for
    // the node instead — the player must survive the outage and resume once
    // NodeLink is back. Bounded: after a few checks the entry clears and the
    // stall watchdog's own (node-guarded) resume path takes over.
    const node = kPlayer.shoukaku?.node;
    if (!node || node.state !== Constants.State.CONNECTED || !node.sessionId) {
      entry.replayAttempts += 1;
      if (entry.replayAttempts > NODE_RECOVERY_MAX_REPLAY_ATTEMPTS) {
        warn(
          `[${guildId}] Node recovery: node not ready after ${NODE_RECOVERY_MAX_REPLAY_ATTEMPTS} checks, pausing recovery (player kept alive)`,
        );
        nodeRecoveries.delete(guildId);
        return;
      }
      debug(`[${guildId}] Node recovery: node not ready, rechecking`, {
        ...describeNodeState(node),
      });
      entry.watchdogTimer = setTimeout(() => {
        void verifyAndReplayIfNeeded(guildId);
      }, NODE_RECOVERY_REPLAY_INTERVAL_MS);
      return;
    }

    entry.replayAttempts += 1;
    if (entry.replayAttempts > NODE_RECOVERY_MAX_REPLAY_ATTEMPTS) {
      warn(
        `[${guildId}] Node recovery: exhausted ${NODE_RECOVERY_MAX_REPLAY_ATTEMPTS} replay attempts, giving up`,
      );
      if (currentTrackId === entry.snapshot.trackId) {
        markTrackReplayDisabled(guildId, currentTrackId);
        // Paused players get no terminal skip/destroy: the user paused on
        // purpose, the local flag is unverified, and the track/queue must
        // survive until they act.
        if (!kPlayer.paused) {
          void skipCurrentOrDestroy(kPlayer, 'node recovery exhausted', currentTrackId);
        }
      }
      nodeRecoveries.delete(guildId);
      return;
    }

    if (currentTrackId !== entry.snapshot.trackId) {
      debug(`[${guildId}] Node recovery watchdog: track changed, clearing`);
      nodeRecoveries.delete(guildId);
      return;
    }

    const rewindPosition = Math.max(0, entry.snapshot.position - NODE_RECOVERY_REPLAY_REWIND_MS);
    warn(
      `[${guildId}] Node recovery: resumeByLibrary didn't restore playback, replaying from ${rewindPosition}ms (attempt ${entry.replayAttempts}/${NODE_RECOVERY_MAX_REPLAY_ATTEMPTS})`,
    );

    try {
      await kPlayer.shoukaku.resume({
        position: rewindPosition,
        paused: kPlayer.paused,
      });

      // The request was awaited: a newer recovery entry (or a rebound player/
      // wrapper) may have replaced this one meanwhile. Never delete or
      // reschedule recovery state on behalf of a stale completion.
      if (nodeRecoveries.get(guildId) !== entry) return;
      if (kazagumo.players.get(guildId) !== kPlayer) return;
      if (playersManager.get(guildId)?.kazagumoPlayer !== kPlayer) return;

      // A paused player never advances position, so its local flag can never
      // prove remote health. A successful remote request is the confirmation:
      // the player (and its paused track) now exists on the node, so clear the
      // watchdog without requiring progress and without any later skip/destroy.
      if (kPlayer.paused) {
        debug(
          `[${guildId}] Node recovery watchdog: paused player confirmed by remote request, recovery succeeded`,
        );
        nodeRecoveries.delete(guildId);
        return;
      }

      entry.baselinePosition = Math.max(0, kPlayer.position, rewindPosition);

      entry.watchdogTimer = setTimeout(() => {
        void verifyAndReplayIfNeeded(guildId);
      }, NODE_RECOVERY_REPLAY_INTERVAL_MS);
    } catch (err) {
      warn(`[${guildId}] Node recovery: replay attempt failed`, err);
      // A stale failure must not reschedule for (or overwrite) a newer entry.
      if (nodeRecoveries.get(guildId) !== entry) return;
      if (kazagumo.players.get(guildId) !== kPlayer) return;
      if (playersManager.get(guildId)?.kazagumoPlayer !== kPlayer) return;
      entry.watchdogTimer = setTimeout(() => {
        void verifyAndReplayIfNeeded(guildId);
      }, NODE_RECOVERY_REPLAY_INTERVAL_MS);
    }
  }

  const recoverFromPlaybackFailure = async (
    player: KazagumoPlayer,
    context?: RecoveryContext,
  ): Promise<void> => {
    const guildId = player.guildId;
    const state = getOrCreateRecoveryState(guildId);

    if (state.recovering) {
      debug(`[${guildId}] Recovery already in progress; skipping duplicate recovery attempt`);
      return;
    }

    const failureCount = registerRecoveryFailure(guildId);
    state.recovering = true;

    debug(`[${guildId}] Recovery diagnostics`, {
      trigger: context?.trigger,
      reason: context?.reason,
      cause: context?.cause,
      severity: context?.severity,
      failureCount,
      threshold:
        context?.trigger === 'playerStuck'
          ? STUCK_RECOVERY_RESET_THRESHOLD
          : RECOVERY_RESET_THRESHOLD,
      playerState: player.state,
      playing: player.playing,
      paused: player.paused,
      queueSize: player.queue.size,
      hasCurrentTrack: Boolean(player.queue.current),
      track: getTrackDiagnostics(player.queue.current),
    });

    try {
      const resetThreshold =
        context?.trigger === 'playerStuck'
          ? STUCK_RECOVERY_RESET_THRESHOLD
          : RECOVERY_RESET_THRESHOLD;

      if (failureCount < resetThreshold && player.queue.current) {
        if (context?.trigger === 'playerStuck') {
          const backoffAttempt = Math.min(failureCount, RECONNECT_RESUME_MAX_RETRIES);
          const unlockDelay = getResumeDelayMs(backoffAttempt);
          warn(
            `[${guildId}] Recovery attempt #${failureCount}: player is stuck but keeping current track while NodeLink retries internally`,
          );
          scheduleRecoveryUnlock(guildId, unlockDelay);
          return;
        }

        if (isTransientVoiceException(context)) {
          warn(
            `[${guildId}] Recovery attempt #${failureCount}: transient voice exception detected (${context?.cause ?? 'unknown'}), waiting for reconnect instead of skipping`,
          );
          scheduleRecoveryUnlock(guildId, getResumeDelayMs(1));
          return;
        }
        debug(
          `[${guildId}] Recovery attempt #${failureCount}: skipping current track (${context?.trigger ?? 'unknown'})`,
        );
        scheduleRecoveryUnlock(guildId);
        player.skip();
        return;
      }

      warn(
        `[${guildId}] Recovery attempt #${failureCount}: resetting player (${context?.trigger ?? 'unknown'})`,
      );
      scheduleRecoveryUnlock(guildId);
      await destroyPlayer(kazagumo, guildId);
    } catch (err) {
      scheduleRecoveryUnlock(guildId);
      debug(`[${guildId}] Recovery flow failed`, err);
    }
  };

  const options: ShoukakuOptions = {
    moveOnDisconnect: true,
    // Server-side session resume is disabled: after a NodeLink restart the old
    // session id is gone, Shoukaku sends it anyway, NodeLink rejects it and the
    // client ends up with sessionId=null (player PATCHes go to /sessions/null).
    // resumeByLibrary recovers playback client-side instead.
    resume: false,
    // Client-side fallback: if the node was fully restarted (json.resumed === false)
    // Shoukaku will call player.resume() for every known player so we get playerStart.
    resumeByLibrary: true,
    // 6 × 10s = 60s reconnect budget; aligned with expected ISP flaps (< 1 min).
    reconnectTries: 6,
    reconnectInterval: 10,
  };

  const kazagumo = new Kazagumo(
    {
      defaultSearchEngine: 'youtube',
      send: (guildId, payload) =>
        client.gateway.send(client.gateway.calculateShardId(guildId), payload),
    },
    new Connectors.Seyfert(client),
    [],
    options,
  );

  setInterval(() => {
    const now = Date.now();

    for (const [guildId, kPlayer] of kazagumo.players) {
      if (kPlayer.state === PlayerState.DESTROYING || kPlayer.state === PlayerState.DESTROYED) {
        continue;
      }

      const current = kPlayer.queue.current;
      if (!current || kPlayer.paused || !kPlayer.playing || !kPlayer.voiceId) {
        continue;
      }

      const parlantePlayer = playersManager.get(guildId);
      if (!parlantePlayer) continue;

      const position = kPlayer.position;
      const progress = playbackProgress.get(guildId);
      if (!progress) {
        playbackProgress.set(guildId, {
          lastPosition: position,
          lastProgressAt: now,
          lastRecoveryAt: 0,
        });
        continue;
      }

      if (position > progress.lastPosition) {
        progress.lastPosition = position;
        progress.lastProgressAt = now;
        continue;
      }

      const stalledForMs = now - progress.lastProgressAt;
      const cooldownMs = now - progress.lastRecoveryAt;
      if (
        stalledForMs < PLAYBACK_STALL_THRESHOLD_MS ||
        cooldownMs < PLAYBACK_STALL_RECOVERY_COOLDOWN_MS ||
        shouldSuppressTrackReplay(guildId, getTrackId(current))
      ) {
        continue;
      }

      const snapshot = buildResumeSnapshot(kPlayer, parlantePlayer);
      if (!snapshot) continue;

      // Key diagnostic: a stall with the node CONNECTING/DISCONNECTED or a
      // null sessionId is node death (NodeLink restart), not a stuck track —
      // the replay that follows is futile until the node is back.
      const node = kPlayer.shoukaku?.node;
      debug(`[${guildId}] Playback watchdog stall diagnostics`, {
        position,
        stalledForMs,
        node: describeNodeState(node),
        playerState: kPlayer.state,
        playing: kPlayer.playing,
        paused: kPlayer.paused,
        queueSize: kPlayer.queue.size,
        track: getTrackDiagnostics(current),
      });

      progress.lastRecoveryAt = now;
      progress.lastProgressAt = now;
      void tryScheduleSameTrackReplay(kPlayer, parlantePlayer, snapshot, 'watchdog').then(
        (status) => {
          if (status === 'scheduled') {
            warn(
              `[${guildId}] Playback watchdog: stalled at ${position}ms for ${stalledForMs}ms — scheduling same-track replay`,
            );
            return;
          }

          if (status === 'terminal') {
            warn(
              `[${guildId}] Playback watchdog: stalled at ${position}ms for ${stalledForMs}ms — terminal recovery`,
            );
            void skipCurrentOrDestroy(kPlayer, 'watchdog repeated stall', snapshot.trackId);
            return;
          }

          debug(
            `[${guildId}] Playback watchdog: stalled at ${position}ms for ${stalledForMs}ms — replay suppressed`,
          );
        },
      );
    }
  }, PLAYBACK_STALL_WATCHDOG_INTERVAL_MS);

  kazagumo.shoukaku.on('ready', (name, resumed, resumedByLibrary) => {
    info(messages.debug.nodeLinkConnected(name));

    if (resumed) {
      debug(`[Shoukaku] Node ${name} resumed server-side session — no recovery needed`);
      return;
    }

    const readyNode = kazagumo.shoukaku.nodes.get(name);
    debug(
      `[Shoukaku] Node ${name} connected with NEW session (resumed=false, resumedByLibrary=${resumedByLibrary})`,
      readyNode ? describeNodeState(readyNode) : undefined,
    );

    // Players keep a hard reference to the Shoukaku Node they were created on.
    // After a NodeLink crash the pool entry may be a NEW Node object (addNode
    // replaced it while the old one was still reconnecting) — players still
    // bound to the old, sessionless node would send every recovery PATCH to
    // /sessions/null. Rebind them to the live node so resume()/destroy() hit
    // the real session. The stale node is deliberately left alone: its
    // once('disconnect') handler deletes the pool entry BY NAME, so triggering
    // it would remove this fresh node.
    if (readyNode) {
      let rebound = 0;
      for (const [guildId, kPlayer] of kazagumo.players) {
        const shoukakuPlayer = kPlayer.shoukaku;
        if (!shoukakuPlayer || shoukakuPlayer.node === readyNode) continue;
        if (kPlayer.state === PlayerState.DESTROYING || kPlayer.state === PlayerState.DESTROYED) {
          continue;
        }
        debug(
          `[${guildId}] Rebinding player to live node '${name}' (was bound to stale node '${shoukakuPlayer.node.name}')`,
        );
        shoukakuPlayer.node = readyNode;
        rebound += 1;
      }
      if (rebound > 0) {
        warn(`[Shoukaku] Rebound ${rebound} player(s) to live node '${name}' after reconnect`);
      }
    }

    if (!resumedByLibrary) return;

    for (const [guildId, kPlayer] of kazagumo.players) {
      const parlantePlayer = playersManager.get(guildId);
      if (!parlantePlayer) continue;

      const snapshot = buildResumeSnapshot(kPlayer, parlantePlayer);
      if (!snapshot) {
        debug(`[${guildId}] Node recovery: no snapshot available, skipping watchdog`);
        continue;
      }

      info(
        `[${guildId}] Node recovery: starting watchdog (track=${snapshot.trackId}, position=${snapshot.position}ms)`,
      );
      startNodeRecoveryWatchdog(guildId, snapshot);
    }
  });
  kazagumo.shoukaku.on('error', (name, err) => {
    logError(messages.debug.nodeLinkError(name), err);
    const node = kazagumo.shoukaku.nodes.get(name);
    if (node) {
      debug(`[Shoukaku] Node '${name}' error diagnostics`, describeNodeState(node));
    }
  });
  kazagumo.shoukaku.on('close', (name, code, reason) => {
    warn(messages.debug.nodeLinkClosed(name, code, reason ?? ''));
    const node = kazagumo.shoukaku.nodes.get(name);
    if (node) {
      debug(`[Shoukaku] Node '${name}' close diagnostics`, describeNodeState(node));
    }
  });
  kazagumo.shoukaku.on('disconnect', (name) => {
    warn(messages.debug.nodeLinkDisconnected(name));

    // Shoukaku drops the node from the pool once its reconnect budget is
    // exhausted (or a stale node's disconnect handler deleted a replacement by
    // name). Nothing would reconnect until the next search — re-add
    // proactively so players can resume as soon as NodeLink is back.
    if (name !== buildNodeConfig().name) return;
    if (kazagumo.shoukaku.nodes.has(name)) return;

    const now = Date.now();
    if (now - lastNodeReaddAt < NODE_READD_COOLDOWN_MS) return;
    lastNodeReaddAt = now;

    warn(`[Shoukaku] Node '${name}' left the pool; re-adding via addNode`);
    kazagumo.shoukaku.addNode(buildNodeConfig());
  });

  kazagumo.shoukaku.on('raw', (_name, json) => {
    const event = json as {
      op?: string;
      type?: string;
      guildId?: string;
      mixId?: string;
      thresholdMs?: number;
      reason?: string;
    };
    if (event.op !== 'event') return;

    if (event.type === 'MixEndedEvent') {
      if (!event.guildId || !event.mixId) return;
      playersManager.get(event.guildId)?.onMixEnded(event.mixId);
      return;
    }

    if (event.type !== 'TrackStuckEvent' || !event.guildId) return;

    warn(
      `[${event.guildId}] raw TrackStuckEvent received (thresholdMs=${event.thresholdMs ?? 'n/a'}, reason=${event.reason ?? 'unknown'})`,
    );

    const kPlayer = kazagumo.players.get(event.guildId);
    const parlantePlayer = playersManager.get(event.guildId);
    if (!kPlayer || !parlantePlayer) return;

    const snapshot = buildResumeSnapshot(kPlayer, parlantePlayer);
    if (!snapshot) return;

    debug(`[${event.guildId}] raw TrackStuckEvent diagnostics`, { snapshot, event });
  });

  kazagumo.on('playerStart', async (player, track) => {
    try {
      clearRecoveryState(player.guildId);
      clearNodeRecovery(player.guildId);
      debug(`[${player.guildId}] playerStart diagnostics`, {
        playerState: player.state,
        playing: player.playing,
        paused: player.paused,
        queueSize: player.queue.size,
        track: getTrackDiagnostics(track),
      });
      const parlantePlayer = playersManager.get(player.guildId);
      if (!parlantePlayer) return;
      clearPlaybackProgress(player.guildId);
      parlantePlayer.cancelIdleTimer();
      // Scope position tracking to this track and cancel any in-flight resume
      // from a previous close event — a new track start is authoritative.
      const trackId = getTrackId(track);
      getOrCreateTrackRecovery(player.guildId, trackId);
      parlantePlayer.resetPositionTracking(trackId);
      const title = getTrackTitle(track);
      const author =
        (track as { author?: string }).author ??
        (track as { info?: { author?: string } }).info?.author ??
        'Unknown Artist';
      await parlantePlayer.setVoiceStatus(typedClient, `♪ ${title} - ${author}`);
      await parlantePlayer.sendOrUpdateNowPlaying(typedClient, true);
      parlantePlayer.startRefreshInterval(typedClient);
    } catch (err) {
      debug(`[${player.guildId}] Error in playerStart handler`, err);
    }
  });
  kazagumo.on('playerUpdate', (player, data) => {
    const parlantePlayer = playersManager.get(player.guildId);
    if (!parlantePlayer) return;
    const current = player.queue.current;
    if (!current) return;
    // Identify the track by its encoded string (always present and stable).
    const trackId = getTrackId(current);
    const position = data.state.position;
    parlantePlayer.recordPosition(trackId, position);

    const now = Date.now();
    const existing = playbackProgress.get(player.guildId);
    if (!existing) {
      playbackProgress.set(player.guildId, {
        lastPosition: position,
        lastProgressAt: now,
        lastRecoveryAt: 0,
      });
      return;
    }

    if (position > existing.lastPosition) {
      existing.lastPosition = position;
      existing.lastProgressAt = now;
    }
  });
  kazagumo.on('playerEmpty', async (player) => {
    try {
      clearNodeRecovery(player.guildId);
      clearPlaybackProgress(player.guildId);
      clearTrackRecovery(player.guildId);
      const parlantePlayer = playersManager.get(player.guildId);
      if (!parlantePlayer || parlantePlayer.kazagumoPlayer !== player) return;
      // Queue is empty — any pending reconnect resume would replay a track that
      // has already ended normally, so cancel it.
      parlantePlayer.cancelResumeTimer();
      parlantePlayer.stopRefreshInterval();
      await parlantePlayer.cleanupMixLayers();
      // Revalidate before touching messages/status — a new track may have
      // started (or a new player been created) while we awaited cleanup.
      if (kazagumo.players.get(player.guildId) !== player) return;
      if (playersManager.get(player.guildId)?.kazagumoPlayer !== player) return;
      await parlantePlayer.sendQueueEnded(typedClient);
      await parlantePlayer.clearVoiceStatus(typedClient);
      const settings = await getGuildSettings(player.guildId);
      const timeoutMs = settings.secondsToWaitAfterQueueEmpties * 1000;
      // The player may have resumed while we fetched settings — never arm a
      // stale idle timer that would tear down live playback.
      if (kazagumo.players.get(player.guildId) !== player) return;
      if (playersManager.get(player.guildId)?.kazagumoPlayer !== player) return;
      if (player.playing || player.paused) return;
      if (player.queue.current || player.queue.size > 0) return;
      parlantePlayer.startIdleTimer(typedClient, timeoutMs);
    } catch (err) {
      debug(`[${player.guildId}] Error in playerEmpty handler`, err);
    }
  });
  kazagumo.on('playerDestroy', async (player) => {
    try {
      const parlantePlayer = playersManager.get(player.guildId);
      // Stale event: this event belongs to an older Kazagumo player that was
      // torn down after the wrapper was rebound to a newer player. It must not
      // clear recovery state or drop the live player's wrapper.
      if (!parlantePlayer || parlantePlayer.kazagumoPlayer !== player) {
        debug(`[${player.guildId}] playerDestroy ignored for stale player`);
        return;
      }

      const hadNodeRecovery = nodeRecoveries.has(player.guildId);
      clearRecoveryState(player.guildId);
      clearNodeRecovery(player.guildId);
      clearPlaybackProgress(player.guildId);
      clearTrackRecovery(player.guildId);

      if (hadNodeRecovery) {
        warn(
          `[${player.guildId}] playerDestroy during node recovery — Shoukaku destroyed player (likely missing voice data after node restart)`,
        );
      }

      // Cleanup first: it inspects the active mix handles to reach the origin
      // session that created each layer after a session rollover — destroy()
      // would have already wiped that metadata.
      await parlantePlayer.cleanupMixLayers();

      // Recheck identity after every await: a newer Kazagumo player may have
      // been created and the shared wrapper rebound while we awaited — the
      // old event must never mutate the new wrapper's voice status or card.
      if (playersManager.get(player.guildId)?.kazagumoPlayer !== player) return;

      // Local teardown only after remote mix layers are gone and the wrapper
      // is still the one this event belongs to.
      parlantePlayer.destroy();

      if (playersManager.get(player.guildId)?.kazagumoPlayer !== player) return;
      await parlantePlayer.clearVoiceStatus(typedClient);

      if (playersManager.get(player.guildId)?.kazagumoPlayer !== player) return;
      await parlantePlayer.deleteNowPlayingMessage(typedClient);

      // Re-check identity: a newer player may have been created while we
      // awaited cleanup — never drop its wrapper.
      if (playersManager.get(player.guildId)?.kazagumoPlayer === player) {
        playersManager.delete(player.guildId);
      }
    } catch (err) {
      debug(`[${player.guildId}] Error in playerDestroy handler`, err);
    }
  });
  kazagumo.on('playerClosed', (player, data) => {
    try {
      const parlantePlayer = playersManager.get(player.guildId);
      if (!parlantePlayer) return;

      parlantePlayer.onVoiceConnectionClosed();
      clearPlaybackProgress(player.guildId);

      const snapshot = buildResumeSnapshot(player, parlantePlayer);
      if (!snapshot) {
        debug(`[${player.guildId}] playerClosed — no snapshot available, skipping resume`);
        return;
      }

      setTrackRecoveryGrace(player.guildId, snapshot.trackId, PLAYBACK_STALL_RECOVERY_COOLDOWN_MS);

      debug(`[${player.guildId}] playerClosed diagnostics`, {
        code: data.code,
        byRemote: data.byRemote,
        snapshot,
        playerState: player.state,
        playing: player.playing,
        paused: player.paused,
        queueSize: player.queue.size,
        track: getTrackDiagnostics(player.queue.current),
      });

      debug(
        `[${player.guildId}] playerClosed (code=${data.code}, byRemote=${data.byRemote}) — scheduling resume from ${snapshot.position}ms`,
      );

      // Schedule the single-flight resume loop. scheduleResumeTimer cancels
      // any prior pending resume before creating the new one.
      const nonce = parlantePlayer.scheduleResumeTimer(getResumeDelayMs(1), () => {
        void attemptResume(player.guildId, nonce, snapshot, 1);
      });
    } catch (err) {
      debug(`[${player.guildId}] Error in playerClosed handler`, err);
    }
  });

  async function attemptResume(
    guildId: string,
    nonce: number,
    snapshot: ResumeSnapshot,
    attempt: number,
    countsAsSameTrackReplay = false,
  ): Promise<void> {
    try {
      const releasePendingReplay = (): void => {
        if (!countsAsSameTrackReplay) return;
        releasePendingSameTrackReplay(guildId, snapshot.trackId);
      };

      const parlantePlayer = playersManager.get(guildId);
      if (!parlantePlayer) {
        releasePendingReplay();
        return;
      }

      // Nonce check: if a newer resume was scheduled (e.g. second close event,
      // or a new track started), this attempt is stale — abort.
      if (!parlantePlayer.isResumeNonceCurrent(nonce)) {
        debug(`[${guildId}] Resume attempt #${attempt} superseded, aborting`);
        releasePendingReplay();
        return;
      }

      const kPlayer = kazagumo.players.get(guildId);
      if (!kPlayer) {
        debug(`[${guildId}] Resume attempt #${attempt} — player gone, aborting`);
        releasePendingReplay();
        return;
      }

      // If the player is being destroyed or the queue was cleared, don't resume.
      if (kPlayer.state === PlayerState.DESTROYING || kPlayer.state === PlayerState.DESTROYED) {
        debug(`[${guildId}] Resume attempt #${attempt} — player destroying, aborting`);
        releasePendingReplay();
        return;
      }

      // If the current track changed (user skipped while we were waiting), abort.
      const current = kPlayer.queue.current;
      if (!current) {
        debug(`[${guildId}] Resume attempt #${attempt} — queue empty, aborting`);
        releasePendingReplay();
        return;
      }
      const currentTrackId = getTrackId(current);
      if (currentTrackId !== snapshot.trackId) {
        debug(`[${guildId}] Resume attempt #${attempt} — track changed, aborting`);
        releasePendingReplay();
        return;
      }

      const naturallyRecovered =
        kPlayer.playing &&
        !kPlayer.paused &&
        kPlayer.position > snapshot.position + RESUME_NATURAL_PROGRESS_MIN_MS;
      if (naturallyRecovered) {
        debug(`[${guildId}] Resume attempt #${attempt} — playback already recovered naturally`, {
          snapshotPosition: snapshot.position,
          currentPosition: kPlayer.position,
        });
        releasePendingReplay();
        return;
      }

      // Node must be CONNECTED with a live session. While it is reconnecting,
      // sessionId is null and every PATCH goes to /sessions/null (404, NodeLink
      // has no such session) — defer instead of burning the retry budget on
      // guaranteed failures. NodeLink recovery restores the player on ready.
      const shoukakuPlayer = kPlayer.shoukaku;
      const node = shoukakuPlayer?.node;
      const nodeReady = Boolean(node && node.state === Constants.State.CONNECTED && node.sessionId);
      if (!nodeReady) {
        debug(`[${guildId}] Resume attempt #${attempt} — node not ready, deferring`, {
          ...describeNodeState(node),
          attempt,
          maxRetries: RECONNECT_RESUME_MAX_RETRIES,
          track: getTrackDiagnostics(current),
        });
        if (attempt >= RECONNECT_RESUME_MAX_RETRIES) {
          warn(`[${guildId}] Resume: node not ready after ${attempt} attempts, giving up`);
          releasePendingReplay();
          return;
        }
        setTrackRecoveryGrace(guildId, snapshot.trackId, PLAYBACK_STALL_RECOVERY_COOLDOWN_MS);
        const retryNonce = parlantePlayer.scheduleResumeTimer(getResumeDelayMs(attempt + 1), () => {
          void attemptResume(guildId, retryNonce, snapshot, attempt + 1, countsAsSameTrackReplay);
        });
        return;
      }

      setTrackRecoveryGrace(guildId, snapshot.trackId, PLAYBACK_STALL_RECOVERY_COOLDOWN_MS);

      // Check that the voice connection is ready. NodeLink signals readiness via
      // playerUpdate with state.connected = true; we use the bot's voice state as
      // a proxy since Shoukaku doesn't expose connection state directly here.
      const voiceReady = Boolean(kPlayer.voiceId);
      if (!voiceReady) {
        debug(`[${guildId}] Resume voice readiness diagnostics`, {
          attempt,
          maxRetries: RECONNECT_RESUME_MAX_RETRIES,
          voiceId: kPlayer.voiceId,
          state: kPlayer.state,
          playing: kPlayer.playing,
          paused: kPlayer.paused,
          queueSize: kPlayer.queue.size,
          track: getTrackDiagnostics(current),
        });
        if (attempt >= RECONNECT_RESUME_MAX_RETRIES) {
          warn(`[${guildId}] Resume: voice not ready after ${attempt} attempts, giving up`);
          releasePendingReplay();
          return;
        }
        debug(`[${guildId}] Resume attempt #${attempt} — voice not ready, retrying`);
        setTrackRecoveryGrace(guildId, snapshot.trackId, PLAYBACK_STALL_RECOVERY_COOLDOWN_MS);
        const retryNonce = parlantePlayer.scheduleResumeTimer(getResumeDelayMs(attempt + 1), () => {
          void attemptResume(guildId, retryNonce, snapshot, attempt + 1, countsAsSameTrackReplay);
        });
        return;
      }

      // Clamp position to valid range: at least 0 and at least 1s before the
      // end so we don't land exactly on the track-end boundary.
      const safeLength = snapshot.length > 0 ? snapshot.length : 0;
      const position =
        safeLength > 0
          ? Math.max(0, Math.min(snapshot.position, safeLength - 1000))
          : snapshot.position;

      debug(`[${guildId}] Resume attempt #${attempt} — replaying from ${position}ms`);
      if (countsAsSameTrackReplay) {
        markSameTrackReplayExecuted(guildId, snapshot.trackId);
      }

      // player.shoukaku.resume() replays the track using NodeLink's stored
      // player state (track, volume, filters) overridden with our position and
      // paused flag — no re-resolve, no queue mutation.
      debug(`[${guildId}] Resume request diagnostics`, {
        attempt,
        nonce,
        position,
        paused: snapshot.paused,
        track: getTrackDiagnostics(current),
      });
      await kPlayer.shoukaku.resume({ position, paused: snapshot.paused });
    } catch (err) {
      debug(`[${guildId}] Resume attempt #${attempt} error`, err);
      const parlantePlayer = playersManager.get(guildId);
      if (!parlantePlayer) return;
      if (!parlantePlayer.isResumeNonceCurrent(nonce)) return;
      if (attempt >= RECONNECT_RESUME_MAX_RETRIES) {
        warn(`[${guildId}] Resume: failed after ${attempt} attempts, giving up`);
        return;
      }
      setTrackRecoveryGrace(guildId, snapshot.trackId, PLAYBACK_STALL_RECOVERY_COOLDOWN_MS);
      const retryNonce = parlantePlayer.scheduleResumeTimer(getResumeDelayMs(attempt + 1), () => {
        void attemptResume(guildId, retryNonce, snapshot, attempt + 1, countsAsSameTrackReplay);
      });
    }
  }

  kazagumo.on('playerResumed', (player) => {
    debug(`[${player.guildId}] playerResumed — Shoukaku resume() succeeded`);
    clearRecoveryState(player.guildId);
    // Don't clear node recovery here — the watchdog verifies actual playback,
    // not just the REST call succeeding. The playing → idle bug means the PATCH
    // can succeed without audio actually flowing.
  });

  kazagumo.on('playerException', (player, data) => {
    try {
      const details = getPlayerExceptionDiagnostics(data);
      const reason = details.message;
      const causePart = details.cause ? ` (cause: ${details.cause})` : '';
      const severityPart = details.severity ? ` [${details.severity}]` : '';
      const recoveryContext: RecoveryContext = {
        trigger: 'playerException',
        reason,
        cause: details.cause,
        severity: details.severity,
      };
      const transient = isTransientVoiceException(recoveryContext);
      warn(
        `[${player.guildId}] Player exception${severityPart}: ${reason ?? 'Unknown'}${causePart}`,
      );
      debug(`[${player.guildId}] playerException diagnostics`, {
        reason,
        severity: details.severity,
        cause: details.cause,
        clientErrors: details.clientErrors,
        playerState: player.state,
        playing: player.playing,
        paused: player.paused,
        queueSize: player.queue.size,
        track: getTrackDiagnostics(player.queue.current),
        rawData: data,
      });

      const parlantePlayer = playersManager.get(player.guildId);
      if (parlantePlayer) {
        if (!transient) {
          const current = player.queue.current;
          const title = getTrackTitle(current, reason ?? 'Unknown Track');
          parlantePlayer.sendAutoDeleteMessage(
            typedClient,
            messages.player.trackLoadFailed(escapeDiscordMarkdown(title)),
          );
        } else {
          const snapshot = buildResumeSnapshot(player, parlantePlayer);
          if (snapshot) {
            debug(`[${player.guildId}] Transient exception — scheduling resume recovery`);
            setTrackRecoveryGrace(
              player.guildId,
              snapshot.trackId,
              PLAYBACK_STALL_RECOVERY_COOLDOWN_MS,
            );
            const nonce = parlantePlayer.scheduleResumeTimer(getResumeDelayMs(1), () => {
              void attemptResume(player.guildId, nonce, snapshot, 1);
            });
          }
        }
      }

      void recoverFromPlaybackFailure(player, recoveryContext);
    } catch (err) {
      debug(`[${player.guildId}] Error in playerException handler`, err);
    }
  });
  kazagumo.on('playerStuck', (player, data) => {
    try {
      const details = data as { thresholdMs?: number; reason?: string } | undefined;
      warn(
        `[${player.guildId}] Player stuck (thresholdMs=${details?.thresholdMs ?? 'n/a'}, reason=${details?.reason ?? 'unknown'})`,
      );
      debug(`[${player.guildId}] playerStuck diagnostics`, {
        thresholdMs: details?.thresholdMs,
        reason: details?.reason,
        playerState: player.state,
        playing: player.playing,
        paused: player.paused,
        queueSize: player.queue.size,
        track: getTrackDiagnostics(player.queue.current),
      });

      const parlantePlayer = playersManager.get(player.guildId);
      if (parlantePlayer) {
        const snapshot = buildResumeSnapshot(player, parlantePlayer);
        if (snapshot) {
          void tryScheduleSameTrackReplay(player, parlantePlayer, snapshot, 'playerStuck').then(
            (status) => {
              if (status === 'terminal') {
                void skipCurrentOrDestroy(player, 'playerStuck repeated stall', snapshot.trackId);
              }
            },
          );
        }
      }

      void recoverFromPlaybackFailure(player, {
        trigger: 'playerStuck',
        reason: details?.reason,
      });
    } catch (err) {
      debug(`[${player.guildId}] Error in playerStuck handler`, err);
    }
  });
  kazagumo.on('playerResolveError', (player, track, message) => {
    try {
      const title = getTrackTitle(track);
      warn(`[${player.guildId}] Resolve error for ${title}`, message);
      debug(`[${player.guildId}] playerResolveError diagnostics`, {
        message,
        playerState: player.state,
        playing: player.playing,
        paused: player.paused,
        queueSize: player.queue.size,
        currentTrack: getTrackDiagnostics(player.queue.current),
        failedTrack: getTrackDiagnostics(track),
      });

      const parlantePlayer = playersManager.get(player.guildId);
      if (parlantePlayer) {
        parlantePlayer.sendAutoDeleteMessage(
          typedClient,
          messages.player.trackLoadFailed(escapeDiscordMarkdown(title)),
        );
      }

      void recoverFromPlaybackFailure(player, {
        trigger: 'playerResolveError',
        reason: message,
      });
    } catch (err) {
      debug(`[${player.guildId}] Error in playerResolveError handler`, err);
    }
  });

  typedClient.kazagumo = kazagumo;

  return kazagumo;
}
