import { afterEach, describe, expect, jest, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Kazagumo, KazagumoPlayer } from 'kazagumo';
import type { Client } from 'seyfert';
import { Constants } from 'shoukaku';

// The kazagumo module opens a SQLite database at import time, so the env must
// be pointed at a throwaway location BEFORE the module graph is evaluated.
// Static imports are hoisted above this setup, hence the dynamic imports here.
const tempDir = mkdtempSync(path.join(tmpdir(), 'kazagumo-test-'));
process.env.DATA_DIR = tempDir;
process.env.DATABASE_URL = `file:${path.join(tempDir, 'test.db')}`;

const { initKazagumo, isNodeRecoveryHealthy } = await import('../src/structures/kazagumo');
const { destroyPlayer, playersManager } = await import('../src/managers/players');

const flushMicrotasks = async (times = 6): Promise<void> => {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
};

const createClientStub = (): Client => {
  const client = {
    gateway: {
      send: jest.fn(),
      calculateShardId: jest.fn(() => 0),
    },
    events: { values: {} },
    botId: 'bot-1',
    rest: { request: jest.fn(async () => ({})) },
    messages: {
      write: jest.fn(async () => ({ id: 'msg' })),
      edit: jest.fn(async () => {}),
      delete: jest.fn(async () => {}),
    },
  };
  return client as unknown as Client;
};

describe('destroyPlayer', () => {
  test('awaits the real KazagumoPlayer.destroy promise', async () => {
    let release!: () => void;
    const { promise, resolve } = Promise.withResolvers<void>();
    release = resolve;
    const destroy = jest.fn(() => promise);
    const player = { destroy } as unknown as KazagumoPlayer;
    const kazagumo = { players: new Map([['guild-a', player]]) } as unknown as Kazagumo;

    let settled = false;
    const pending = destroyPlayer(kazagumo, 'guild-a').then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(destroy).toHaveBeenCalledTimes(1);

    release();
    await pending;
    expect(settled).toBe(true);
  });

  test('swallows already-destroyed failures', async () => {
    const player = {
      destroy: jest.fn(async () => {
        throw new Error('Player is already destroyed');
      }),
    } as unknown as KazagumoPlayer;
    const kazagumo = { players: new Map([['guild-b', player]]) } as unknown as Kazagumo;

    await expect(destroyPlayer(kazagumo, 'guild-b')).resolves.toBeUndefined();
    expect(player.destroy).toHaveBeenCalledTimes(1);
  });

  test('no-ops when the player is already gone', async () => {
    const kazagumo = { players: new Map() } as unknown as Kazagumo;
    await expect(destroyPlayer(kazagumo, 'guild-c')).resolves.toBeUndefined();
  });

  test('identity-cleans the wrapper and rethrows on real teardown failures', async () => {
    const error = new Error('REST failure');
    const player = {
      guildId: 'guild-d',
      destroy: jest.fn(async () => {
        throw error;
      }),
    } as unknown as KazagumoPlayer;
    const kazagumo = { players: new Map([['guild-d', player]]) } as unknown as Kazagumo;
    playersManager.create('guild-d', player, 'channel');

    // Real failures must not report success...
    await expect(destroyPlayer(kazagumo, 'guild-d')).rejects.toBe(error);
    // ...and the dead DESTROYING player must not stay reusable via the wrapper
    // or the Kazagumo registry.
    expect(playersManager.get('guild-d')).toBeUndefined();
    expect(kazagumo.players.get('guild-d')).toBeUndefined();
  });

  test('teardown failure never deletes a newer registry entry', async () => {
    const error = new Error('REST failure');
    let releaseDestroy!: () => void;
    const oldPlayer = {
      destroy: jest.fn(
        () =>
          new Promise<void>((_, reject) => {
            releaseDestroy = () => reject(error);
          }),
      ),
    } as unknown as KazagumoPlayer;
    const newPlayer = {
      destroy: jest.fn(async () => {}),
    } as unknown as KazagumoPlayer;
    const kazagumo = { players: new Map([['guild-f', oldPlayer]]) } as unknown as Kazagumo;
    playersManager.create('guild-f', oldPlayer, 'channel');

    const pending = destroyPlayer(kazagumo, 'guild-f');
    await Promise.resolve();

    // A newer Kazagumo player replaces the failed one while teardown is in
    // flight — registry and wrapper both move to it.
    kazagumo.players.set('guild-f', newPlayer);
    playersManager.create('guild-f', newPlayer, 'channel');

    releaseDestroy!();
    await expect(pending).rejects.toBe(error);
    // The registry cleanup targets identity, never guildId: the newer live
    // entry and its wrapper must both survive.
    expect(kazagumo.players.get('guild-f')).toBe(newPlayer);
    expect(playersManager.get('guild-f')?.kazagumoPlayer).toBe(newPlayer);
    playersManager.delete('guild-f');
  });

  test('teardown failure never drops a wrapper rebound to a newer player', async () => {
    const error = new Error('REST failure');
    const oldPlayer = {
      destroy: jest.fn(async () => {
        throw error;
      }),
    } as unknown as KazagumoPlayer;
    const newPlayer = {
      destroy: jest.fn(async () => {}),
    } as unknown as KazagumoPlayer;
    const kazagumo = { players: new Map([['guild-e', oldPlayer]]) } as unknown as Kazagumo;
    playersManager.create('guild-e', oldPlayer, 'channel');
    playersManager.create('guild-e', newPlayer, 'channel');

    await expect(destroyPlayer(kazagumo, 'guild-e')).rejects.toBe(error);
    expect(playersManager.get('guild-e')?.kazagumoPlayer).toBe(newPlayer);
    playersManager.delete('guild-e');
  });
});

