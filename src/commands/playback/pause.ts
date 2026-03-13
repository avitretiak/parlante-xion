import { Declare, Command, type CommandContext, Middlewares } from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types';
import messages from '#parlante/utils/constants/messages';

@Declare({
  name: 'pause',
  description: messages.commands.pause.description,
})
@Middlewares(['voiceGuard', 'commandQueue'])
export default class PauseCommand extends Command {
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
      kPlayer.pause(true);
      await ctx.write({ content: messages.player.paused, flags: MessageFlags.Ephemeral });
    }
  }
}
