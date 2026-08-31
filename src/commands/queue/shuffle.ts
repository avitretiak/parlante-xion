import { Declare, Command, type CommandContext, Middlewares } from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types';
import messages from '#parlante/utils/constants/messages';

@Declare({
  name: 'shuffle',
  description: messages.commands.shuffle.description,
})
@Middlewares(['voiceGuard', 'commandQueue'])
export default class ShuffleCommand extends Command {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId!;
    const kazagumo = ctx.client.kazagumo;
    const kPlayer = kazagumo.players.get(guildId);

    if (!kPlayer || !kPlayer.queue.current) {
      await ctx.write({ content: messages.error.nothingPlaying, flags: MessageFlags.Ephemeral });
      return;
    }

    if (kPlayer.queue.size < 2) {
      await ctx.write({
        content: messages.error.notEnoughSongsToShuffle,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    kPlayer.queue.shuffle();
    await ctx.write({ content: messages.queue.shuffled, flags: MessageFlags.Ephemeral });
  }
}
