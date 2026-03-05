import type { KazagumoPlayer } from 'kazagumo';
import { ParlantePlayer } from '../structures/player';

class PlayersManager {
  private readonly players = new Map<string, ParlantePlayer>();

  get(guildId: string): ParlantePlayer | undefined {
    return this.players.get(guildId);
  }

  create(guildId: string, kazagumoPlayer: KazagumoPlayer, textChannelId: string): ParlantePlayer {
    const existing = this.players.get(guildId);
    if (existing) {
      existing.textChannelId = textChannelId;
      return existing;
    }
    const player = new ParlantePlayer(kazagumoPlayer, guildId, textChannelId);
    this.players.set(guildId, player);
    return player;
  }

  delete(guildId: string): void {
    this.players.delete(guildId);
  }
}

export const playersManager = new PlayersManager();
export { PlayersManager };
