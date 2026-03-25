import { describe, expect, test } from 'bun:test';
import { cleanUrl, isExplicitPlaylistUrl } from '../src/utils/general/url';

describe('isExplicitPlaylistUrl', () => {
  test('returns true for explicit YouTube playlist URL', () => {
    expect(isExplicitPlaylistUrl('https://www.youtube.com/playlist?list=PL123')).toBe(true);
  });

  test('returns false for YouTube watch URL with list param', () => {
    expect(isExplicitPlaylistUrl('https://www.youtube.com/watch?v=abc123&list=PL123')).toBe(false);
  });

  test('returns true for Spotify playlist URL', () => {
    expect(isExplicitPlaylistUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')).toBe(
      true,
    );
  });

  test('returns false for Spotify album URL', () => {
    expect(isExplicitPlaylistUrl('https://open.spotify.com/album/123456789')).toBe(false);
  });

  test('returns true for SoundCloud set URL', () => {
    expect(isExplicitPlaylistUrl('https://soundcloud.com/artist/sets/my-playlist')).toBe(true);
  });

  test('returns false for search terms', () => {
    expect(isExplicitPlaylistUrl('battlefield soundtrack')).toBe(false);
  });
});

describe('cleanUrl', () => {
  test('strips playlist params from YouTube watch URLs', () => {
    expect(cleanUrl('https://www.youtube.com/watch?v=abc123&list=PL123&index=2')).toBe(
      'https://www.youtube.com/watch?v=abc123',
    );
  });

  test('keeps explicit YouTube playlist URL unchanged', () => {
    expect(cleanUrl('https://www.youtube.com/playlist?list=PL123')).toBe(
      'https://www.youtube.com/playlist?list=PL123',
    );
  });
});
