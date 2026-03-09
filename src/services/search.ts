import { Kazagumo } from 'kazagumo';
import type { KazagumoSearchResult } from 'kazagumo';
import { cleanUrl } from '#parlante/utils/general/url';

export async function searchTracks(
  kazagumo: Kazagumo,
  query: string,
  guildId?: string,
): Promise<KazagumoSearchResult> {
  try {
    return await kazagumo.search(cleanUrl(query), {
      requester: guildId ?? 'unknown',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown search error';
    throw new Error(`Failed to search tracks: ${message}`);
  }
}
