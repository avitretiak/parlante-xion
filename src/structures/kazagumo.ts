import { Client, type UsingClient } from 'seyfert';
import { Kazagumo } from 'kazagumo';
import { Connectors, type NodeOption, type ShoukakuOptions } from 'shoukaku';
import { playersManager } from '../managers/players';
import { debug, info, warn, error as logError } from '#parlante/utils/system/logger';
import { getGuildSettings } from '#parlante/utils/config/get-guild-settings';
import messages from '#parlante/utils/constants/messages';

const DEFAULT_NODELINK_URL = 'localhost:2333';

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
    resume: false,
    resumeByLibrary: false,
    reconnectTries: 3,
    reconnectInterval: 5000,
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
  kazagumo.on('playerEmpty', async (player) => {
    try {
      const parlantePlayer = playersManager.get(player.guildId);
      if (!parlantePlayer) return;
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
