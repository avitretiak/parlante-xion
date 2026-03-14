import { Client, type UsingClient } from 'seyfert';
import { Kazagumo } from 'kazagumo';
import { PlayerState } from 'kazagumo';
import { Connectors, type NodeOption, type ShoukakuOptions } from 'shoukaku';
import { playersManager } from '../managers/players';
import type { ResumeSnapshot } from '../structures/player';
import { debug, info, warn, error as logError } from '#parlante/utils/system/logger';
import { getGuildSettings } from '#parlante/utils/config/get-guild-settings';
import messages from '#parlante/utils/constants/messages';

const DEFAULT_NODELINK_URL = 'localhost:2333';

// How long to wait before attempting to replay after a voice WS close.
// Chosen to be longer than Discord's typical voice reconnect handshake (~1-2s)
// but short enough not to noticeably stall playback.
const RECONNECT_RESUME_DELAY_MS = 3_000;
// Maximum retry attempts before giving up on auto-resume.
const RECONNECT_RESUME_MAX_RETRIES = 3;

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

      const current = player.queue.current;
      if (!current) return;

      // Snapshot everything we need before any async gap. If the player is
      // already tearing down, bail immediately.
      if (player.state === PlayerState.DESTROYING || player.state === PlayerState.DESTROYED) {
        debug(`[${player.guildId}] playerClosed — player already destroying, skipping resume`);
        return;
      }

      const trackId =
        (current as { identifier?: string }).identifier ??
        (current as { info?: { identifier?: string } }).info?.identifier ??
        (current as { track?: string }).track ??
        '';
      const isStream = (current as { isStream?: boolean }).isStream ?? false;
      const isSeekable = (current as { isSeekable?: boolean }).isSeekable ?? true;
      const length = (current as { length?: number }).length ?? 0;
      const snapshot: ResumeSnapshot = {
        trackId,
        // If the track is not seekable or is a stream, resume from 0 —
        // no point trying to seek into a live stream.
        position: isStream || !isSeekable ? 0 : parlantePlayer.lastKnownPosition,
        paused: player.paused,
        isStream,
        isSeekable,
        length,
      };

      debug(
        `[${player.guildId}] playerClosed (code=${data.code}, byRemote=${data.byRemote}) — scheduling resume from ${snapshot.position}ms`,
      );

      // Schedule the single-flight resume loop. scheduleResumeTimer cancels
      // any prior pending resume before creating the new one.
      const nonce = parlantePlayer.scheduleResumeTimer(RECONNECT_RESUME_DELAY_MS, () => {
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
        if (attempt >= RECONNECT_RESUME_MAX_RETRIES) {
          warn(`[${guildId}] Resume: voice not ready after ${attempt} attempts, giving up`);
          return;
        }
        debug(`[${guildId}] Resume attempt #${attempt} — voice not ready, retrying`);
        const retryNonce = parlantePlayer.scheduleResumeTimer(RECONNECT_RESUME_DELAY_MS, () => {
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
      const retryNonce = parlantePlayer.scheduleResumeTimer(RECONNECT_RESUME_DELAY_MS, () => {
        void attemptResume(guildId, retryNonce, snapshot, attempt + 1);
      });
    }
  }

  kazagumo.on('playerException', (player, data) => {
    try {
      const reason =
        data && typeof data === 'object' && 'exception' in data
          ? (data as { exception?: { message?: string } }).exception?.message
          : undefined;
      warn(`[${player.guildId}] Player exception`, data);

      const parlantePlayer = playersManager.get(player.guildId);
      if (parlantePlayer) {
        const current = player.queue.current;
        const title =
          (current as { title?: string } | null)?.title ??
          (current as { info?: { title?: string } } | null)?.info?.title;
        parlantePlayer.sendAutoDeleteMessage(
          typedClient,
          messages.player.trackLoadFailed(title ?? reason ?? 'Unknown Track'),
        );
      }
    } catch (err) {
      debug(`[${player.guildId}] Error in playerException handler`, err);
    }
  });
  kazagumo.on('playerStuck', (player) => {
    try {
      warn(`[${player.guildId}] Player stuck`);

      const parlantePlayer = playersManager.get(player.guildId);
      if (parlantePlayer) {
        const current = player.queue.current;
        const title = (current as { title?: string } | null)?.title ?? 'Unknown Track';
        parlantePlayer.sendAutoDeleteMessage(typedClient, messages.player.trackLoadFailed(title));
      }
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

      const parlantePlayer = playersManager.get(player.guildId);
      if (parlantePlayer) {
        parlantePlayer.sendAutoDeleteMessage(typedClient, messages.player.trackLoadFailed(title));
      }
    } catch (err) {
      debug(`[${player.guildId}] Error in playerResolveError handler`, err);
    }
  });

  client.kazagumo = kazagumo;

  return kazagumo;
}
