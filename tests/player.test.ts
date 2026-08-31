import { afterEach, describe, expect, jest, test } from 'bun:test';
import type { KazagumoPlayer } from 'kazagumo';
import type { UsingClient } from 'seyfert';
import { playersManager } from '../src/managers/players';
import { ParlantePlayer } from '../src/structures/player';
import { buildNowPlayingEmbed } from '../src/utils/player/build-now-playing-embed';

const flushMicrotasks = async (times = 10): Promise<void> => {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
};

const createHarness = () => {
  const deleteMessage = jest.fn(() => Promise.resolve());
  const client = {
    messages: {
      write: jest.fn(() => Promise.resolve({ id: 'now-playing' })),
      edit: jest.fn(() => Promise.resolve()),
      delete: deleteMessage,
    },
  } as unknown as UsingClient;
  const kazagumoPlayer = { queue: { current: null } } as unknown as KazagumoPlayer;

  return {
    client,
    deleteMessage,
    player: new ParlantePlayer(kazagumoPlayer, 'guild', 'channel'),
  };
};

afterEach(() => jest.useRealTimers());

describe('queue-ended message', () => {
  test('deletes itself after one minute', async () => {
    jest.useFakeTimers();
    const { client, deleteMessage, player } = createHarness();

    await player.sendQueueEnded(client);
    jest.advanceTimersByTime(59_999);
    expect(deleteMessage).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(deleteMessage).toHaveBeenCalledWith('now-playing', 'channel');
  });

  test('stays when replaced by a new now-playing update', async () => {
    jest.useFakeTimers();
    const { client, deleteMessage, player } = createHarness();

    await player.sendQueueEnded(client);
    await player.sendOrUpdateNowPlaying(client, true);
    jest.advanceTimersByTime(60_000);

    expect(deleteMessage).not.toHaveBeenCalled();
  });
});

describe('queue-ended message delete ownership', () => {
  test('a delayed delete detaches ownership so newer updates create a fresh card', async () => {
    jest.useFakeTimers();
    const { client, deleteMessage, player } = createHarness();

    await player.sendQueueEnded(client); // writes and tracks 'now-playing'
    jest.advanceTimersByTime(60_000); // the chained delete fires
    await flushMicrotasks();

    // A new update runs AFTER the ordered delete, so it must write and track
    // a fresh card instead of editing the message that was just deleted.
    await player.sendOrUpdateNowPlaying(client, true);

    expect(deleteMessage).toHaveBeenCalledWith('now-playing', 'channel');
    expect(client.messages.edit).not.toHaveBeenCalled();
    expect(client.messages.write).toHaveBeenCalledTimes(2);
  });

  test('an in-flight delayed delete cannot remove a card written by a newer update', async () => {
    jest.useFakeTimers();
    const { client, deleteMessage, player } = createHarness();

    let releaseDelete!: () => void;
    deleteMessage.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseDelete = resolve;
        }),
    );

    await player.sendQueueEnded(client); // writes and tracks 'now-playing'
    jest.advanceTimersByTime(60_000); // the delete fires and is held open
    await flushMicrotasks();
    expect(deleteMessage).toHaveBeenCalledWith('now-playing', 'channel');

    // The delete is in flight; a new-track update enqueues after it on the
    // same chain — it must run after the DELETE, not race it.
    const update = player.sendOrUpdateNowPlaying(client, true);
    await flushMicrotasks();
    expect(client.messages.edit).not.toHaveBeenCalled();

    releaseDelete();
    await update;

    expect(deleteMessage).toHaveBeenCalledTimes(1);
    expect(client.messages.edit).not.toHaveBeenCalled();
    // A fresh card was written and tracked after the delete.
    expect(client.messages.write).toHaveBeenCalledTimes(2);
  });
});

const createIdleHarness = () => {
  const rest = { request: jest.fn(async () => ({})) };
  const client = {
    messages: {
      write: jest.fn(() => Promise.resolve({ id: 'now-playing' })),
      edit: jest.fn(() => Promise.resolve()),
      delete: jest.fn(() => Promise.resolve()),
    },
    rest,
  } as unknown as UsingClient;
  const destroy = jest.fn(() => Promise.resolve());
  const queue = { current: null as unknown, size: 0 };
  const playersMap = new Map<string, unknown>();
  const kazagumoPlayer = {
    guildId: 'guild',
    voiceId: 'voice-1',
    playing: false,
    paused: false,
    queue,
    shoukaku: { node: { sessionId: '' } },
    kazagumo: { players: playersMap },
    destroy,
  } as unknown as KazagumoPlayer;
  playersMap.set('guild', kazagumoPlayer);
  playersManager.create('guild', kazagumoPlayer, 'channel');
  const player = playersManager.get('guild')!;
  return { client, rest, destroy, player, kazagumoPlayer, queue };
};

