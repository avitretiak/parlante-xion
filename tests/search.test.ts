import { afterEach, describe, expect, mock, setSystemTime, test, vi } from 'bun:test';
import type { Mock } from 'bun:test';
import { searchTracks } from '../src/services/search';
import { Constants } from 'shoukaku';
import type { Kazagumo } from 'kazagumo';

describe('searchTracks', () => {
  test('calls kazagumo.search with the requester user ID', async () => {
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
      '123456789012345678',
    );

    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch).toHaveBeenCalledWith('Rick Astley - Never Gonna Give You Up', {
      requester: '123456789012345678',
    });
    expect(result).toEqual({
      type: 'SEARCH',
      tracks: [],
    });
  });

  test('uses "unknown" when requester ID is undefined', async () => {
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

describe('searchTracks node reconnect', () => {
  // Module-level reconnect state lives across tests; each test starts its fake
  // clock well past the previous one so the cooldown never leaks between tests.
  const baseClock = 1_700_000_000_000;
  let clock = baseClock;

  const freshFakeClock = () => {
    clock += 60_000;
    vi.useRealTimers();
    vi.useFakeTimers();
    setSystemTime(new Date(clock));
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  const kazagumoWithNode = (
    search: (query: string, options?: { requester?: string }) => Promise<unknown>,
    nodeState: Constants.State | undefined,
  ): { kazagumo: Kazagumo; addNode: Mock<() => undefined> } => {
    const addNode = mock(() => undefined);
    const nodes = new Map<string, { name: string; state: Constants.State }>();
    if (nodeState !== undefined) {
      nodes.set('nodelink', { name: 'nodelink', state: nodeState });
    }
    return {
      kazagumo: { search, shoukaku: { nodes, addNode } } as unknown as Kazagumo,
      addNode,
    };
  };

  // Fails on odd-numbered calls, recovers on even-numbered calls.
  const flakySearch = () => {
    let calls = 0;
    return mock(() => {
      calls += 1;
      return calls % 2 === 1
        ? Promise.reject(new Error('No nodes are online'))
        : Promise.resolve({ type: 'SEARCH' as const, tracks: [] });
    });
  };

  test('recognizes a CONNECTED node and retries without addNode', async () => {
    freshFakeClock();
    const { kazagumo, addNode } = kazagumoWithNode(flakySearch(), Constants.State.CONNECTED);

    await expect(searchTracks(kazagumo, 'test query')).resolves.toEqual({
      type: 'SEARCH',
      tracks: [],
    });
    expect(addNode).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('never replaces an existing same-name node in any installed state', async () => {
    for (const state of [
      Constants.State.CONNECTING,
      Constants.State.DISCONNECTING,
      Constants.State.DISCONNECTED,
    ]) {
      freshFakeClock();
      const { kazagumo, addNode } = kazagumoWithNode(flakySearch(), state);

      const pending = searchTracks(kazagumo, 'test query');
      // Let the failed search reach ensureNodeOnline's settle wait.
      await Promise.resolve();
      await Promise.resolve();
      expect(vi.getTimerCount()).toBe(1);
      vi.advanceTimersByTime(1_500);

      await expect(pending).resolves.toEqual({ type: 'SEARCH', tracks: [] });
      expect(addNode).not.toHaveBeenCalled();
    }
  });

  test('adds the configured node exactly once when it is absent', async () => {
    freshFakeClock();
    const { kazagumo, addNode } = kazagumoWithNode(flakySearch(), undefined);

    const pending = searchTracks(kazagumo, 'test query');
    await Promise.resolve();
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1_500);

    await expect(pending).resolves.toEqual({ type: 'SEARCH', tracks: [] });
    expect(addNode).toHaveBeenCalledTimes(1);
    expect(addNode).toHaveBeenCalledWith(expect.objectContaining({ name: 'nodelink' }));
  });

  test('bounded cooldown: a second failure shortly after does not addNode again', async () => {
    freshFakeClock();
    const search = flakySearch();
    const { kazagumo, addNode } = kazagumoWithNode(search as never, undefined);

    const first = searchTracks(kazagumo, 'test query');
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(1_500);
    await expect(first).resolves.toEqual({ type: 'SEARCH', tracks: [] });
    expect(addNode).toHaveBeenCalledTimes(1);

    // Only one second later, still inside the cooldown window.
    setSystemTime(new Date(clock + 2_500));
    const second = searchTracks(kazagumo, 'test query');
    await Promise.resolve();
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(2_500);
    await expect(second).resolves.toEqual({ type: 'SEARCH', tracks: [] });

    expect(addNode).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledTimes(4);
  });
});
