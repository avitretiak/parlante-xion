import { createHash } from 'node:crypto';
import type { Kazagumo, KazagumoPlayer, KazagumoSearchResult, KazagumoTrack } from 'kazagumo';
import { playersManager } from '#parlante/managers/players';
import messages from '#parlante/utils/constants/messages';
import { getTrackTitle, truncate } from '#parlante/utils/general/string';
import { isExplicitPlaylistUrl } from '#parlante/utils/general/url';

type EnqueueTracksOptions = {
  guildId: string;
  voiceId: string;
  textChannelId: string;
  shardId: number;
  tracks: KazagumoTrack[];
  defaultVolume?: number | null;
  front: boolean;
  shuffle: boolean;
  skip: boolean;
};

const shuffleTracks = (tracks: KazagumoTrack[]): KazagumoTrack[] => {
  const shuffled = [...tracks];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index]!, shuffled[swapIndex]!] = [shuffled[swapIndex]!, shuffled[index]!];
  }
  return shuffled;
};

export function addToQueue(
  player: KazagumoPlayer,
  tracks: KazagumoTrack[],
  options: { front?: boolean; shuffle?: boolean } = {},
): void {
  const { front = false, shuffle = false } = options;
  const resolvedTracks = shuffle ? shuffleTracks(tracks) : tracks;

  if (resolvedTracks.length === 0) {
    return;
  }

  if (front) {
    player.queue.splice(0, 0, ...resolvedTracks);
    return;
  }

  player.queue.add(resolvedTracks);
}

export function resolveQueueTracks(
  result: KazagumoSearchResult,
  query: string,
  playlistLimit: number,
): KazagumoTrack[] {
  if (result.type === 'SEARCH' || result.type === 'TRACK') {
    return result.tracks.slice(0, 1);
  }

  if (result.type === 'PLAYLIST' && !isExplicitPlaylistUrl(query)) {
    return result.tracks.slice(0, 1);
  }

  if (result.type === 'PLAYLIST' && playlistLimit && result.tracks.length > playlistLimit) {
    return result.tracks.slice(0, playlistLimit);
  }

  return result.tracks;
}

export async function enqueueTracks(
  kazagumo: Kazagumo,
  {
    guildId,
    voiceId,
    textChannelId,
    shardId,
    tracks,
    defaultVolume,
    front,
    shuffle,
    skip,
  }: EnqueueTracksOptions,
): Promise<KazagumoPlayer> {
  let player = kazagumo.players.get(guildId);
  if (!player) {
    player = await kazagumo.createPlayer({
      guildId,
      voiceId,
      textId: textChannelId,
      deaf: true,
      shardId,
    });

    if (defaultVolume !== undefined && defaultVolume !== null) {
      player.setVolume(defaultVolume);
    }
  }

  playersManager.create(guildId, player, textChannelId);
  addToQueue(player, tracks, { front, shuffle });

  if (skip && player.queue.current) {
    player.skip();
  }

  if (!player.playing && !player.paused) {
    await player.play();
  }

  return player;
}

const CHOICE_LABEL_MAX_LENGTH = 100;

const queueEntryIds = new WeakMap<object, number>();
let nextQueueEntryId = 0;
const getQueueEntryId = (track: KazagumoTrack): number => {
  const existing = queueEntryIds.get(track);
  if (existing !== undefined) return existing;
  const id = ++nextQueueEntryId;
  queueEntryIds.set(track, id);
  return id;
};

// Discord caps select option labels (and autocomplete choice names) at 100
// characters. Normalize line breaks and cap the source before budgeting the
// artist/title core so the assembled label always fits.
export const formatQueueTrackChoiceLabel = (track: KazagumoTrack, position: number): string => {
  const artist = (track.author ?? messages.player.unknownArtist).replace(/\s+/g, ' ').trim();
  const title = getTrackTitle(track).replace(/\s+/g, ' ').trim();
  const source = truncate((track.sourceName ?? 'unknown').replace(/\s+/g, ' ').trim(), 20);
  const prefix = `${position}. `;
  const suffix = ` [${source}]`;
  const maxCoreLength = Math.max(4, CHOICE_LABEL_MAX_LENGTH - prefix.length - suffix.length);
  return `${prefix}${truncate(`${artist} - ${title}`, maxCoreLength)}${suffix}`;
};

// Compact SHA-256 base64url over the full stable track identity (including
// requester), so a queued track — and only that exact track — can be
// recognized later even after other mutations shifted the queue.
export const getQueueTrackFingerprint = (track: KazagumoTrack): string =>
  createHash('sha256')
    .update(
      JSON.stringify([
        track.title,
        track.author,
        track.uri,
        track.identifier,
        track.sourceName,
        track.length,
        track.isStream,
        track.requester,
      ]),
    )
    .digest('base64url');

// Compact SHA-256 base64url over the ordered identity of every pending queue
// entry. Per-object IDs distinguish exact metadata duplicates while the track
// fingerprint also detects in-place metadata changes. WeakMap entries vanish
// with their tracks; no queue lifecycle cleanup is needed.
export const getQueueFingerprint = (player: KazagumoPlayer): string =>
  createHash('sha256')
    .update(
      JSON.stringify(
        [...player.queue].map((track) => [getQueueEntryId(track), getQueueTrackFingerprint(track)]),
      ),
    )
    .digest('base64url');

// Removes the queued track at `position` (1-based) and returns it. The current
// track is never touched: positions outside the queued range return null, and
// an `expectedFingerprint` that does not match the track currently at that
// position also returns null without mutating the queue. When
// `expectedQueueFingerprint` is supplied it is compared against the current
// queue first, so a menu built against an older queue snapshot is rejected
// before any track comparison or mutation.
export function removeQueuedTrack(
  player: KazagumoPlayer,
  position: number,
  expectedFingerprint?: string,
  expectedQueueFingerprint?: string,
): KazagumoTrack | null {
  if (
    expectedQueueFingerprint !== undefined &&
    getQueueFingerprint(player) !== expectedQueueFingerprint
  ) {
    return null;
  }
  if (!Number.isInteger(position) || position < 1 || position > player.queue.size) {
    return null;
  }
  const target = player.queue[position - 1];
  if (!target) return null;
  if (
    expectedFingerprint !== undefined &&
    getQueueTrackFingerprint(target) !== expectedFingerprint
  ) {
    return null;
  }
  player.queue.remove(position - 1);
  return target;
}
