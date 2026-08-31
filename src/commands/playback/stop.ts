import { Declare, Command, type CommandContext, Middlewares } from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types';
import { destroyPlayer } from '#parlante/managers/players';
import messages from '#parlante/utils/constants/messages';

@Declare({
  name: 'stop',
  description: messages.commands.stop.description,
})
@Middlewares(['voiceGuard', 'commandQueue'])
export default class StopCommand extends Command {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId!;
    const kazagumo = ctx.client.kazagumo;
    const kPlayer = kazagumo.players.get(guildId);

    if (!kPlayer) {
      await ctx.write({ content: messages.error.notConnected, flags: MessageFlags.Ephemeral });
      return;
    }

    kPlayer.queue.clear();
    kPlayer.skip();
    await destroyPlayer(kazagumo, guildId);

    await ctx.write({ content: messages.queue.stopped, flags: MessageFlags.Ephemeral });
  }
}
