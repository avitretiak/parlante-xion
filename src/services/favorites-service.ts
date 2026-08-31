import { db } from '#parlante/db';
import { favoriteQuery, type FavoriteQuery } from '#parlante/db/schema';
import { escapeDiscordMarkdown } from '#parlante/utils/general/string';

// Favorite names cross the autocomplete choice boundary (Discord caps option
// values at 100), so names stay at 100. Queries only cross the string-option
// boundary: valid signed media/playlist URLs routinely exceed 100 characters,
// so they get Discord's full string-option maximum of 6000.
export const FAVORITE_MAX_LENGTH = 100;
export const FAVORITE_QUERY_MAX_LENGTH = 6000;

export const normalizeFavoriteName = (value: string): string | null => {
  const name = value.trim();
  return name.length === 0 || name.length > FAVORITE_MAX_LENGTH ? null : name;
};

export const normalizeFavoriteQuery = (value: string): string | null => {
  const query = value.trim();
  return query.length === 0 || query.length > FAVORITE_QUERY_MAX_LENGTH ? null : query;
};

/**
 * Build a `/favorites list` field value: the query with Discord Markdown
 * escaped, then truncated so the value (including the deliberate author
 * mention appended after escaping) stays within Discord's 1024-character
 * embed field limit. A trailing escape backslash is dropped so the cut never
 * leaves a dangling escape pair. Stored query and autocomplete names are
 * untouched.
 */
export const favoriteListValue = (query: string, authorId: string): string => {
  const escapedQuery = escapeDiscordMarkdown(query);
  const authorMention = ` (<@${authorId}>)`;
  const queryBudget = 1024 - authorMention.length;
  const displayQuery =
    escapedQuery.length > queryBudget
      ? `${escapedQuery.slice(0, Math.max(0, queryBudget - 3)).replace(/\\$/, '')}...`
      : escapedQuery;
  return `${displayQuery}${authorMention}`;
};

/**
 * Insert a favorite. Returns the created row, or null when a row with the
 * same (guildId, name) already exists — including concurrent duplicates.
 */
export async function createFavorite(input: {
  guildId: string;
  authorId: string;
  name: string;
  query: string;
}): Promise<FavoriteQuery | null> {
  const [created] = await db
    .insert(favoriteQuery)
    .values(input)
    .onConflictDoNothing({ target: [favoriteQuery.guildId, favoriteQuery.name] })
    .returning();

  return created ?? null;
}
