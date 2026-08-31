import { describe, expect, test } from 'bun:test';
import {
  cleanUrl,
  isExplicitPlaylistUrl,
  toSafeMarkdownDestination,
} from '../src/utils/general/url';

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

describe('toSafeMarkdownDestination', () => {
  test('accepts only parseable http(s) URLs', () => {
    expect(toSafeMarkdownDestination('https://example.com/track')).toBe(
      'https://example.com/track',
    );
    expect(toSafeMarkdownDestination('http://example.com/track')).toBe('http://example.com/track');
    expect(toSafeMarkdownDestination('javascript:alert(1)')).toBeNull();
    expect(toSafeMarkdownDestination('spotify:track:abc')).toBeNull();
    expect(toSafeMarkdownDestination('http://')).toBeNull();
    expect(toSafeMarkdownDestination('just words')).toBeNull();
  });

  test('strips credentials from the destination', () => {
    expect(toSafeMarkdownDestination('https://user:secret@example.com/track?q=a%20b')).toBe(
      'https://example.com/track?q=a%20b',
    );
  });

  test('percent-encodes characters that could break a markdown destination', () => {
    expect(toSafeMarkdownDestination('https://safe.invalid/) [Open](https://evil.invalid')).toBe(
      'https://safe.invalid/%29%20%5BOpen%5D%28https://evil.invalid',
    );
    expect(toSafeMarkdownDestination('https://example.com/a(b)c')).toBe(
      'https://example.com/a%28b%29c',
    );
  });
});
