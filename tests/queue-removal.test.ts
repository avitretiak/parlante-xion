import { afterEach, describe, expect, jest, test } from 'bun:test';
import type { AutocompleteInteraction, ComponentContext } from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types';
import type { KazagumoPlayer, KazagumoTrack } from 'kazagumo';
import RemoveCommand, { removeOptions } from '../src/commands/queue/remove';
import PlayerControlsCommand from '../src/components/player-controls';
import QueueRemovalComponent from '../src/components/queue-removal';
import { runExclusive } from '../src/middlewares/command-queue';
import { playersManager } from '../src/managers/players';
import {
  formatQueueTrackChoiceLabel,
  getQueueFingerprint,
  getQueueTrackFingerprint,
  removeQueuedTrack,
} from '../src/services/queue-service';
import messages from '../src/utils/constants/messages';

const GUILD_ID = 'guild-id';
const VALID_USER_ID = '123456789012345678';

type TrackOverrides = Partial<
  Pick<
    KazagumoTrack,
    'title' | 'author' | 'sourceName' | 'identifier' | 'uri' | 'requester' | 'length' | 'isStream'
  >
>;

const makeTrack = (overrides: TrackOverrides = {}): KazagumoTrack =>
  ({
    title: 'Song',
    author: 'Artist',
    sourceName: 'youtube',
    identifier: 'id-1',
    uri: 'https://example.com/1',
    requester: undefined,
    length: 180_000,
    isStream: false,
    ...overrides,
  }) as unknown as KazagumoTrack;

/** Array-backed stand-in for KazagumoQueue: iterable, spliceable, `size`/`current`. */
class MockQueue<T extends KazagumoTrack> extends Array<T> {
  current: T | null = null;

  get size(): number {
    return this.length;
  }

  remove(position: number): MockQueue<T> {
    this.splice(position, 1);
    return this;
  }
}

const makePlayer = (tracks: KazagumoTrack[], current: KazagumoTrack) => {
  const queue = new MockQueue<KazagumoTrack>(...tracks);
  queue.current = current;
  return { queue, voiceId: 'voice-bot', guildId: GUILD_ID };
};

const makeClient = (kPlayer: unknown) => ({
  kazagumo: { players: new Map([[GUILD_ID, kPlayer]]) },
});

const makeButtonCtx = (kPlayer: unknown, order: string[]) =>
  ({
    guildId: GUILD_ID,
    customId: 'player_remove_queue',
    deferUpdate: async () => order.push('deferUpdate'),
    write: jest.fn(async () => order.push('write')),
    followup: jest.fn(async () => order.push('followup')),
    member: undefined,
    client: makeClient(kPlayer),
  }) as unknown as ComponentContext<'Button'>;

const makeSelectCtx = (kPlayer: unknown, order: string[], values: string[] = []) =>
  ({
    guildId: GUILD_ID,
    interaction: { values },
    deferUpdate: async () => order.push('deferUpdate'),
    write: jest.fn(async () => order.push('write')),
    editOrReply: jest.fn(async () => order.push('editOrReply')),
    followup: jest.fn(async () => order.push('followup')),
    member: undefined,
    client: makeClient(kPlayer),
  }) as unknown as ComponentContext<'StringSelect'>;

/** Three-part select value as the button builds it: position, track, queue. */
const queueSelectValue = (kPlayer: unknown, position: number, track: KazagumoTrack): string =>
  `${position}:${getQueueTrackFingerprint(track)}:${getQueueFingerprint(kPlayer as KazagumoPlayer)}`;

