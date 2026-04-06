import { Client, type UsingClient } from 'seyfert';
import { Kazagumo } from 'kazagumo';
import { PlayerState } from 'kazagumo';
import type { KazagumoPlayer } from 'kazagumo';
import { Connectors, type NodeOption, type ShoukakuOptions } from 'shoukaku';
import { playersManager } from '../managers/players';
import type { ParlantePlayer, ResumeSnapshot } from '../structures/player';
import { debug, info, warn, error as logError } from '#parlante/utils/system/logger';
import { getGuildSettings } from '#parlante/utils/config/get-guild-settings';
import messages from '#parlante/utils/constants/messages';

const DEFAULT_NODELINK_URL = 'localhost:2333';

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

export const buildNodeConfig = (): NodeOption => {
  const rawUrl = process.env.NODELINK_URL ?? DEFAULT_NODELINK_URL;
  const auth = process.env.NODELINK_PASSWORD ?? '';

  if (/^https?:\/\//i.test(rawUrl)) {
    const parsed = new URL(rawUrl);
    return {
      name: 'nodelink',
      url: `${parsed.hostname}:${parsed.port || 2333}`,
      auth,
      secure: parsed.protocol === 'https:',
    };
  }

  return {
    name: 'nodelink',
    url: rawUrl,
    auth,
  };
};

