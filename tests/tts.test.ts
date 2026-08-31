import { afterEach, describe, expect, jest, mock, test } from 'bun:test';
import type { KazagumoPlayer } from 'kazagumo';
import type { CommandContext } from 'seyfert';
import TtsCommand from '../src/commands/playback/tts';
import { playersManager } from '../src/managers/players';
import messages from '../src/utils/constants/messages';

const TTS_MAX_MESSAGE_LENGTH = 1024;

const buildCtx = (message: string) => {
  const deferReply = mock(() => Promise.resolve());
  const editOrReply = mock(() => Promise.resolve());
  const ctx = {
    deferReply,
    editOrReply,
    options: { message },
    guildId: 'guild-1',
    // Enough for the happy-path length check: no player means the command
    // stops at mustBePlaying instead of touching the NodeLink resolver.
    client: { kazagumo: { players: { get: () => null } } },
  };
  return { ctx: ctx as unknown as CommandContext<{ message: string }>, editOrReply };
};

describe('TtsCommand message length', () => {
  test('rejects messages longer than the Discord option maximum', async () => {
    const { ctx, editOrReply } = buildCtx('x'.repeat(TTS_MAX_MESSAGE_LENGTH + 1));

    await new TtsCommand().run(ctx);

    expect(editOrReply).toHaveBeenCalledTimes(1);
    expect(editOrReply.mock.calls[0][0]).toEqual({
      content: messages.commands.tts.tooLong(TTS_MAX_MESSAGE_LENGTH),
      flags: expect.anything(),
    });
  });

  test('accepts a message at the maximum length', async () => {
    const { ctx, editOrReply } = buildCtx('x'.repeat(TTS_MAX_MESSAGE_LENGTH));

    await new TtsCommand().run(ctx);

    // Passed the length gate; stopped at the player check instead.
    expect(editOrReply).toHaveBeenCalledTimes(1);
    expect(editOrReply.mock.calls[0][0]).toEqual({
      content: messages.commands.tts.mustBePlaying,
      flags: expect.anything(),
    });
  });
});

describe('TtsCommand queue capacity', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    playersManager.delete('guild-1');
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
  });

  test('a full mix queue is rejected before any remote resolve call', async () => {
    jest.useFakeTimers();
    // Held-open POST (never resolved) keeps the active item playing so the
    // pending queue grows.
    const { promise: heldOpen } = Promise.withResolvers<void>();
    globalThis.fetch = jest.fn(() => heldOpen) as unknown as typeof fetch;

    const kazagumoPlayer = {
      guildId: 'guild-1',
      shoukaku: { node: { sessionId: 'session-1' } },
      queue: { current: null },
    } as unknown as KazagumoPlayer;
    const parlantePlayer = playersManager.create('guild-1', kazagumoPlayer, 'channel');

    // Fill the queue: one active (dispatched) plus five pending.
    expect(parlantePlayer.addMixLayer('active', 1, 30_000)).toBe(true);
    for (let index = 0; index < 5; index += 1) {
      expect(parlantePlayer.addMixLayer(`pending-${index}`, 1, 30_000)).toBe(true);
    }
    expect(parlantePlayer.hasTtsCapacity()).toBe(false);

    const resolve = mock(() => Promise.resolve({ loadType: 'TRACK', data: {} }));
    const deferReply = mock(() => Promise.resolve());
    const editOrReply = mock(() => Promise.resolve());
    const ctx = {
      deferReply,
      editOrReply,
      options: { message: 'hello' },
      guildId: 'guild-1',
      client: {
        kazagumo: {
          players: { get: () => ({ playing: true }) },
          shoukaku: {
            options: {
              nodeResolver: () => ({ sessionId: 'session-1', rest: { resolve } }),
            },
          },
        },
      },
    } as unknown as CommandContext<{ message: string }>;

    await new TtsCommand().run(ctx);

    // Full queue must never pay for (or trigger) remote synthesis.
    expect(resolve).not.toHaveBeenCalled();
    expect(editOrReply).toHaveBeenCalledTimes(1);
    expect(editOrReply.mock.calls[0][0]).toEqual({
      content: messages.commands.tts.queueFull,
      flags: expect.anything(),
    });
  });
});