const makeAutocomplete = (kPlayer: unknown, focused: string | number) => {
  const interaction = {
    guildId: GUILD_ID,
    getInput: () => focused,
    client: makeClient(kPlayer),
    respond: jest.fn(),
  };
  return {
    interaction: interaction as unknown as AutocompleteInteraction,
    respond: interaction.respond as jest.Mock,
  };
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('formatQueueTrackChoiceLabel', () => {
  test('renders "position. artist - title [source]"', () => {
    const track = makeTrack({ title: 'Song Name', author: 'The Artist', sourceName: 'youtube' });
    expect(formatQueueTrackChoiceLabel(track, 3)).toBe('3. The Artist - Song Name [youtube]');
  });

  test('stays at or below 100 characters for pathological titles and artists', () => {
    const track = makeTrack({
      title: 'x'.repeat(200),
      author: 'y'.repeat(100),
      sourceName: 'soundcloud',
    });
    const label = formatQueueTrackChoiceLabel(track, 42);
    expect(label.length).toBeLessThanOrEqual(100);
    expect(label.startsWith('42. ')).toBe(true);
    expect(label.endsWith('[soundcloud]')).toBe(true);
  });

  test('caps pathological source names within the 100-character limit', () => {
    const label = formatQueueTrackChoiceLabel(
      makeTrack({ title: 'Song', author: 'Artist', sourceName: 'source'.repeat(30) }),
      1,
    );
    expect(label.length).toBeLessThanOrEqual(100);
  });
});

describe('getQueueTrackFingerprint', () => {
  test('produces a compact base64url SHA-256 fingerprint', () => {
    const fingerprint = getQueueTrackFingerprint(makeTrack());
    expect(fingerprint).toHaveLength(43); // 32 bytes, unpadded base64url
    expect(fingerprint).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test('is stable across calls for identical track identity', () => {
    const track = makeTrack({ title: 'Stable', requester: VALID_USER_ID });
    expect(getQueueTrackFingerprint(track)).toBe(getQueueTrackFingerprint(track));
  });

  test('changes when track identity changes', () => {
    const base = makeTrack({ title: 'Same', requester: VALID_USER_ID });
    expect(getQueueTrackFingerprint(base)).not.toBe(
      getQueueTrackFingerprint(
        makeTrack({ title: 'Same', requester: VALID_USER_ID, uri: 'https://example.com/2' }),
      ),
    );
    expect(getQueueTrackFingerprint(base)).not.toBe(
      getQueueTrackFingerprint(makeTrack({ title: 'Other', requester: VALID_USER_ID })),
    );
  });

  test('includes the requester in the identity', () => {
    const base = makeTrack({ title: 'Same' });
    expect(getQueueTrackFingerprint(base)).not.toBe(
      getQueueTrackFingerprint(makeTrack({ title: 'Same', requester: VALID_USER_ID })),
    );
  });
});

describe('getQueueFingerprint', () => {
  const current = makeTrack({ title: 'Now Playing' });

  test('produces a compact base64url SHA-256 fingerprint', () => {
    const player = makePlayer(
      [makeTrack({ identifier: 'a' }), makeTrack({ identifier: 'b' })],
      current,
    );
    const fingerprint = getQueueFingerprint(player);
    expect(fingerprint).toHaveLength(43); // 32 bytes, unpadded base64url
    expect(fingerprint).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test('is stable across calls for an unchanged queue', () => {
    const player = makePlayer([makeTrack({ identifier: 'a' })], current);
    expect(getQueueFingerprint(player)).toBe(getQueueFingerprint(player));
  });

  test('changes when the queue order changes', () => {
    const trackA = makeTrack({ identifier: 'a' });
    const trackB = makeTrack({ identifier: 'b' });
    expect(getQueueFingerprint(makePlayer([trackA, trackB], current))).not.toBe(
      getQueueFingerprint(makePlayer([trackB, trackA], current)),
    );
  });

  test('changes when the queue length changes, even with identical tracks', () => {
    const trackA = makeTrack({ identifier: 'a' });
    expect(getQueueFingerprint(makePlayer([trackA], current))).not.toBe(
      getQueueFingerprint(makePlayer([trackA, makeTrack({ identifier: 'a' })], current)),
    );
  });

  test('changes when an exact duplicate is replaced by a distinct queue entry', () => {
    const first = makeTrack({ title: 'Same', identifier: 'same', requester: VALID_USER_ID });
    const replacement = makeTrack({
      title: 'Same',
      identifier: 'same',
      requester: VALID_USER_ID,
    });
    expect(getQueueFingerprint(makePlayer([first], current))).not.toBe(
      getQueueFingerprint(makePlayer([replacement], current)),
    );
  });

  test('covers only the pending queue, never the current track', () => {
    const trackA = makeTrack({ identifier: 'a' });
    expect(getQueueFingerprint(makePlayer([trackA], makeTrack({ title: 'Now Playing' })))).toBe(
      getQueueFingerprint(makePlayer([trackA], makeTrack({ title: 'Other Current' }))),
    );
  });
});

describe('removeQueuedTrack', () => {
  const current = makeTrack({ title: 'Now Playing' });

  test('removes the track at the 1-based position and returns it', () => {
    const player = makePlayer(
      [makeTrack({ title: 'A', identifier: 'a' }), makeTrack({ title: 'B', identifier: 'b' })],
      current,
    );
    const removed = removeQueuedTrack(player, 1);
    expect(removed?.title).toBe('A');
    expect([...player.queue].map((t) => t.title)).toEqual(['B']);
    expect(player.queue.current).toBe(current);
  });

  test('leaves the queue untouched when the fingerprint does not match', () => {
    const trackA = makeTrack({ title: 'A', identifier: 'a' });
    const trackB = makeTrack({ title: 'B', identifier: 'b' });
    const player = makePlayer([trackA, trackB], current);
    const before = [...player.queue].map((t) => t.title);

    expect(removeQueuedTrack(player, 2, getQueueTrackFingerprint(trackA))).toBeNull();
    expect([...player.queue].map((t) => t.title)).toEqual(before);
    expect(player.queue.current).toBe(current);
  });

  test('leaves the queue untouched when the position no longer exists', () => {
    const player = makePlayer([makeTrack({ title: 'A', identifier: 'a' })], current);
    expect(removeQueuedTrack(player, 2, getQueueTrackFingerprint(makeTrack()))).toBeNull();
    expect([...player.queue].map((t) => t.title)).toEqual(['A']);
  });

  test('rejects non-positive positions', () => {
    const player = makePlayer([makeTrack({ title: 'A', identifier: 'a' })], current);
    expect(removeQueuedTrack(player, 0)).toBeNull();
    expect([...player.queue].map((t) => t.title)).toEqual(['A']);
  });

  test('removes by position alone when no fingerprint is expected', () => {
    const player = makePlayer(
      [makeTrack({ title: 'A', identifier: 'a' }), makeTrack({ title: 'B', identifier: 'b' })],
      current,
    );
    expect(removeQueuedTrack(player, 2)?.title).toBe('B');
    expect([...player.queue].map((t) => t.title)).toEqual(['A']);
  });

  test('rejects a changed queue before any track comparison or mutation', () => {
    const trackA = makeTrack({ title: 'A', identifier: 'a' });
    const trackB = makeTrack({ title: 'B', identifier: 'b' });
    const player = makePlayer([trackA, trackB], current);
    const reordered = makePlayer([trackB, trackA], current);

    expect(
      removeQueuedTrack(
        player,
        1,
        getQueueTrackFingerprint(trackA),
        getQueueFingerprint(reordered),
      ),
    ).toBeNull();
    expect([...player.queue].map((t) => t.title)).toEqual(['A', 'B']);
    expect(player.queue.current).toBe(current);
  });

  test('removes when both the track and the queue fingerprint match', () => {
    const trackA = makeTrack({ title: 'A', identifier: 'a' });
    const trackB = makeTrack({ title: 'B', identifier: 'b' });
    const player = makePlayer([trackA, trackB], current);

    const removed = removeQueuedTrack(
      player,
      1,
      getQueueTrackFingerprint(trackA),
      getQueueFingerprint(player),
    );
    expect(removed?.title).toBe('A');
    expect([...player.queue].map((t) => t.title)).toEqual(['B']);
    expect(player.queue.current).toBe(current);
  });
});

describe('/remove', () => {
  const current = makeTrack({ title: 'Now Playing' });

  test('rejects out-of-range positions without touching the queue', async () => {
    const kPlayer = makePlayer([makeTrack({ title: 'A', identifier: 'a' })], current);
    const write = jest.fn();
    const ctx = {
      guildId: GUILD_ID,
      options: { position: 2 },
      client: makeClient(kPlayer),
      write,
    } as never;

    await new RemoveCommand().run(ctx);

    expect(write).toHaveBeenCalledWith({
      content: messages.error.itemNotFound,
      flags: MessageFlags.Ephemeral,
    });
    expect([...kPlayer.queue].map((t) => t.title)).toEqual(['A']);
    expect(kPlayer.queue.current).toBe(current);
  });

  test('removes the intended queued item and refreshes the now-playing card', async () => {
    const kPlayer = makePlayer(
      [
        makeTrack({ title: 'A', identifier: 'a' }),
        makeTrack({ title: 'B', identifier: 'b' }),
        makeTrack({ title: 'C', identifier: 'c' }),
      ],
      current,
    );
    const refresh = jest.fn();
    jest.spyOn(playersManager, 'get').mockReturnValue({ sendOrUpdateNowPlaying: refresh } as never);
    const write = jest.fn();
    const client = makeClient(kPlayer);
    const ctx = { guildId: GUILD_ID, options: { position: 2 }, client, write } as never;

    await new RemoveCommand().run(ctx);

    expect([...kPlayer.queue].map((t) => t.title)).toEqual(['A', 'C']);
    expect(kPlayer.queue.current).toBe(current);
    expect(refresh).toHaveBeenCalledWith(client, true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]?.[0]?.flags).toBe(MessageFlags.Ephemeral);
  });
});

describe('/remove autocomplete', () => {
  const current = makeTrack({ title: 'Now Playing' });

  test('responds with up to 25 numeric position choices using queue labels', async () => {
    const tracks = Array.from({ length: 30 }, (_, index) =>
      makeTrack({ title: `Track ${index + 1}`, identifier: `id-${index + 1}` }),
    );
    const kPlayer = makePlayer(tracks, current);
    const { interaction, respond } = makeAutocomplete(kPlayer, '');

    await removeOptions.position.autocomplete!(interaction);

    const choices = respond.mock.calls[0]?.[0] as Array<{ name: string; value: number }>;
    expect(choices).toHaveLength(25);
    choices.forEach((choice, index) => {
      expect(choice.value).toBe(index + 1);
      expect(choice.name).toBe(formatQueueTrackChoiceLabel(tracks[index]!, index + 1));
    });
  });

  test('filters by focused position', async () => {
    const kPlayer = makePlayer(
      [
        makeTrack({ title: 'Alpha', author: 'Bob', identifier: 'a' }),
        makeTrack({ title: 'Gamma', author: 'Zed', identifier: 'b' }),
        makeTrack({ title: 'Delta', author: 'Quinn', identifier: 'c' }),
      ],
      current,
    );
    const { interaction, respond } = makeAutocomplete(kPlayer, 3);

    await removeOptions.position.autocomplete!(interaction);

    const choices = respond.mock.calls[0]?.[0] as Array<{ name: string; value: number }>;
    expect(choices.some((c) => c.value === 3)).toBe(true);
    expect(choices.every((c) => c.value !== 1)).toBe(true);
  });

  test('responds empty when no player exists', async () => {
    const { interaction, respond } = makeAutocomplete(undefined, '');
    await removeOptions.position.autocomplete!(interaction);
    expect(respond).toHaveBeenCalledWith([]);
  });
});

describe('player_remove_queue button', () => {
  test('opens an ephemeral select with the first 25 queued tracks and a limited prompt', async () => {
    const current = makeTrack({ title: 'Now Playing' });
    const tracks = Array.from({ length: 30 }, (_, index) =>
      makeTrack({ title: `Track ${index + 1}`, identifier: `id-${index + 1}` }),
    );
    const kPlayer = makePlayer(tracks, current);
    const order: string[] = [];
    const ctx = makeButtonCtx(kPlayer, order);

    await new PlayerControlsCommand().run(ctx);

    expect(order).toEqual(['deferUpdate', 'followup']);
    const writeBody = (ctx.followup as jest.Mock).mock.calls[0]?.[0] as {
      content: string;
      flags: number;
      components: Array<{ components: Array<{ toJSON: () => any }> }>;
    };
    expect(writeBody.flags).toBe(MessageFlags.Ephemeral);
    expect(writeBody.content).toBe(
      `${messages.queue.removePrompt}\n\n${messages.queue.removePromptLimited(30 - 25)}`,
    );

    const row = writeBody.components[0]!;
    const select = row.components[0]!;
    const json = select.toJSON();
    expect(json.custom_id).toBe('queue_remove_select');
    expect(json.placeholder).toBe(messages.queue.removeSelectPlaceholder);
    expect(json.options).toHaveLength(25);
    json.options.forEach((option: { label: string; value: string }, index: number) => {
      const track = tracks[index]!;
      expect(option.label).toBe(formatQueueTrackChoiceLabel(track, index + 1));
      expect(option.value).toBe(
        `${index + 1}:${getQueueTrackFingerprint(track)}:${getQueueFingerprint(kPlayer)}`,
      );
      expect(option.value.length).toBeLessThanOrEqual(100);
    });
  });

  test('uses the plain prompt when the whole queue fits in the menu', async () => {
    const current = makeTrack({ title: 'Now Playing' });
    const kPlayer = makePlayer(
      [makeTrack({ title: 'A', identifier: 'a' }), makeTrack({ title: 'B', identifier: 'b' })],
      current,
    );
    const order: string[] = [];
    const ctx = makeButtonCtx(kPlayer, order);

    await new PlayerControlsCommand().run(ctx);

    const writeBody = (ctx.followup as jest.Mock).mock.calls[0]?.[0] as {
      content: string;
      components: Array<{ components: Array<{ toJSON: () => any }> }>;
    };
    expect(writeBody.content).toBe(messages.queue.removePrompt);
    const json = writeBody.components[0]!.components[0]!.toJSON();
    expect(json.options).toHaveLength(2);
  });

  test('attributes the requester in the option description only for valid user IDs', async () => {
    const current = makeTrack({ title: 'Now Playing' });
    const kPlayer = makePlayer(
      [
        makeTrack({ title: 'Requested', requester: VALID_USER_ID }),
        makeTrack({ title: 'Anonymous', requester: 'not-a-user-id' }),
        makeTrack({ title: 'NoRequester', requester: undefined }),
      ],
      current,
    );
    const ctx = makeButtonCtx(kPlayer, []);
    Object.assign(ctx.client, {
      cache: {
        users: {
          raw: jest.fn(async () => ({ username: 'avi', global_name: 'Avi' })),
        },
      },
    });

    await new PlayerControlsCommand().run(ctx);

    const writeBody = (ctx.followup as jest.Mock).mock.calls[0]?.[0] as {
      components: Array<{ components: Array<{ toJSON: () => any }> }>;
    };
    const options = writeBody.components[0]!.components[0]!.toJSON().options as Array<{
      label: string;
      description?: string;
    }>;
    expect(options[0]?.description).toBe(messages.queue.removeRequester('@Avi'));
    expect(options[1]?.description).toBeUndefined();
    expect(options[2]?.description).toBeUndefined();
  });
});

describe('queue_remove_select component', () => {
  const current = makeTrack({ title: 'Now Playing' });

  test('acknowledges the select before waiting on the held guild lock', async () => {
    const kPlayer = makePlayer([makeTrack({ title: 'A', identifier: 'a' })], current);
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const held = runExclusive(GUILD_ID, () => gate);

    const ctx = makeSelectCtx(kPlayer, order, [
      queueSelectValue(kPlayer, 1, makeTrack({ title: 'A', identifier: 'a' })),
    ]);
    ctx.member = { voice: async () => ({ channelId: 'voice-other' }) } as never;

    const runPromise = new QueueRemovalComponent().run(ctx);

    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['deferUpdate']);

    release();
    await held;
    await runPromise;

    expect(order).toEqual(['deferUpdate', 'editOrReply']);
    expect(order.filter((entry) => entry === 'deferUpdate')).toHaveLength(1);
  });

  test('clears the menu for validation failures after acquisition', async () => {
    const kPlayer = makePlayer([makeTrack({ title: 'A', identifier: 'a' })], current);
    const order: string[] = [];
    const ctx = makeSelectCtx(kPlayer, order, [
      queueSelectValue(kPlayer, 1, makeTrack({ title: 'A', identifier: 'a' })),
    ]);
    ctx.member = { voice: async () => ({ channelId: 'voice-other' }) } as never;

    await new QueueRemovalComponent().run(ctx);

    expect(order).toEqual(['deferUpdate', 'editOrReply']);
    expect(ctx.editOrReply as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ content: messages.error.notInVoiceChannel, components: [] }),
    );
    expect(order).not.toContain('write');
    expect(order).not.toContain('followup');
  });

  test('stale fingerprint leaves the queue untouched and replaces the menu with the stale message', async () => {
    const trackA = makeTrack({ title: 'A', identifier: 'a' });
    const trackB = makeTrack({ title: 'B', identifier: 'b' });
    const kPlayer = makePlayer([trackA, trackB], current);
    const order: string[] = [];
    const ctx = makeSelectCtx(kPlayer, order, [queueSelectValue(kPlayer, 2, trackA)]);

    await new QueueRemovalComponent().run(ctx);

    expect([...kPlayer.queue].map((t) => t.title)).toEqual(['A', 'B']);
    expect(kPlayer.queue.current).toBe(current);
    expect(ctx.editOrReply as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ content: messages.queue.removeStale }),
    );
    expect((ctx.editOrReply as jest.Mock).mock.calls[0]?.[0]?.components ?? []).toHaveLength(0);
    expect(
      (ctx.followup as jest.Mock).mock.calls.length + (ctx.write as jest.Mock).mock.calls.length,
    ).toBe(0);
  });

  test('a position that vanished from the queue is treated as stale', async () => {
    const trackA = makeTrack({ title: 'A', identifier: 'a' });
    const kPlayer = makePlayer([trackA], current);
    const order: string[] = [];
    const ctx = makeSelectCtx(kPlayer, order, [queueSelectValue(kPlayer, 3, trackA)]);

    await new QueueRemovalComponent().run(ctx);

    expect([...kPlayer.queue].map((t) => t.title)).toEqual(['A']);
    expect(ctx.editOrReply as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ content: messages.queue.removeStale }),
    );
    expect((ctx.editOrReply as jest.Mock).mock.calls[0]?.[0]?.components ?? []).toHaveLength(0);
  });

  test('removes the exact queued track and refreshes the now-playing card', async () => {
    const trackA = makeTrack({ title: 'A', identifier: 'a' });
    const trackB = makeTrack({ title: 'B', identifier: 'b' });
    const trackC = makeTrack({ title: 'C', identifier: 'c' });
    const kPlayer = makePlayer([trackA, trackB, trackC], current);
    const refresh = jest.fn();
    jest.spyOn(playersManager, 'get').mockReturnValue({ sendOrUpdateNowPlaying: refresh } as never);
    const order: string[] = [];
    const client = makeClient(kPlayer);
    const ctx = makeSelectCtx(kPlayer, order, [queueSelectValue(kPlayer, 2, trackB)]);
    ctx.client = client as never;

    await new QueueRemovalComponent().run(ctx);

    expect([...kPlayer.queue].map((t) => t.title)).toEqual(['A', 'C']);
    expect(kPlayer.queue.current).toBe(current);
    expect(refresh).toHaveBeenCalledWith(client, true);
    expect((ctx.editOrReply as jest.Mock).mock.calls[0]?.[0]?.content).toBe(
      messages.queue.removedTrack(trackB.title!),
    );
  });

  test('rejects values whose fingerprint groups are not exactly 43 base64url chars', async () => {
    const trackA = makeTrack({ title: 'A', identifier: 'a' });
    const kPlayer = makePlayer([trackA], current);
    const order: string[] = [];
    const ctx = makeSelectCtx(kPlayer, order, [`1:${getQueueTrackFingerprint(trackA)}:short`]);

    await new QueueRemovalComponent().run(ctx);

    expect([...kPlayer.queue].map((t) => t.title)).toEqual(['A']);
    expect(kPlayer.queue.current).toBe(current);
    expect(ctx.editOrReply as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ content: messages.queue.removeStale }),
    );
    expect((ctx.editOrReply as jest.Mock).mock.calls[0]?.[0]?.components ?? []).toHaveLength(0);
  });

  test('exact duplicate replacement after the menu opened is stale and leaves the second copy', async () => {
    // A1 and A2 share the full track identity, so their track fingerprints are
    // identical: the old two-part value could not tell them apart.
    const trackA1 = makeTrack({ title: 'A', identifier: 'a' });
    const trackA2 = makeTrack({ title: 'A', identifier: 'a' });
    const kPlayer = makePlayer([trackA1, trackA2], current);
    const order: string[] = [];
    const ctx = makeButtonCtx(kPlayer, order);

    await new PlayerControlsCommand().run(ctx);

    const writeBody = (ctx.followup as jest.Mock).mock.calls[0]?.[0] as {
      components: Array<{ components: Array<{ toJSON: () => any }> }>;
    };
    const options = writeBody.components[0]!.components[0]!.toJSON().options as Array<{
      value: string;
    }>;
    const snapshotValue = options[0]!.value;
    expect(snapshotValue).toBe(
      `1:${getQueueTrackFingerprint(trackA1)}:${getQueueFingerprint(kPlayer)}`,
    );

    // The first copy is removed before submit; only the identical second copy
    // remains at position 1.
    expect(removeQueuedTrack(kPlayer, 1)?.title).toBe('A');
    expect([...kPlayer.queue].map((t) => t.title)).toEqual(['A']);

    const selectCtx = makeSelectCtx(kPlayer, [], [snapshotValue]);
    await new QueueRemovalComponent().run(selectCtx);

    expect([...kPlayer.queue].map((t) => t.title)).toEqual(['A']);
    expect(kPlayer.queue.current).toBe(current);
    expect(selectCtx.editOrReply as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ content: messages.queue.removeStale }),
    );
    expect((selectCtx.editOrReply as jest.Mock).mock.calls[0]?.[0]?.components ?? []).toHaveLength(
      0,
    );
  });
});
