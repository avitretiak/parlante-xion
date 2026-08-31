import type { Kazagumo, KazagumoPlayer } from 'kazagumo';
import { ParlantePlayer } from '../structures/player';
import { debug } from '#parlante/utils/system/logger';

const ALREADY_DESTROYED_MESSAGE = 'Player is already destroyed';

const isAlreadyDestroyedError = (err: unknown): boolean =>
  err instanceof Error && err.message === ALREADY_DESTROYED_MESSAGE;

/**
 * Centralized async player teardown. The library's `kazagumo.destroyPlayer()`
 * is synchronous and fire-and-forget; the real teardown happens in
 * `KazagumoPlayer.destroy()` (leave voice channel, destroy on the node, remove
 * itself from `kazagumo.players`, emit `playerDestroy`) and returns a promise.
 * Every callsite must route through here to actually await that teardown.
 *
 * Only the library's idempotency failure (already-destroyed/destroying) is
 * swallowed. Any real teardown failure leaves the Kazagumo player registered
 * in a DESTROYING state — the wrapper is identity-cleaned so nothing reuses
 * the dead player, and the error is rethrown so callers fail honestly instead
 * of reporting success while the dead entry remains.
 */
export async function destroyPlayer(kazagumo: Kazagumo, guildId: string): Promise<void> {
  const player = kazagumo.players.get(guildId);
  if (!player) return;
  try {
    await player.destroy();
  } catch (err) {
    if (isAlreadyDestroyedError(err)) {
      debug(`[${guildId}] Player already destroyed, nothing to do`);
      return;
    }
    // Real teardown failure: the Kazagumo player stays registered (the library
    // removes it only after teardown succeeds). Drop our wrapper AND the
    // registry entry so no caller reuses the DESTROYING player — but never
    // drop a wrapper or entry that was already replaced by a newer, live one.
    const wrapper = playersManager.get(guildId);
    if (wrapper && wrapper.kazagumoPlayer === player) {
      playersManager.delete(guildId);
    }
    if (kazagumo.players.get(guildId) === player) {
      kazagumo.players.delete(guildId);
    }
    debug(`[${guildId}] Failed to destroy player`, err);
    throw err;
  }
}

class PlayersManager {
  private readonly players = new Map<string, ParlantePlayer>();

  get(guildId: string): ParlantePlayer | undefined {
    return this.players.get(guildId);
  }

  create(guildId: string, kazagumoPlayer: KazagumoPlayer, textChannelId: string): ParlantePlayer {
    const existing = this.players.get(guildId);
    if (existing) {
      existing.setKazagumoPlayer(kazagumoPlayer);
      existing.textChannelId = textChannelId;
      return existing;
    }
    const player = new ParlantePlayer(kazagumoPlayer, guildId, textChannelId);
    this.players.set(guildId, player);
    return player;
  }

  delete(guildId: string): void {
    const player = this.players.get(guildId);
    if (player) {
      player.destroy();
    }
    this.players.delete(guildId);
  }
}

export const playersManager = new PlayersManager();
export { PlayersManager };
