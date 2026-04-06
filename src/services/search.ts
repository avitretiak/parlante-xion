import { Kazagumo } from 'kazagumo';
import type { KazagumoSearchResult } from 'kazagumo';
import type { NodeOption } from 'shoukaku';
import { buildNodeConfig } from '#parlante/structures/kazagumo';
import { cleanUrl } from '#parlante/utils/general/url';
import { debug, warn } from '#parlante/utils/system/logger';

const NODE_RECONNECT_COOLDOWN_MS = 5_000;
const NODE_RECONNECT_SETTLE_MS = 1_500;

let lastReconnectAttemptAt = 0;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isNoNodesOnlineError = (message: string): boolean =>
  message.toLowerCase().includes('no nodes are online');

const hasConnectedNode = (kazagumo: Kazagumo): boolean => {
  const nodes = kazagumo.shoukaku?.nodes;
  if (!nodes) return false;

  for (const node of nodes.values()) {
    const state = (node as unknown as { state?: unknown }).state;
    if (state === 'CONNECTED' || state === 2) {
      return true;
    }
  }

  return false;
};

const ensureNodeOnline = async (kazagumo: Kazagumo): Promise<void> => {
  if (!kazagumo.shoukaku) return;
  if (hasConnectedNode(kazagumo)) return;

  const now = Date.now();
  const elapsed = now - lastReconnectAttemptAt;
  if (elapsed < NODE_RECONNECT_COOLDOWN_MS) {
    const waitMs = NODE_RECONNECT_COOLDOWN_MS - elapsed;
    debug('Node reconnect cooldown active; waiting before retry', { waitMs });
    await wait(waitMs);
    return;
  }

  lastReconnectAttemptAt = now;
  const nodeCfg = buildNodeConfig() as NodeOption;
  try {
    warn(`No NodeLink nodes online; attempting reconnect via addNode(${nodeCfg.name})`);
    await kazagumo.shoukaku.addNode(nodeCfg);
  } catch (error) {
    debug('Node reconnect addNode attempt failed', error);
  }

  await wait(NODE_RECONNECT_SETTLE_MS);
};

export async function searchTracks(
  kazagumo: Kazagumo,
  query: string,
  guildId?: string,
): Promise<KazagumoSearchResult> {
  const cleanedQuery = cleanUrl(query);
  const requester = guildId ?? 'unknown';

  try {
    const result = await kazagumo.search(cleanedQuery, {
      requester,
    });

    debug(`[${requester}] searchTracks success`, {
      query,
      cleanedQuery,
      resultType: result.type,
      tracksFound: result.tracks?.length ?? 0,
      playlistName: result.playlistName,
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown search error';

    if (isNoNodesOnlineError(message)) {
      await ensureNodeOnline(kazagumo);

      try {
        const retryResult = await kazagumo.search(cleanedQuery, {
          requester,
        });

        debug(`[${requester}] searchTracks recovered after node reconnect`, {
          query,
          cleanedQuery,
          resultType: retryResult.type,
          tracksFound: retryResult.tracks?.length ?? 0,
          playlistName: retryResult.playlistName,
        });

        return retryResult;
      } catch (retryError) {
        const retryMessage =
          retryError instanceof Error ? retryError.message : 'Unknown search error';
        warn(`[${requester}] searchTracks retry failed after reconnect attempt`, {
          query,
          cleanedQuery,
          error: retryMessage,
        });
        throw new Error(`Failed to search tracks: ${retryMessage}`);
      }
    }

    warn(`[${requester}] searchTracks failed`, {
      query,
      cleanedQuery,
      error: message,
    });
    throw new Error(`Failed to search tracks: ${message}`);
  }
}