describe('idle timer', () => {
  afterEach(() => {
    playersManager.delete('guild');
    jest.useRealTimers();
  });

  test('never leaves when the timeout is zero', () => {
    jest.useFakeTimers();
    const { client, rest, destroy, player } = createIdleHarness();

    player.startIdleTimer(client, 0);
    jest.advanceTimersByTime(3_600_000);

    expect(rest.request).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });

  test('destroys when the queue stays empty', async () => {
    jest.useFakeTimers();
    const { client, rest, destroy, player } = createIdleHarness();

    player.startIdleTimer(client, 5_000);
    jest.advanceTimersByTime(5_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(rest.request).toHaveBeenCalledWith(
      'PUT',
      '/channels/voice-1/voice-status',
      expect.anything(),
    );
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  test('a reactivated queue survives the timer', () => {
    jest.useFakeTimers();
    const { client, rest, destroy, player, kazagumoPlayer, queue } = createIdleHarness();

    player.startIdleTimer(client, 5_000);
    queue.current = { title: 'New Track' };
    kazagumoPlayer.playing = true;
    jest.advanceTimersByTime(60_000);

    expect(rest.request).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });

  test('playback starting while the voice status clears cancels the teardown', async () => {
    jest.useFakeTimers();
    const { client, rest, destroy, player, kazagumoPlayer, queue } = createIdleHarness();

    let releaseStatus!: () => void;
    rest.request.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseStatus = resolve;
        }),
    );

    player.startIdleTimer(client, 5_000);
    jest.advanceTimersByTime(5_000);
    await flushMicrotasks();
    expect(rest.request).toHaveBeenCalledTimes(1);

    // A new track starts while the voice-status request is pending.
    queue.current = { title: 'New Track' };
    kazagumoPlayer.playing = true;

    releaseStatus();
    await flushMicrotasks();

    expect(destroy).not.toHaveBeenCalled();
  });

  test('a wrapper rebound while the voice status clears is never destroyed', async () => {
    jest.useFakeTimers();
    const { client, rest, destroy, player, kazagumoPlayer } = createIdleHarness();

    let releaseStatus!: () => void;
    rest.request.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseStatus = resolve;
        }),
    );

    player.startIdleTimer(client, 5_000);
    jest.advanceTimersByTime(5_000);
    await flushMicrotasks();
    expect(rest.request).toHaveBeenCalledTimes(1);

    // The Kazagumo player is replaced while the request is pending.
    const newPlayer = {
      guildId: 'guild',
      voiceId: 'voice-1',
      playing: false,
      paused: false,
      queue: { current: null, size: 0 },
      shoukaku: { node: { sessionId: '' } },
      kazagumo: { players: kazagumoPlayer.kazagumo.players },
      destroy: jest.fn(async () => {}),
    } as unknown as KazagumoPlayer;
    kazagumoPlayer.kazagumo.players.set('guild', newPlayer);
    playersManager.create('guild', newPlayer, 'channel');

    releaseStatus();
    await flushMicrotasks();

    expect(destroy).not.toHaveBeenCalled();
    expect(playersManager.get('guild')?.kazagumoPlayer).toBe(newPlayer);
  });
});

