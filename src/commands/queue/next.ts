import { Declare, Command, type CommandContext, Middlewares } from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types';
import messages from '#parlante/utils/constants/messages';

@Declare({
  name: 'next',
  description: messages.commands.next.description,
})
@Middlewares(['voiceGuard', 'commandQueue'])
export default class NextCommand extends Command {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId!;
    const kazagumo = ctx.client.kazagumo;
    const kPlayer = kazagumo.players.get(guildId);

    if (!kPlayer || !kPlayer.queue.current) {
      await ctx.write({ content: messages.error.nothingPlaying, flags: MessageFlags.Ephemeral });
      return;
    }

    if (kPlayer.queue.size === 0) {
      await ctx.write({ content: messages.error.noSongToSkip, flags: MessageFlags.Ephemeral });
      return;
    }

    kPlayer.skip();
    await ctx.write({ content: messages.queue.skipped, flags: MessageFlags.Ephemeral });
  }
}
