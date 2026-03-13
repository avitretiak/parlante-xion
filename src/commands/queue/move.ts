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

const moveOptions = {
  from: createIntegerOption({
    description: messages.commands.move.from,
    required: true,
    min_value: 1,
  }),
  to: createIntegerOption({
    description: messages.commands.move.to,
    required: true,
    min_value: 1,
  }),
};

@Declare({
  name: 'move',
  description: messages.commands.move.description,
})
@Options(moveOptions)
@Middlewares(['voiceGuard', 'commandQueue'])
export default class MoveCommand extends Command {
  async run(ctx: CommandContext<typeof moveOptions>) {
    const guildId = ctx.guildId!;
    const kazagumo = ctx.client.kazagumo;
    const kPlayer = kazagumo.players.get(guildId);

    if (!kPlayer || !kPlayer.queue.current) {
      await ctx.write({ content: messages.error.nothingPlaying, flags: MessageFlags.Ephemeral });
      return;
    }

    const { from, to } = ctx.options;

    if (from > kPlayer.queue.size || to > kPlayer.queue.size) {
      await ctx.write({
        content: messages.error.moveIndexOutOfRange,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const [track] = kPlayer.queue.splice(from - 1, 1);

    if (!track) {
      await ctx.write({ content: messages.error.itemNotFound, flags: MessageFlags.Ephemeral });
      return;
    }

    kPlayer.queue.splice(to - 1, 0, track);
    await ctx.write({
      content: messages.queue.moved(track.title, to),
      flags: MessageFlags.Ephemeral,
    });
  }
}
