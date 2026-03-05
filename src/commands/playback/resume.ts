import { Declare, Command, type CommandContext, Middlewares } from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types';
import messages from '#parlante/utils/constants/messages';

@Declare({
  name: 'resume',
  description: messages.commands.resume.description,
})
@Middlewares(['commandQueue', 'voiceGuard'])
export default class ResumeCommand extends Command {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId!;
    const kazagumo = ctx.client.kazagumo;
    const kPlayer = kazagumo.players.get(guildId);

    if (!kPlayer || !kPlayer.queue.current) {
      await ctx.write({ content: messages.error.nothingPlaying, flags: MessageFlags.Ephemeral });
      return;
    }

    if (kPlayer.paused) {
      kPlayer.pause(false);
      await ctx.write({ content: messages.player.resumed, flags: MessageFlags.Ephemeral });
    } else {
      await ctx.write({ content: messages.error.alreadyPlaying, flags: MessageFlags.Ephemeral });
    }
  }
}