describe('mix layer liveness', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
  });

  test('a stale mix completion installs no active state', async () => {
    jest.useFakeTimers();
    let resolveAdd: ((value: { ok: boolean; json: () => Promise<unknown> }) => void) | undefined;
    const fetchMock = jest.fn((_url: string, init?: { method?: string }) => {
      if (init?.method === 'POST') {
        const { promise, resolve } = Promise.withResolvers<{
          ok: boolean;
          json: () => Promise<unknown>;
        }>();
        resolveAdd = resolve;
        return promise;
      }
      return Promise.resolve({ ok: true, json: async () => ({ mixes: [] }) });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const kazagumoPlayer = {
      guildId: 'guild',
      shoukaku: { node: { sessionId: 'session-1' } },
      queue: { current: null },
    } as unknown as KazagumoPlayer;
    const player = new ParlantePlayer(kazagumoPlayer, 'guild', 'channel');

    player.addMixLayer('encoded-track', 1, 30_000); // POST held open
    player.destroy(); // invalidates the generation
    resolveAdd!({
      ok: true,
      json: async () => ({ id: 'mix-1', track: { encoded: 'encoded-track' }, volume: 1 }),
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const countDeletes = (): number =>
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE').length;

    // The stale remote layer is dropped exactly once...
    expect(countDeletes()).toBe(1);
    // ...and no safety timeout or poller was installed for it.
    jest.advanceTimersByTime(60_000);
    await Promise.resolve();
    expect(countDeletes()).toBe(1);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'GET')).toHaveLength(0);
  });

  test('a retried mix layer is polled and cleaned with the creating session', async () => {
    jest.useFakeTimers();
    const fetchMock = jest.fn((url: string, init?: { method?: string }) => {
      if (init?.method === 'POST') {
        if (url.includes('/sessions/session-1/')) {
          return Promise.resolve({ ok: false, json: async () => ({ message: 'bad session' }) });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'mix-1', track: { encoded: 'encoded-track' }, volume: 1 }),
        });
      }
      if (init?.method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ mixes: [{ id: 'mix-1' }] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const node = { sessionId: 'session-1' };
    const kazagumoPlayer = {
      guildId: 'guild',
      shoukaku: { node },
      queue: { current: null },
    } as unknown as KazagumoPlayer;
    const player = new ParlantePlayer(kazagumoPlayer, 'guild', 'channel');

    player.addMixLayer('encoded-track', 1, 30_000);
    node.sessionId = 'session-2'; // rollover between the failed POST and retry
    await flushMicrotasks();

    // Polling must target the session that created the layer, never the
    // failed original or whatever session is current.
    jest.advanceTimersByTime(2_000);
    await flushMicrotasks();
    const getUrls = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'GET')
      .map(([url]) => url as string);
    expect(getUrls.length).toBeGreaterThan(0);
    expect(getUrls.every((url) => url.includes('/sessions/session-2/'))).toBe(true);

    // Cleanup on safety timeout targets the same creating session.
    jest.advanceTimersByTime(60_000);
    await flushMicrotasks();
    const deleteUrls = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'DELETE')
      .map(([url]) => url as string);
    expect(deleteUrls.length).toBeGreaterThan(0);
    expect(deleteUrls.every((url) => url.includes('/sessions/session-2/'))).toBe(true);
  });

  test('cleanup after a rollover deletes layers from every origin session', async () => {
    jest.useFakeTimers();
    const fetchMock = jest.fn((url: string, init?: { method?: string }) => {
      if (init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'mix-1', track: { encoded: 'encoded-track' }, volume: 1 }),
        });
      }
      if (init?.method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ mixes: [{ id: 'mix-1', track: { encoded: 'x' }, volume: 1 }] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const node = { sessionId: 'session-1' };
    const kazagumoPlayer = {
      guildId: 'guild',
      shoukaku: { node },
      queue: { current: null },
    } as unknown as KazagumoPlayer;
    const player = new ParlantePlayer(kazagumoPlayer, 'guild', 'channel');

    player.addMixLayer('encoded-track', 1, 30_000);
    await flushMicrotasks(); // handle installed for session-1

    node.sessionId = 'session-2'; // rollover before lifecycle cleanup

    await player.cleanupMixLayers();

    // Both the origin-session layer (from its stored handle session) and any
    // current-session untracked layers must be deleted exactly once each.
    const deleteUrls = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'DELETE')
      .map(([url]) => url as string);
    expect(deleteUrls).toHaveLength(2);
    expect(deleteUrls.some((url) => url.includes('/sessions/session-1/'))).toBe(true);
    expect(deleteUrls.some((url) => url.includes('/sessions/session-2/'))).toBe(true);
  });

  test('cleanup without a rollover deletes the current session exactly once', async () => {
    jest.useFakeTimers();
    const fetchMock = jest.fn((url: string, init?: { method?: string }) => {
      if (init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'mix-1', track: { encoded: 'encoded-track' }, volume: 1 }),
        });
      }
      if (init?.method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ mixes: [{ id: 'mix-1', track: { encoded: 'x' }, volume: 1 }] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const node = { sessionId: 'session-1' };
    const kazagumoPlayer = {
      guildId: 'guild',
      shoukaku: { node },
      queue: { current: null },
    } as unknown as KazagumoPlayer;
    const player = new ParlantePlayer(kazagumoPlayer, 'guild', 'channel');

    player.addMixLayer('encoded-track', 1, 30_000);
    await flushMicrotasks();

    await player.cleanupMixLayers();

    // Origin session == current session: the destructive call runs once, not
    // once per source.
    const deleteUrls = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'DELETE')
      .map(([url]) => url as string);
    expect(deleteUrls).toHaveLength(1);
    expect(deleteUrls[0]).toContain('/sessions/session-1/');
  });
});

describe('TTS pending queue cap', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
  });

  test('addMixLayer returns false once the pending queue is full', () => {
    jest.useFakeTimers();
    // Held-open POST keeps the active item playing so the pending queue grows.
    globalThis.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;

    const kazagumoPlayer = {
      guildId: 'guild',
      shoukaku: { node: { sessionId: 'session-1' } },
      queue: { current: null },
    } as unknown as KazagumoPlayer;
    const player = new ParlantePlayer(kazagumoPlayer, 'guild', 'channel');

    expect(player.addMixLayer('active', 1, 30_000)).toBe(true); // drains to dispatch
    for (let index = 0; index < 5; index += 1) {
      expect(player.addMixLayer(`pending-${index}`, 1, 30_000)).toBe(true);
    }
    expect(player.addMixLayer('overflow', 1, 30_000)).toBe(false);
  });
});

