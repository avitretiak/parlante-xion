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

const skipOptions = {
  number: createIntegerOption({
    description: messages.commands.skip.number,
    min_value: 1,
  }),
};

@Declare({
  name: 'skip',
  description: messages.commands.skip.description,
})
@Options(skipOptions)
@Middlewares(['voiceGuard', 'commandQueue'])
export default class SkipCommand extends Command {
  async run(ctx: CommandContext<typeof skipOptions>) {
    const guildId = ctx.guildId!;
    const kazagumo = ctx.client.kazagumo;
    const kPlayer = kazagumo.players.get(guildId);

    if (!kPlayer || !kPlayer.queue.current) {
      await ctx.write({ content: messages.error.nothingPlaying, flags: MessageFlags.Ephemeral });
      return;
    }

    const n = ctx.options.number ?? 1;

    if (n > kPlayer.queue.size + 1) {
      kPlayer.queue.clear();
      kPlayer.skip();
      await ctx.write({ content: messages.error.noSongToSkip, flags: MessageFlags.Ephemeral });
      return;
    }

    const currentTitle = kPlayer.queue.current?.title;

    if (n > 1) {
      kPlayer.queue.splice(0, n - 1);
    }
    kPlayer.skip();

    if (n === 1 && currentTitle) {
      await ctx.write({
        content: messages.queue.skippedTrack(currentTitle),
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await ctx.write({ content: messages.queue.skipped, flags: MessageFlags.Ephemeral });
    }
  }
}
