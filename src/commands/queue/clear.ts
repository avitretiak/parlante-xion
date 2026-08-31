import { Declare, Command, type CommandContext, Middlewares } from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types';
import messages from '#parlante/utils/constants/messages';

@Declare({
  name: 'clear',
  description: messages.commands.clear.description,
})
@Middlewares(['voiceGuard', 'commandQueue'])
export default class ClearCommand extends Command {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId!;
    const kazagumo = ctx.client.kazagumo;
    const kPlayer = kazagumo.players.get(guildId);

    if (!kPlayer || !kPlayer.queue.current) {
      await ctx.write({ content: messages.error.nothingPlaying, flags: MessageFlags.Ephemeral });
      return;
    }

    kPlayer.queue.clear();
    await ctx.write({ content: messages.queue.cleared, flags: MessageFlags.Ephemeral });
  }
}