describe('now-playing requester', () => {
  test('shows who queued the current and upcoming tracks', () => {
    const upcoming = [
      {
        title: 'Queued Track',
        author: 'Queued Artist',
        length: 60_000,
        isStream: false,
        requester: '222222222222222222',
      },
    ];
    const kazagumoPlayer = {
      queue: {
        current: {
          title: 'Current Track',
          author: 'Current Artist',
          length: 120_000,
          isStream: false,
          requester: '111111111111111111',
        },
        size: upcoming.length,
        [Symbol.iterator]: () => upcoming[Symbol.iterator](),
      },
      paused: false,
      position: 30_000,
      loop: 'none',
    } as unknown as KazagumoPlayer;

    const { embed } = buildNowPlayingEmbed(kazagumoPlayer);

    expect(embed.description).toContain('<@111111111111111111>');
    expect(embed.description).toContain('Queued Track `[01:00]` · <@222222222222222222>');
  });

  test('escapes markdown and mention payloads in track metadata while keeping the requester mention', () => {
    const upcoming = [
      {
        title: '**Q** <@222222222222222222> [x](e.e)',
        author: 'Artist | _italics_',
        length: 60_000,
        isStream: false,
        requester: '222222222222222222',
      },
    ];
    const kazagumoPlayer = {
      queue: {
        current: {
          title: '<@111111111111111111> *current*',
          author: '~strike~',
          length: 120_000,
          isStream: false,
          requester: '111111111111111111',
        },
        size: upcoming.length,
        [Symbol.iterator]: () => upcoming[Symbol.iterator](),
      },
      paused: false,
      position: 30_000,
      loop: 'none',
    } as unknown as KazagumoPlayer;

    const { embed } = buildNowPlayingEmbed(kazagumoPlayer);

    // The requester mentions rendered deliberately survive escaping.
    expect(embed.description).toContain('<@111111111111111111>');
    expect(embed.description).toContain('<@222222222222222222>');

    // Title/author markdown is neutralized: no raw `**`, `_`, `~`, `[x](...)`.
    expect(embed.description).toContain('\\*\\*Q\\*\\*');
    expect(embed.description).toContain('\\<@222222222222222222\\>');
    expect(embed.description).toContain('\\[x\\]\\(e.e\\)');
    expect(embed.description).toContain('\\~strike\\~'); // current-track author escaped
    expect(embed.description).toContain('\\<@111111111111111111\\> \\*current\\*');
    expect(embed.description).not.toContain('*current*');
    expect(embed.description).not.toContain('**Q**');
  });
});

describe('now-playing link destination', () => {
  const buildPlayerWithUri = (uri: string) => {
    const kazagumoPlayer = {
      queue: {
        current: {
          title: 'Track Title',
          author: 'Artist',
          length: 60_000,
          isStream: false,
          uri,
        },
        size: 0,
        [Symbol.iterator]: () => [][Symbol.iterator](),
      },
      paused: false,
      position: 30_000,
      loop: 'none',
    } as unknown as KazagumoPlayer;
    return kazagumoPlayer;
  };

  test('a hostile URI cannot break out of the markdown destination', () => {
    const { embed } = buildNowPlayingEmbed(
      buildPlayerWithUri('https://safe.invalid/) [Open](https://evil.invalid'),
    );

    // The injected `)`, `[` and `(` are percent-encoded: the intended link
    // cannot end early and the fake link text can never become a second link.
    expect(embed.description).toContain(
      '[Track Title](https://safe.invalid/%29%20%5BOpen%5D%28https://evil.invalid)',
    );
    expect(embed.description).not.toContain('](https://evil.invalid');
    expect(embed.description).not.toContain(') [Open](https://evil.invalid');
  });

  test('URI credentials never reach the rendered embed', () => {
    const { embed } = buildNowPlayingEmbed(
      buildPlayerWithUri('https://admin:hunter2@example.com/track?id=1'),
    );

    expect(embed.description).toContain('[Track Title](https://example.com/track?id=1)');
    expect(embed.description).not.toContain('hunter2');
    expect(embed.description).not.toContain('admin@');
  });

  test('invalid and non-http URIs render a plain escaped title', () => {
    const plain = buildNowPlayingEmbed(buildPlayerWithUri('javascript:alert(1)'));
    expect(plain.embed.description).toContain('**Track Title**');
    expect(plain.embed.description).not.toContain('](');

    const malformed = buildNowPlayingEmbed(buildPlayerWithUri('http://'));
    expect(malformed.embed.description).toContain('**Track Title**');
    expect(malformed.embed.description).not.toContain('](');
  });
});
