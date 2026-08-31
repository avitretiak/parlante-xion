import { Kazagumo } from 'kazagumo';
import type { KazagumoSearchResult } from 'kazagumo';
import { Constants } from 'shoukaku';
import { buildNodeConfig } from '#parlante/config';
import { cleanUrl } from '#parlante/utils/general/url';
import { debug, warn } from '#parlante/utils/system/logger';

const NODE_RECONNECT_COOLDOWN_MS = 5_000;
const NODE_RECONNECT_SETTLE_MS = 1_500;

let lastReconnectAttemptAt = 0;

const isNoNodesOnlineError = (message: string): boolean =>
  message.toLowerCase().includes('no nodes are online');

const hasConnectedNode = (kazagumo: Kazagumo): boolean => {
  const nodes = kazagumo.shoukaku?.nodes;
  if (!nodes) return false;

  for (const node of nodes.values()) {
    if (node.state === Constants.State.CONNECTED) {
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
    await Bun.sleep(waitMs);
    return;
  }

  const nodeCfg = buildNodeConfig();

  // Shoukaku removes a node from the pool itself once it stops reconnecting, so
  // a node still present (in any state) is settling on its own. addNode would
  // overwrite the pool entry while the stale node keeps running, and the stale
  // node's disconnect handler would then delete the replacement by name.
  const existingNode = kazagumo.shoukaku.nodes.get(nodeCfg.name);
  if (existingNode !== undefined) {
    debug(`Node '${nodeCfg.name}' is present in the pool; letting it settle`);
    await Bun.sleep(NODE_RECONNECT_SETTLE_MS);
    return;
  }

  lastReconnectAttemptAt = now;
  try {
    warn(`No NodeLink nodes online; attempting reconnect via addNode(${nodeCfg.name})`);
    await kazagumo.shoukaku.addNode(nodeCfg);
  } catch (error) {
    debug('Node reconnect addNode attempt failed', error);
  }

  await Bun.sleep(NODE_RECONNECT_SETTLE_MS);
};

// Sanitized query diagnostics: never the raw/cleaned query itself, only its
// length and the source host when the query parses as a URL (a hostname
// carries no credentials). No hash or fingerprint: unkeyed digests of
// low-entropy queries are recoverable by offline dictionary attack.
export const describeQueryForLogs = (
  query: string,
): {
  queryLength: number;
  sourceHost: string | null;
} => {
  let sourceHost: string | null = null;
  try {
    const host = new URL(query).hostname.toLowerCase();
    if (host) sourceHost = host;
  } catch {
    // Not a URL — no host to report.
  }
  return { queryLength: query.length, sourceHost };
};

export async function searchTracks(
  kazagumo: Kazagumo,
  query: string,
  requesterId?: string,
): Promise<KazagumoSearchResult> {
  const cleanedQuery = cleanUrl(query);
  const requester = requesterId ?? 'unknown';

  try {
    const result = await kazagumo.search(cleanedQuery, {
      requester,
    });

    debug(`[${requester}] searchTracks success`, {
      ...describeQueryForLogs(query),
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
          ...describeQueryForLogs(query),
          resultType: retryResult.type,
          tracksFound: retryResult.tracks?.length ?? 0,
          playlistName: retryResult.playlistName,
        });

        return retryResult;
      } catch (retryError) {
        const retryMessage =
          retryError instanceof Error ? retryError.message : 'Unknown search error';
        warn(`[${requester}] searchTracks retry failed after reconnect attempt`, {
          ...describeQueryForLogs(query),
          error: retryMessage,
        });
        throw new Error(`Failed to search tracks: ${retryMessage}`);
      }
    }

    warn(`[${requester}] searchTracks failed`, {
      ...describeQueryForLogs(query),
      error: message,
    });
    throw new Error(`Failed to search tracks: ${message}`);
  }
}
