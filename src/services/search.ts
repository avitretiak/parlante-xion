import { Kazagumo } from 'kazagumo';
import type { KazagumoSearchResult } from 'kazagumo';

export async function searchTracks(
  kazagumo: Kazagumo,
  query: string,
  guildId?: string,
): Promise<KazagumoSearchResult> {
  try {
    return await kazagumo.search(query, {
      requester: guildId ?? 'unknown',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown search error';
    throw new Error(`Failed to search tracks: ${message}`);
  }
}
