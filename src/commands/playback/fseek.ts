import {
  Declare,
  Command,
  type CommandContext,
  Options,
  createStringOption,
  Middlewares,
} from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types';
import messages from '#parlante/utils/constants/messages';

function parseTimeToMs(input: string): number | null {
  const plain = parseFloat(input);
  if (!isNaN(plain) && input.match(/^\d+(\.\d+)?$/)) {
    return Math.floor(plain * 1000);
  }

  const match = input.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s?)?$/i);
  if (!match || !match[0]) return null;

  const h = parseInt(match[1] ?? '0');
  const m = parseInt(match[2] ?? '0');
  const s = parseFloat(match[3] ?? '0');

  if (isNaN(h) && isNaN(m) && isNaN(s)) return null;

  return ((h || 0) * 3600 + (m || 0) * 60 + (s || 0)) * 1000;
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

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

    const forwardMs = parseTimeToMs(time);
    if (forwardMs === null) {
      await ctx.write({
        content: messages.error.invalidSeekPosition,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const currentPosition = kPlayer.position ?? 0;
    const newPosition = currentPosition + forwardMs;
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
