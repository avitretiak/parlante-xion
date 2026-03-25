import { Kazagumo } from 'kazagumo';
import type { KazagumoSearchResult } from 'kazagumo';
import { cleanUrl } from '#parlante/utils/general/url';
import { debug, warn } from '#parlante/utils/system/logger';

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
    warn(`[${requester}] searchTracks failed`, {
      query,
      cleanedQuery,
      error: message,
    });
    throw new Error(`Failed to search tracks: ${message}`);
  }
}
