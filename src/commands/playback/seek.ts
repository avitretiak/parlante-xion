import {
  Declare,
  Command,
  type CommandContext,
  Options,
  createStringOption,
  Middlewares,
} from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types';
import { parseTimeToMs, formatMs } from '#parlante/utils/general/time';
import messages from '#parlante/utils/constants/messages';

@Declare({ name: 'seek', description: messages.commands.seek.description })
@Options({
  time: createStringOption({ description: messages.commands.seek.time, required: true }),
})
@Middlewares(['voiceGuard', 'commandQueue'])
export default class SeekCommand extends Command {
  async run(ctx: CommandContext) {
    const time = (ctx.options as Record<string, string | undefined>).time;
    if (!time) {
      await ctx.write({ content: messages.error.missingSeekValue, flags: MessageFlags.Ephemeral });
      return;
    }

    const guildId = ctx.guildId!;
    const kazagumo = ctx.client.kazagumo;
    const kPlayer = kazagumo.players.get(guildId);

    if (!kPlayer || !kPlayer.queue.current) {
      await ctx.write({ content: messages.error.nothingPlaying, flags: MessageFlags.Ephemeral });
      return;
    }

    if (kPlayer.queue.current.isStream) {
      await ctx.write({
        content: messages.error.cannotSeekLivestream,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const seekMs = parseTimeToMs(time);
    if (seekMs === null) {
      await ctx.write({
        content: messages.error.invalidSeekPosition,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (seekMs < 0) {
      await ctx.write({
        content: messages.error.negativeSeekPosition,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const trackLengthMs = kPlayer.queue.current.length ?? 0;
    if (seekMs > trackLengthMs) {
      await ctx.write({ content: messages.error.seekOutOfRange, flags: MessageFlags.Ephemeral });
      return;
    }

    await kPlayer.seek(seekMs);
    const formattedTime = formatMs(seekMs);
    await ctx.write({
      content: messages.player.seeked(formattedTime),
      flags: MessageFlags.Ephemeral,
    });
  }
}
