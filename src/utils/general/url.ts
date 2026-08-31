// Every character outside the RFC 3986 unreserved/reserved sets is
// percent-encoded so a track URI can never terminate or restructure the
// `[title](destination)` Markdown link it is placed in: no literal `)`, `[`,
// backtick, or whitespace can survive into a Discord link destination.
const MARKDOWN_SAFE_URL_CHARS = /[^A-Za-z0-9\-._~:/?#@!$&'*+,;=%]/g;

// Validated, credential-free http(s) URL safe to embed as a Discord Markdown
// link destination. Returns null when the URI is not a parseable http(s) URL,
// so the caller renders plain text instead of a link.
export const toSafeMarkdownDestination = (uri: string): string | null => {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  // Never leak user:password@ into a shared embed, even for valid URLs.
  url.username = '';
  url.password = '';
  return url
    .toString()
    .replace(
      MARKDOWN_SAFE_URL_CHARS,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
    );
};

export const cleanUrl = (url: string) => {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const isYouTubeHost =
      host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com');

    if (!isYouTubeHost) {
      return url;
    }

    // Explicit playlist links (/playlist?list=xxx) should be left untouched
    const isExplicitPlaylist = u.pathname === '/playlist';
    if (isExplicitPlaylist) {
      return url;
    }

    // For single-video URLs (/watch?v=xxx&list=yyy or youtu.be/xxx?list=yyy),
    // strip playlist-related params so the resolver treats them as a single track.
    const paramsToRemove = [
      'list',
      'index',
      'start_radio',
      'feature',
      'playnext',
      'playlist',
      'si', // sharing identifier
    ];

    for (const param of paramsToRemove) {
      u.searchParams.delete(param);
    }

    return u.toString();
  } catch {
    return url;
  }
};

export const isExplicitPlaylistUrl = (input: string): boolean => {
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    const pathname = url.pathname.toLowerCase();

    const isYouTubeHost =
      host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com');
    if (isYouTubeHost) {
      return pathname === '/playlist';
    }

    const isSpotifyHost = host === 'spotify.com' || host.endsWith('.spotify.com');
    if (isSpotifyHost) {
      return pathname.startsWith('/playlist/');
    }

    const isSoundCloudHost = host === 'soundcloud.com' || host.endsWith('.soundcloud.com');
    if (isSoundCloudHost) {
      return pathname.includes('/sets/');
    }

    return false;
  } catch {
    return false;
  }
};
