// Kazagumo/shoukaku tracks expose the title at top level and, before
// resolution, under `info`. Shared fallback so every display path renders the
// same text instead of a local copy/cast.
export const getTrackTitle = (
  track: { title?: string; info?: { title?: string } } | null | undefined,
  fallback = 'Unknown Track',
): string => track?.title ?? track?.info?.title ?? fallback;

export const getDiscordUserMention = (value: unknown): string | null =>
  typeof value === 'string' && /^\d{17,20}$/.test(value) ? `<@${value}>` : null;

export const truncate = (text: string, maxLength = 50) =>
  text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;

// Escape Discord Markdown in externally supplied text (track titles, artists).
// Covers formatting, code blocks, links, quotes, headers and the `<` that
// would otherwise mint mentions/channel links/emoji. Deliberate mentions and
// safe links are appended by callers AFTER escaping, so they keep working.
export const escapeDiscordMarkdown = (text: string): string =>
  text.replace(/[\\*_~`|<>#[\]()]/g, (char) => `\\${char}`);
