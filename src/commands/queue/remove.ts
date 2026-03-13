import {
  Declare,
  Command,
  type CommandContext,
  Options,
  createIntegerOption,
  Middlewares,
} from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types';
import messages from '#parlante/utils/constants/messages';

const removeOptions = {
  position: createIntegerOption({
    description: messages.commands.remove.position,
    required: true,
    min_value: 1,
  }),
};

@Declare({
  name: 'remove',
  description: messages.commands.remove.description,
})
@Options(removeOptions)
@Middlewares(['voiceGuard', 'commandQueue'])
export default class RemoveCommand extends Command {
  async run(ctx: CommandContext<typeof removeOptions>) {
    const guildId = ctx.guildId!;
    const kazagumo = ctx.client.kazagumo;
    const kPlayer = kazagumo.players.get(guildId);

    if (!kPlayer || !kPlayer.queue.current) {
      await ctx.write({ content: messages.error.nothingPlaying, flags: MessageFlags.Ephemeral });
      return;
    }

    const position = ctx.options.position;

    if (position > kPlayer.queue.size) {
      await ctx.write({ content: messages.error.itemNotFound, flags: MessageFlags.Ephemeral });
      return;
    }

    kPlayer.queue.remove(position - 1);
    await ctx.write({ content: messages.queue.removed, flags: MessageFlags.Ephemeral });
  }
}
