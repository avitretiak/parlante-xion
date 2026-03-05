import { Declare, Command, type CommandContext, Middlewares } from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types';
import messages from '#parlante/utils/constants/messages';

@Declare({
  name: 'unskip',
  description: messages.commands.unskip.description,
})
@Middlewares(['commandQueue', 'voiceGuard'])
export default class UnskipCommand extends Command {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId!;
    const kazagumo = ctx.client.kazagumo;
    const kPlayer = kazagumo.players.get(guildId);

    if (!kPlayer || !kPlayer.queue.current) {
      await ctx.write({ content: messages.error.nothingPlaying, flags: MessageFlags.Ephemeral });
      return;
    }

    const prevTrack = kPlayer.getPrevious(true);
    if (!prevTrack) {
      await ctx.write({ content: messages.error.noSongToGoBack, flags: MessageFlags.Ephemeral });
      return;
    }

    await kPlayer.play(prevTrack);
    await ctx.write({ content: messages.queue.movedBack, flags: MessageFlags.Ephemeral });
  }
}
