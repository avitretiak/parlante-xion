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

@Declare({ name: 'fseek', description: messages.commands.fseek.description })
@Options({
  time: createStringOption({ description: messages.commands.fseek.time, required: true }),
})
@Middlewares(['voiceGuard', 'commandQueue'])
export default class FSeekCommand extends Command {
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

    const offsetMs = parseTimeToMs(time);
    if (offsetMs === null) {
      await ctx.write({
        content: messages.error.invalidSeekPosition,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const currentPosition = kPlayer.position ?? 0;
    // A relative offset may point before the start of the track; clamp to 0.
    const newPosition = Math.max(0, currentPosition + offsetMs);
    const trackLengthMs = kPlayer.queue.current.length ?? 0;

    if (newPosition > trackLengthMs) {
      await ctx.write({ content: messages.error.seekOutOfRange, flags: MessageFlags.Ephemeral });
      return;
    }

    await kPlayer.seek(newPosition);
    const formattedTime = formatMs(newPosition);
    await ctx.write({
      content: messages.player.seeked(formattedTime),
      flags: MessageFlags.Ephemeral,
    });
  }
}