describe('isNodeRecoveryHealthy', () => {
  test('local paused state alone is not remote confirmation', () => {
    expect(isNodeRecoveryHealthy({ playing: false, paused: true, position: 0 }, 42_000)).toBe(
      false,
    );
  });

  test('an unpaused player needs real progress beyond the baseline', () => {
    expect(isNodeRecoveryHealthy({ playing: true, paused: false, position: 0 }, 0)).toBe(false);
    expect(isNodeRecoveryHealthy({ playing: true, paused: false, position: 1_000 }, 5_000)).toBe(
      false,
    );
    expect(isNodeRecoveryHealthy({ playing: true, paused: false, position: 6_000 }, 5_000)).toBe(
      true,
    );
    expect(isNodeRecoveryHealthy({ playing: false, paused: false, position: 6_000 }, 5_000)).toBe(
      false,
    );
  });
});

describe('playerDestroy identity guard', () => {
  afterEach(() => {
    playersManager.delete('guild-stale');
    jest.useRealTimers();
  });

  test('a stale destroy event cannot remove a rebound wrapper', async () => {
    jest.useFakeTimers();
    const kazagumo = initKazagumo(createClientStub());

    const oldPlayer = {
      guildId: 'guild-stale',
      queue: { current: null },
      shoukaku: { node: { sessionId: '' } },
    } as unknown as KazagumoPlayer;
    const newPlayer = {
      guildId: 'guild-stale',
      queue: { current: null },
      shoukaku: { node: { sessionId: '' } },
    } as unknown as KazagumoPlayer;

    playersManager.create('guild-stale', oldPlayer, 'channel');
    playersManager.create('guild-stale', newPlayer, 'channel');
    expect(playersManager.get('guild-stale')?.kazagumoPlayer).toBe(newPlayer);

    // Old player finishes tearing down after the wrapper was rebound: the
    // event must be ignored, leaving the live wrapper untouched.
    kazagumo.emit('playerDestroy', oldPlayer);
    await flushMicrotasks(50);
    expect(playersManager.get('guild-stale')?.kazagumoPlayer).toBe(newPlayer);

    // A matching event still cleans up normally.
    kazagumo.emit('playerDestroy', newPlayer);
    await flushMicrotasks(50);
    expect(playersManager.get('guild-stale')).toBeUndefined();
  });
});