export function initKazagumo(client: Client): Kazagumo {
  const typedClient = client as unknown as UsingClient;
  const recoveryStates = new Map<string, RecoveryState>();

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
      await kazagumo.destroyPlayer(guildId);
    } catch (err) {
      scheduleRecoveryUnlock(guildId);
      debug(`[${guildId}] Recovery flow failed`, err);
    }
  };

  const options: ShoukakuOptions = {
    moveOnDisconnect: true,
    // Server-side session resume: NodeLink keeps player state alive for resumeTimeout
    // seconds after the WS drops. When Shoukaku reconnects within that window the
    // track continues without any action on our side.
    resume: true,
    resumeTimeout: 60,
    // Client-side fallback: if the node was fully restarted (json.resumed === false)
    // Shoukaku will call player.resume() for every known player so we get playerStart.
    resumeByLibrary: true,
    reconnectTries: 3,
    // seconds (Shoukaku multiplies by 1000 internally — 5000 here = 83 min, wrong)
    reconnectInterval: 5,
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

  kazagumo.shoukaku.on('ready', (name) => {
    info(messages.debug.nodeLinkConnected(name));
  });
  kazagumo.shoukaku.on('error', (name, err) => {
    logError(messages.debug.nodeLinkError(name), err);
  });
  kazagumo.shoukaku.on('close', (name, code, reason) => {
    warn(messages.debug.nodeLinkClosed(name, code, reason ?? ''));
  });
  kazagumo.shoukaku.on('disconnect', (name) => {
    warn(messages.debug.nodeLinkDisconnected(name));
  });

  kazagumo.shoukaku.on('raw', (_name, json) => {
    const event = json as { op?: string; type?: string; guildId?: string; mixId?: string };
    if (event.op !== 'event' || event.type !== 'MixEndedEvent') return;
    if (!event.guildId || !event.mixId) return;
    playersManager.get(event.guildId)?.onMixEnded(event.mixId);
  });

  kazagumo.on('playerStart', async (player, track) => {
    try {
      clearRecoveryState(player.guildId);
      debug(`[${player.guildId}] playerStart diagnostics`, {
        playerState: player.state,
        playing: player.playing,
        paused: player.paused,
        queueSize: player.queue.size,
        track: getTrackDiagnostics(track),
      });
      const parlantePlayer = playersManager.get(player.guildId);
      if (!parlantePlayer) return;
      parlantePlayer.cancelIdleTimer();
      // Scope position tracking to this track and cancel any in-flight resume
      // from a previous close event — a new track start is authoritative.
      const trackId =
        (track as { identifier?: string }).identifier ??
        (track as { info?: { identifier?: string } }).info?.identifier ??
        (track as { track?: string }).track ??
        '';
      parlantePlayer.resetPositionTracking(trackId);
      const title =
        (track as { title?: string }).title ??
        (track as { info?: { title?: string } }).info?.title ??
        'Unknown Track';
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
    const trackId =
      (current as { identifier?: string }).identifier ??
      (current as { info?: { identifier?: string } }).info?.identifier ??
      (current as { track?: string }).track ??
      '';
    parlantePlayer.recordPosition(trackId, data.state.position);
  });
  kazagumo.on('playerEmpty', async (player) => {
    try {
      const parlantePlayer = playersManager.get(player.guildId);
      if (!parlantePlayer) return;
      // Queue is empty — any pending reconnect resume would replay a track that
      // has already ended normally, so cancel it.
      parlantePlayer.cancelResumeTimer();
      parlantePlayer.stopRefreshInterval();
      await parlantePlayer.cleanupMixLayers();
      await parlantePlayer.sendQueueEnded(typedClient);
      await parlantePlayer.clearVoiceStatus(typedClient);
      const settings = await getGuildSettings(player.guildId);
      const timeoutMs = settings.secondsToWaitAfterQueueEmpties * 1000;
      parlantePlayer.startIdleTimer(typedClient, timeoutMs);
    } catch (err) {
      debug(`[${player.guildId}] Error in playerEmpty handler`, err);
    }
  });
  kazagumo.on('playerDestroy', async (player) => {
    try {
      clearRecoveryState(player.guildId);
      const parlantePlayer = playersManager.get(player.guildId);
      if (!parlantePlayer) return;

      parlantePlayer.destroy();
      await parlantePlayer.cleanupMixLayers();

      await parlantePlayer.clearVoiceStatus(typedClient);
      await parlantePlayer.deleteNowPlayingMessage(typedClient);

      playersManager.delete(player.guildId);
    } catch (err) {
      debug(`[${player.guildId}] Error in playerDestroy handler`, err);
    }
  });
  kazagumo.on('playerClosed', (player, data) => {
    try {
      const parlantePlayer = playersManager.get(player.guildId);
      if (!parlantePlayer) return;

      parlantePlayer.onVoiceConnectionClosed();

      const snapshot = buildResumeSnapshot(player, parlantePlayer);
      if (!snapshot) {
        debug(`[${player.guildId}] playerClosed — no snapshot available, skipping resume`);
        return;
      }

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
  ): Promise<void> {
    try {
      const parlantePlayer = playersManager.get(guildId);
      if (!parlantePlayer) return;

      // Nonce check: if a newer resume was scheduled (e.g. second close event,
      // or a new track started), this attempt is stale — abort.
      if (!parlantePlayer.isResumeNonceCurrent(nonce)) {
        debug(`[${guildId}] Resume attempt #${attempt} superseded, aborting`);
        return;
      }

      const kPlayer = kazagumo.players.get(guildId);
      if (!kPlayer) {
        debug(`[${guildId}] Resume attempt #${attempt} — player gone, aborting`);
        return;
      }

      // If the player is being destroyed or the queue was cleared, don't resume.
      if (kPlayer.state === PlayerState.DESTROYING || kPlayer.state === PlayerState.DESTROYED) {
        debug(`[${guildId}] Resume attempt #${attempt} — player destroying, aborting`);
        return;
      }

      // If the current track changed (user skipped while we were waiting), abort.
      const current = kPlayer.queue.current;
      if (!current) {
        debug(`[${guildId}] Resume attempt #${attempt} — queue empty, aborting`);
        return;
      }
      const currentTrackId =
        (current as { identifier?: string }).identifier ??
        (current as { info?: { identifier?: string } }).info?.identifier ??
        (current as { track?: string }).track ??
        '';
      if (currentTrackId !== snapshot.trackId) {
        debug(`[${guildId}] Resume attempt #${attempt} — track changed, aborting`);
        return;
      }

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
          return;
        }
        debug(`[${guildId}] Resume attempt #${attempt} — voice not ready, retrying`);
        const retryNonce = parlantePlayer.scheduleResumeTimer(getResumeDelayMs(attempt + 1), () => {
          void attemptResume(guildId, retryNonce, snapshot, attempt + 1);
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
      const retryNonce = parlantePlayer.scheduleResumeTimer(getResumeDelayMs(attempt + 1), () => {
        void attemptResume(guildId, retryNonce, snapshot, attempt + 1);
      });
    }
  }

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
          const title =
            (current as { title?: string } | null)?.title ??
            (current as { info?: { title?: string } } | null)?.info?.title;
          parlantePlayer.sendAutoDeleteMessage(
            typedClient,
            messages.player.trackLoadFailed(title ?? reason ?? 'Unknown Track'),
          );
        } else {
          const snapshot = buildResumeSnapshot(player, parlantePlayer);
          if (snapshot) {
            debug(`[${player.guildId}] Transient exception — scheduling resume recovery`);
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
  kazagumo.on('playerStuck', (player) => {
    try {
      warn(`[${player.guildId}] Player stuck`);
      debug(`[${player.guildId}] playerStuck diagnostics`, {
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
          const nonce = parlantePlayer.scheduleResumeTimer(getResumeDelayMs(1), () => {
            void attemptResume(player.guildId, nonce, snapshot, 1);
          });
        }
      }

      void recoverFromPlaybackFailure(player, {
        trigger: 'playerStuck',
      });
    } catch (err) {
      debug(`[${player.guildId}] Error in playerStuck handler`, err);
    }
  });
  kazagumo.on('playerResolveError', (player, track, message) => {
    try {
      const title =
        (track as { title?: string }).title ??
        (track as { info?: { title?: string } }).info?.title ??
        'Unknown Track';
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
        parlantePlayer.sendAutoDeleteMessage(typedClient, messages.player.trackLoadFailed(title));
      }

      void recoverFromPlaybackFailure(player, {
        trigger: 'playerResolveError',
        reason: message,
      });
    } catch (err) {
      debug(`[${player.guildId}] Error in playerResolveError handler`, err);
    }
  });

  client.kazagumo = kazagumo;

  return kazagumo;
}
