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
