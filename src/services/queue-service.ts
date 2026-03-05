import type { KazagumoPlayer } from 'kazagumo';
import type { KazagumoTrack } from 'kazagumo';

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
