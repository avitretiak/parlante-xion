import { Declare, Command, type CommandContext, Middlewares } from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types';
import messages from '#parlante/utils/constants/messages';

@Declare({
  name: 'loop',
  description: messages.commands.loop.description,
})
@Middlewares(['commandQueue', 'voiceGuard'])
export default class LoopCommand extends Command {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId!;
    const kazagumo = ctx.client.kazagumo;
    const kPlayer = kazagumo.players.get(guildId);

    if (!kPlayer || !kPlayer.queue.current) {
      await ctx.write({ content: messages.error.nothingPlaying, flags: MessageFlags.Ephemeral });
      return;
    }

    if (kPlayer.loop === 'track') {
      kPlayer.setLoop('none');
      await ctx.write({
        content: messages.queue.stoppedLoopingSong,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      kPlayer.setLoop('track');
      await ctx.write({ content: messages.queue.loopedSong, flags: MessageFlags.Ephemeral });
    }
  }
}
