import { afterEach, beforeAll, describe, expect, jest, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Kazagumo } from 'kazagumo';
import { Logger } from 'seyfert';

// The entry point must be importable without running the CLI or installing
// real signal handlers (import.meta.main guard), but importing it opens the
// SQLite DB at DATA_DIR — so point DATA_DIR at a disposable directory first.
const dataDir = mkdtempSync(join(tmpdir(), 'parlante-platform-test-'));

const flushMicrotasks = async (times = 10): Promise<void> => {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
};

// Dynamic imports are required here: DATA_DIR must be set before these modules
// evaluate (db/index.ts opens the SQLite file at import time), and static
// imports would hoist above the assignment.
type IndexModule = typeof import('../src/index');
type ReadyRun = (user: unknown, client: unknown) => Promise<void>;

let entry: IndexModule;
let readyRun: ReadyRun;

beforeAll(async () => {
  process.env.DATA_DIR = dataDir;
  entry = await import('../src/index');
  // Structural cast: createEvent's payload shape is not exported by seyfert.
  const readyEvent = (await import('../src/events/ready')).default as { run: ReadyRun };
  readyRun = readyEvent.run;
});

afterEach(() => jest.useRealTimers());

describe('package scripts', () => {
  test('migrate-and-start passes the CLI argument explicitly', async () => {
    const pkg = (await Bun.file('package.json').json()) as { scripts: Record<string, string> };
    expect(pkg.scripts['migrate-and-start']).toBe('bun run src/index.ts migrate-and-start');
  });
});

describe('client mention policy', () => {
  test('global mention parsing is empty so embeds render requester mentions without pings', () => {
    expect(entry.client.options.allowedMentions).toEqual({
      replied_user: false,
      parse: [],
    });
  });
});

describe('Seyfert log adapter', () => {
  test('preserves Error details exactly once in the formatted message', () => {
    const err = new Error('boom');
    const out = entry.formatSeyfertLogArgs(['context', err]);

    expect(out).toContain('context');
    expect(out).toContain('"name":"Error"');
    expect(out.match(/"message":"boom"/g)).toHaveLength(1);
    expect(out).toContain('"stack"');
    expect(out).not.toBe('{}');
  });

  test('is installed and returns undefined (falsy) so Seyfert prints nothing', () => {
    expect(Logger.getCustomizer()).toBe(entry.seyfertLogAdapter);

    const result = entry.seyfertLogAdapter(
      { options: { name: '[Seyfert]' } } as Parameters<IndexModule['seyfertLogAdapter']>[0],
      3, // LogLevels.Error
      ['some error'],
    );
    expect(result).toBeUndefined();
  });
});

describe('botReady command registration', () => {
  test('uploads commands globally exactly once without mutating guildId', async () => {
    const uploadCommands = jest.fn(() => Promise.resolve());
    const commandA = { guildId: undefined };
    const commandB = { guildId: undefined };
    const client = {
      guilds: {
        list: jest.fn(() => Promise.resolve([{ id: 'guild-1' }, { id: 'guild-2' }])),
      },
      gateway: { setPresence: jest.fn() },
      kazagumo: { shoukaku: { addNode: jest.fn(() => Promise.resolve()) } },
      commands: { values: [commandA, commandB] },
      uploadCommands,
    };

    await readyRun({ username: 'test-bot' }, client);

    expect(uploadCommands).toHaveBeenCalledTimes(1);
    expect(client.commands.values.every((command) => command.guildId === undefined)).toBe(true);
    expect(client.kazagumo.shoukaku.addNode).toHaveBeenCalledTimes(1);
  });
});

