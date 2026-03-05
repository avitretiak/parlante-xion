import { Declare, Command, type CommandContext, Middlewares } from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types';
import messages from '#parlante/utils/constants/messages';

@Declare({
  name: 'replay',
  description: messages.commands.replay.description,
})
@Middlewares(['commandQueue', 'voiceGuard'])
export default class ReplayCommand extends Command {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId!;
    const kazagumo = ctx.client.kazagumo;
    const kPlayer = kazagumo.players.get(guildId);

    if (!kPlayer || !kPlayer.queue.current) {
      await ctx.write({ content: messages.error.nothingPlaying, flags: MessageFlags.Ephemeral });
      return;
    }

    if (kPlayer.queue.current.isStream) {
      await ctx.write({
        content: messages.error.cantReplayLivestream,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    kPlayer.seek(0);
    await ctx.write({ content: messages.player.replayed, flags: MessageFlags.Ephemeral });
  }
}
