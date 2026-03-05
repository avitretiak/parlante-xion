import { describe, expect, test, mock } from 'bun:test';
import { searchTracks } from '../src/services/search';
import type { Kazagumo } from 'kazagumo';

describe('searchTracks', () => {
  test('calls kazagumo.search with the query and guildId as requester', async () => {
    const mockSearch = mock(() =>
      Promise.resolve({
        type: 'SEARCH' as const,
        tracks: [],
      }),
    );

    const kazagumo = {
      search: mockSearch,
    } as unknown as Kazagumo;

    const result = await searchTracks(
      kazagumo,
      'Rick Astley - Never Gonna Give You Up',
      'guild-123',
    );

    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch).toHaveBeenCalledWith('Rick Astley - Never Gonna Give You Up', {
      requester: 'guild-123',
    });
    expect(result).toEqual({
      type: 'SEARCH',
      tracks: [],
    });
  });

  test('uses "unknown" as requester when guildId is undefined', async () => {
    const mockSearch = mock(() =>
      Promise.resolve({
        type: 'SEARCH' as const,
        tracks: [],
      }),
    );

    const kazagumo = {
      search: mockSearch,
    } as unknown as Kazagumo;

    await searchTracks(kazagumo, 'test query');

    expect(mockSearch).toHaveBeenCalledWith('test query', {
      requester: 'unknown',
    });
  });

  test('wraps Error thrown by kazagumo.search', async () => {
    const mockSearch = mock(() => Promise.reject(new Error('Network timeout')));

    const kazagumo = {
      search: mockSearch,
    } as unknown as Kazagumo;

    try {
      await searchTracks(kazagumo, 'test query');
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Failed to search tracks: Network timeout');
    }
  });

  test('wraps non-Error thrown by kazagumo.search', async () => {
    const mockSearch = mock(() => Promise.reject('string error'));

    const kazagumo = {
      search: mockSearch,
    } as unknown as Kazagumo;

    try {
      await searchTracks(kazagumo, 'test query');
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Failed to search tracks: Unknown search error');
    }
  });

  test('passes the query directly to kazagumo without modification', async () => {
    const mockSearch = mock(() =>
      Promise.resolve({
        type: 'SEARCH' as const,
        tracks: [],
      }),
    );

    const kazagumo = {
      search: mockSearch,
    } as unknown as Kazagumo;

    await searchTracks(kazagumo, 'ytsearch:my song');

    expect(mockSearch).toHaveBeenCalledWith('ytsearch:my song', {
      requester: 'unknown',
    });
  });
});
