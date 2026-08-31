import { describe, expect, test } from 'bun:test';
import type { ComponentContext } from 'seyfert';
import PlayerControlsCommand from '../src/components/player-controls';
import { runExclusive } from '../src/middlewares/command-queue';

const makeCtx = (guildId: string, order: string[], kPlayer?: unknown): ComponentContext<'Button'> =>
  ({
    guildId,
    customId: 'player_toggle_play_pause',
    deferUpdate: async () => order.push('deferUpdate'),
    write: async () => order.push('write'),
    followup: async () => order.push('followup'),
    member: undefined,
    client: {
      kazagumo: {
        players: kPlayer === undefined ? new Map() : new Map([[guildId, kPlayer]]),
      },
    },
  }) as unknown as ComponentContext<'Button'>;

describe('player-controls acknowledgement ordering', () => {
  test('acknowledges the button before waiting on the held guild lock', async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    // Hold the per-guild lock so the component's runExclusive call must wait.
    const held = runExclusive('guild-held', () => gate);

    const runPromise = new PlayerControlsCommand().run(makeCtx('guild-held', order));

    // The lock is still held; the acknowledgement must already have happened.
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['deferUpdate']);

    release();
    await held;
    await runPromise;

    // Validation failure after acquisition goes through a followup on the
    // acknowledged interaction; no second acknowledgement is attempted.
    expect(order).toEqual(['deferUpdate', 'followup']);
    expect(order.filter((entry) => entry === 'deferUpdate')).toHaveLength(1);
    expect(order).not.toContain('write');
  });

  test('validation failures after acquisition use followups, never write', async () => {
    const order: string[] = [];
    const kPlayer = {
      queue: { current: { title: 'now playing' }, size: 0 },
      voiceId: 'voice-bot',
    };
    const ctx = makeCtx('guild-voice', order, kPlayer);
    ctx.member = {
      voice: async () => ({ channelId: 'voice-other' }),
    } as never;

    await new PlayerControlsCommand().run(ctx);

    expect(order).toEqual(['deferUpdate', 'followup']);
    expect(order).not.toContain('write');
  });
});