describe('node recovery watchdog', () => {
  afterEach(() => {
    playersManager.delete('guild-paused');
    playersManager.delete('guild-paused-fail');
    playersManager.delete('guild-replaced');
    playersManager.delete('guild-unpaused');
    playersManager.delete('guild-nodewait');
    jest.useRealTimers();
  });

  const createNodePlayer = (guildId: string, paused: boolean, resume?: jest.Mock) => {
    const kPlayer = {
      guildId,
      state: undefined,
      playing: false,
      paused,
      position: 0,
      voiceId: 'voice-1',
      queue: {
        current: {
          identifier: 'track-1',
          isStream: false,
          isSeekable: true,
          length: 100_000,
          title: 'Track',
        },
        size: 0,
      },
      shoukaku: {
        node: { sessionId: 'sess', state: Constants.State.CONNECTED },
        resume: resume ?? jest.fn(async () => {}),
      },
      destroy: jest.fn(async () => {}),
    };
    return {
      kPlayer: kPlayer as unknown as KazagumoPlayer,
      resume: kPlayer.shoukaku.resume,
      destroy: kPlayer.destroy,
    };
  };

  test('a paused player is confirmed by the awaited remote request and the watchdog stops', async () => {
    jest.useFakeTimers();
    const kazagumo = initKazagumo(createClientStub());
    const { kPlayer, resume, destroy } = createNodePlayer('guild-paused', true);

    playersManager.create('guild-paused', kPlayer, 'channel');
    kazagumo.players.set('guild-paused', kPlayer);
    kazagumo.shoukaku.emit('ready', 'node-1', false, true);

    jest.advanceTimersByTime(15_000); // first verification
    await flushMicrotasks(20);

    expect(resume).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledWith({ position: 0, paused: true });

    // Recovery cleared on success: no further requests, no skip/destroy.
    jest.advanceTimersByTime(120_000);
    await flushMicrotasks(20);
    expect(resume).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
  });

  test('while the node is reconnecting (no session) the watchdog defers instead of PATCHing /sessions/null', async () => {
    jest.useFakeTimers();
    const kazagumo = initKazagumo(createClientStub());
    const { kPlayer, resume, destroy } = createNodePlayer('guild-nodewait', true);
    // Node mid-reconnect: CONNECTING with no session yet — a PATCH here would
    // go to /sessions/null and fail with 404.
    const node = kPlayer.shoukaku.node as { sessionId: string | null; state: number };
    node.state = Constants.State.CONNECTING;
    node.sessionId = null;

    playersManager.create('guild-nodewait', kPlayer, 'channel');
    kazagumo.players.set('guild-nodewait', kPlayer);
    kazagumo.shoukaku.emit('ready', 'node-1', false, true);

    // First verification: node not ready — no resume PATCH, entry rechecks.
    jest.advanceTimersByTime(15_000);
    await flushMicrotasks(20);
    expect(resume).not.toHaveBeenCalled();

    // Node comes back with a live session: the recheck now resumes playback
    // and the paused player is confirmed by the awaited remote request.
    node.state = Constants.State.CONNECTED;
    node.sessionId = 'fresh-sess';
    jest.advanceTimersByTime(5_000);
    await flushMicrotasks(20);
    expect(resume).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledWith({ position: 0, paused: true });

    // Watchdog stopped: no repeated requests, no skip/destroy.
    jest.advanceTimersByTime(120_000);
    await flushMicrotasks(20);
    expect(resume).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
  });

  test('failed paused confirmations stay bounded and never destroy the player', async () => {
    jest.useFakeTimers();
    const kazagumo = initKazagumo(createClientStub());
    const resume = jest.fn(async () => {
      throw new Error('node down');
    });
    const { kPlayer, destroy } = createNodePlayer('guild-paused-fail', true, resume);

    playersManager.create('guild-paused-fail', kPlayer, 'channel');
    kazagumo.players.set('guild-paused-fail', kPlayer);
    kazagumo.shoukaku.emit('ready', 'node-1', false, true);

    // Three replay attempts within the retry policy...
    jest.advanceTimersByTime(15_000); // attempt 1
    await flushMicrotasks(20);
    jest.advanceTimersByTime(5_000); // attempt 2
    await flushMicrotasks(20);
    jest.advanceTimersByTime(5_000); // attempt 3
    await flushMicrotasks(20);

    expect(resume).toHaveBeenCalledTimes(3);

    // ...then a bounded give-up: no further requests and no skip/destroy.
    jest.advanceTimersByTime(5_000); // exhaustion check
    await flushMicrotasks(20);
    jest.advanceTimersByTime(120_000);
    await flushMicrotasks(20);

    expect(resume).toHaveBeenCalledTimes(3);
    expect(destroy).not.toHaveBeenCalled();
  });

  test('a newer recovery entry survives an older pending resume completion', async () => {
    jest.useFakeTimers();
    const kazagumo = initKazagumo(createClientStub());

    let releaseResume!: () => void;
    const resume = jest.fn();
    resume.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseResume = resolve;
        }),
    );
    resume.mockResolvedValue(undefined);
    const { kPlayer, destroy } = createNodePlayer('guild-replaced', true, resume);

    playersManager.create('guild-replaced', kPlayer, 'channel');
    kazagumo.players.set('guild-replaced', kPlayer);
    kazagumo.shoukaku.emit('ready', 'node-1', false, true);

    // First verification fires the replay; the remote request is held open.
    jest.advanceTimersByTime(15_000);
    await flushMicrotasks(20);
    expect(resume).toHaveBeenCalledTimes(1);

    // A newer recovery entry replaces this guild's while the request is
    // pending — the old completion must not delete or reschedule it.
    kazagumo.shoukaku.emit('ready', 'node-1', false, true);
    releaseResume!();
    await flushMicrotasks(20);

    // The newer entry's own watchdog still runs and verifies: the old
    // completion cleared nothing.
    jest.advanceTimersByTime(15_000);
    await flushMicrotasks(20);
    expect(resume).toHaveBeenCalledTimes(2);

    // Newer entry confirmed and cleared by its own request: no more replays.
    jest.advanceTimersByTime(120_000);
    await flushMicrotasks(20);
    expect(resume).toHaveBeenCalledTimes(2);
    expect(destroy).not.toHaveBeenCalled();
  });

  test('replay uses the current pause intent, not the stale snapshot', async () => {
    jest.useFakeTimers();
    const kazagumo = initKazagumo(createClientStub());
    const { kPlayer, resume, destroy } = createNodePlayer('guild-unpaused', true);

    playersManager.create('guild-unpaused', kPlayer, 'channel');
    kazagumo.players.set('guild-unpaused', kPlayer);
    kazagumo.shoukaku.emit('ready', 'node-1', false, true); // snapshot: paused=true

    // The user unpauses before the watchdog runs.
    kPlayer.paused = false;

    jest.advanceTimersByTime(15_000);
    await flushMicrotasks(20);

    // The remote request must carry the current intent...
    expect(resume).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledWith({ position: 0, paused: false });

    // ...and an unpaused success cannot clear the watchdog without progress:
    // it keeps verifying until playback is actually healthy.
    kPlayer.playing = true;
    kPlayer.position = 1_000;
    jest.advanceTimersByTime(5_000);
    await flushMicrotasks(20);
    expect(resume).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
  });
});

