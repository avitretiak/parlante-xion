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
    // @ts-expect-error Seyfert connector type does not satisfy Kazagumo's Connector constraint due to protected member variance — works at runtime
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
      parlantePlayer.stopRefreshInterval();
      parlantePlayer.cancelIdleTimer();
      await parlantePlayer.clearVoiceStatus(typedClient);
      await parlantePlayer.deleteNowPlayingMessage(typedClient);
      playersManager.delete(player.guildId);
    } catch (err) {
      debug(`[${player.guildId}] Error in playerDestroy handler`, err);
    }
  });
  kazagumo.on('playerException', (player, data) => {
    debug(`[${player.guildId}] Player exception`, data);
  });
  kazagumo.on('playerResolveError', (player, track, message) => {
    debug(`[${player.guildId}] Resolve error for ${track?.title ?? 'unknown track'}`, message);
  });

  client.kazagumo = kazagumo;

  return kazagumo;
}
