import { ComponentCommand, type ComponentContext } from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types';
import { playersManager } from '#parlante/managers/players';
import messages from '#parlante/utils/constants/messages';

const HANDLED_IDS = ['player_toggle_play_pause', 'player_skip', 'player_stop'];

export default class PlayerControlsCommand extends ComponentCommand {
  componentType = 'Button' as const;

  filter(ctx: ComponentContext<'Button'>): boolean {
    return HANDLED_IDS.includes(ctx.customId);
  }

  async run(ctx: ComponentContext<'Button'>) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({
        content: messages.error.notInDirectMessage,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const kazagumo = ctx.client.kazagumo;
    const kPlayer = kazagumo.players.get(guildId);
    const parlantePlayer = playersManager.get(guildId);

    if (!kPlayer || !kPlayer.queue.current) {
      await ctx.write({ content: messages.error.nothingPlaying, flags: MessageFlags.Ephemeral });
      return;
    }

    const member = ctx.member;
    if (member) {
      const userVoiceState = await member.voice('flow');
      if (!userVoiceState?.channelId || userVoiceState.channelId !== kPlayer.voiceId) {
        await ctx.write({
          content: messages.error.notInVoiceChannel,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    await ctx.deferUpdate();

    switch (ctx.customId) {
      case 'player_toggle_play_pause': {
        if (kPlayer.paused) {
          kPlayer.pause(false);
        } else {
          kPlayer.pause(true);
        }
        if (parlantePlayer) {
          await parlantePlayer.sendOrUpdateNowPlaying(ctx.client, true);
        }
        break;
      }
      case 'player_skip': {
        if (kPlayer.queue.size === 0) {
          await ctx.followup({
            content: messages.error.noSongToSkip,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        kPlayer.skip();
        break;
      }
      case 'player_stop': {
        try {
          await kazagumo.destroyPlayer(guildId);
        } catch {}
        break;
      }
    }
  }
}
