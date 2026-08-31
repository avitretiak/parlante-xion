import { Declare, Command, type CommandContext, Middlewares } from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types';
import { destroyPlayer } from '#parlante/managers/players';
import messages from '#parlante/utils/constants/messages';

@Declare({
  name: 'disconnect',
  description: messages.commands.disconnect.description,
})
@Middlewares(['voiceGuard', 'commandQueue'])
export default class DisconnectCommand extends Command {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId!;
    const kazagumo = ctx.client.kazagumo;
    const kPlayer = kazagumo.players.get(guildId);

    if (!kPlayer) {
      await ctx.write({
        content: messages.error.noPlayersToDisconnect,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await destroyPlayer(kazagumo, guildId);
    await ctx.write({ content: messages.queue.disconnected, flags: MessageFlags.Ephemeral });
  }
}