describe('playerDestroy recheck between awaited side effects', () => {
  afterEach(() => {
    playersManager.delete('guild-rebind');
    jest.useRealTimers();
  });

  test('a destroy event cannot clear the new player voice status or card', async () => {
    jest.useFakeTimers();
    const client = createClientStub();
    const kazagumo = initKazagumo(client);

    let releaseStatus!: () => void;
    (client.rest.request as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseStatus = resolve;
        }),
    );

    const oldPlayer = {
      guildId: 'guild-rebind',
      voiceId: 'voice-1',
      queue: { current: null },
      shoukaku: { node: { sessionId: '' } },
    } as unknown as KazagumoPlayer;
    const newPlayer = {
      guildId: 'guild-rebind',
      voiceId: 'voice-1',
      queue: { current: null },
      shoukaku: { node: { sessionId: '' } },
    } as unknown as KazagumoPlayer;

    playersManager.create('guild-rebind', oldPlayer, 'channel');
    kazagumo.emit('playerDestroy', oldPlayer);
    await flushMicrotasks(20);

    // The old player's event is parked in clearVoiceStatus; the wrapper gets
    // rebound to a newer player while the request is pending.
    expect(client.rest.request).toHaveBeenCalledTimes(1);
    playersManager.create('guild-rebind', newPlayer, 'channel');
    expect(playersManager.get('guild-rebind')?.kazagumoPlayer).toBe(newPlayer);

    releaseStatus();
    await flushMicrotasks(20);

    // The old event must not delete the new wrapper's card nor drop it.
    expect(client.messages.delete).not.toHaveBeenCalled();
    expect(playersManager.get('guild-rebind')?.kazagumoPlayer).toBe(newPlayer);
  });
});

describe('playerDestroy mix cleanup ordering', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    playersManager.delete('guild-mix-rollover');
    jest.useRealTimers();
  });

  test('deletes the origin-session layer before local handles clear', async () => {
    jest.useFakeTimers();
    const fetchMock = jest.fn((url: string, init?: { method?: string }) => {
      if (init?.method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ mixes: [{ id: 'mix-1' }] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const kazagumo = initKazagumo(createClientStub());
    const node = { sessionId: 'session-1' };
    const player = {
      guildId: 'guild-mix-rollover',
      queue: { current: null },
      shoukaku: { node },
    } as unknown as KazagumoPlayer;

    playersManager.create('guild-mix-rollover', player, 'channel');
    const parlantePlayer = playersManager.get('guild-mix-rollover');
    expect(parlantePlayer).toBeDefined();
    parlantePlayer!.addMixLayer('encoded-track', 1, 30_000);
    await flushMicrotasks(10); // handle installed for session-1

    node.sessionId = 'session-2'; // rollover before teardown

    kazagumo.emit('playerDestroy', player);
    await flushMicrotasks(30);

    // Cleanup must reach the origin session while its local handle still
    // exists — destroy() wiping activeMixes first would leave only the
    // current session, and this DELETE could never fire.
    const deleteUrls = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'DELETE')
      .map(([url]) => url as string);
    expect(deleteUrls.some((url) => url.includes('/sessions/session-1/'))).toBe(true);

    // Handler finished its teardown for the matching wrapper.
    expect(playersManager.get('guild-mix-rollover')).toBeUndefined();
  });
});
