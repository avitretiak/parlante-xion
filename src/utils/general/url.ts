export const cleanUrl = (url: string) => {
  try {
    // Clean URL
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const isYouTubeHost =
      host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com');

    // Only process YouTube URLs
    if (!isYouTubeHost) {
      return url;
    }

    // Keep essential parameters, remove playlist-related ones
    const paramsToRemove = [
      'list',
      'index',
      'start_radio',
      'feature',
      'playnext',
      'playlist',
      'si', // sharing identifier
    ];

    // Remove unwanted parameters
    paramsToRemove.forEach((param) => {
      u.searchParams.delete(param);
    });

    return u.toString();
  } catch {
    return url;
  }
};