describe('graceful shutdown', () => {
  const createKazagumo = (players: { destroy: () => Promise<void> }[]): Kazagumo =>
    ({
      // Maps mirror Kazagumo's player/node registries (dynamic string keys,
      // .get/.keys iteration) — not a static lookup table.
      players: new Map(players.map((player, index) => [`guild-${index}`, player])),
      shoukaku: {
        nodes: new Map([['nodelink', {}]]),
        removeNode: jest.fn(),
      },
    }) as unknown as Kazagumo;

  const exitSpy = () => jest.fn() as unknown as (code?: number) => never;

  test('awaits real player destruction before exiting 0', async () => {
    let release!: () => void;
    const destroy = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const kazagumo = createKazagumo([{ destroy }]);
    const exit = exitSpy();

    const shutdownPromise = entry.shutdownWithGrace(kazagumo, { exit });
    await flushMicrotasks();

    expect(destroy).toHaveBeenCalledTimes(1);

    let settled = false;
    void shutdownPromise.then(() => {
      settled = true;
    });
    await flushMicrotasks();
    expect(settled).toBe(false); // still awaiting the real teardown

    release();
    await shutdownPromise;

    expect(settled).toBe(true);
    expect(exit).toHaveBeenCalledWith(0);
  });

  test('tears down Shoukaku nodes after players', async () => {
    const kazagumo = createKazagumo([{ destroy: jest.fn(() => Promise.resolve()) }]);
    const exit = exitSpy();

    await entry.performShutdown(kazagumo);

    expect(kazagumo.shoukaku.removeNode).toHaveBeenCalledWith('nodelink', 'Bot shutting down');
    expect(exit).not.toHaveBeenCalled();
  });

  test('force-exits after the bounded grace window when teardown hangs', async () => {
    jest.useFakeTimers();
    const destroy = jest.fn(() => new Promise<void>(() => {}));
    const kazagumo = createKazagumo([{ destroy }]);
    const exit = exitSpy();

    void entry.shutdownWithGrace(kazagumo, { exit, graceMs: 250 });
    await flushMicrotasks();
    expect(destroy).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(249);
    expect(exit).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(exit).toHaveBeenCalledWith(1);
    // The teardown promise stays pending forever by design (destroy never
    // resolves); the force-exit already fired, so nothing else to await.
  });

  test('is idempotent: a second signal does not start a second teardown', async () => {
    let release!: () => void;
    const destroy = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const kazagumo = createKazagumo([{ destroy }]);
    const exit = exitSpy();

    const first = entry.shutdown(kazagumo, 'SIGTERM', { exit, graceMs: 10_000 });
    await flushMicrotasks();
    expect(destroy).toHaveBeenCalledTimes(1);

    const second = entry.shutdown(kazagumo, 'SIGINT', { exit });
    await flushMicrotasks();
    expect(destroy).toHaveBeenCalledTimes(1); // no second teardown sequence

    release();
    await first;
    await second;

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  test('exits 1 after all cleanup when a player teardown rejects', async () => {
    const rejectingDestroy = jest.fn(() => Promise.reject(new Error('node went away')));
    const cleanDestroy = jest.fn(() => Promise.resolve());
    const kazagumo = createKazagumo([{ destroy: rejectingDestroy }, { destroy: cleanDestroy }]);
    const exit = exitSpy();

    await entry.shutdownWithGrace(kazagumo, { exit });

    // Every player was still attempted and nodes torn down before the failure
    // surfaced as a failed exit.
    expect(rejectingDestroy).toHaveBeenCalledTimes(1);
    expect(cleanDestroy).toHaveBeenCalledTimes(1);
    expect(kazagumo.shoukaku.removeNode).toHaveBeenCalledWith('nodelink', 'Bot shutting down');
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe('deployment manifests', () => {
  // Bot-only settings the container must receive: every documented optional
  // variable from .env.example/README plus config reads. Sibling secrets
  // (Spotify, YouTube cipher) stay scoped to their own services.
  const BOT_ENV_VARS = [
    'DISCORD_TOKEN',
    'NODELINK_PASSWORD',
    'NODELINK_URL',
    'DATA_DIR',
    'LANGUAGE',
    'BOT_STATUS',
    'BOT_ACTIVITY_TYPE',
    'BOT_ACTIVITY',
    'BOT_ACTIVITY_URL',
    'LOG_LEVEL',
    'PRETTY_LOGS',
    'DATABASE_URL',
  ];
  const SIBLING_SECRETS = ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'YOUTUBE_CIPHER_TOKEN'];

  test('dev compose forwards every documented bot-only env var to the bot', async () => {
    const compose = await Bun.file('docker-compose.yml').text();
    // parlante-xion is the last service, so everything after its marker is
    // bot-owned (nodelink/youtube-cipher sections precede it).
    const botSection = compose.slice(compose.indexOf('parlante-xion:'));

    for (const name of BOT_ENV_VARS) {
      expect(botSection).toContain(`- ${name}=`);
    }
  });

  test('dev compose keeps sibling secrets out of the bot container', async () => {
    const compose = await Bun.file('docker-compose.yml').text();
    const botSection = compose.slice(compose.indexOf('parlante-xion:'));

    for (const name of SIBLING_SECRETS) {
      expect(botSection).not.toContain(name);
    }
    // The secrets are still forwarded to their own services.
    expect(compose.slice(0, compose.indexOf('parlante-xion:'))).toContain('SPOTIFY_CLIENT_ID');
    expect(compose.slice(0, compose.indexOf('parlante-xion:'))).toContain('YOUTUBE_CIPHER_TOKEN');
  });

  test('Dockerfile pins an immutable syntax frontend digest', async () => {
    const dockerfile = await Bun.file('Dockerfile').text();
    expect(dockerfile.split('\n')[0]).toBe(
      '# syntax=docker/dockerfile:1.26.0@sha256:ecfaec9ed6d810b56388c508f4121597bfbba70d41a6dfeee4d8cad5f295fc32',
    );
  });
});
