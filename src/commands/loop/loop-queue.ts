import { Declare, Command, type CommandContext, Middlewares } from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types';
import messages from '#parlante/utils/constants/messages';

@Declare({
  name: 'loop-queue',
  description: messages.commands.loopQueue.description,
})
@Middlewares(['voiceGuard', 'commandQueue'])
export default class LoopQueueCommand extends Command {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId!;
    const kazagumo = ctx.client.kazagumo;
    const kPlayer = kazagumo.players.get(guildId);

    if (!kPlayer || !kPlayer.queue.current) {
      await ctx.write({ content: messages.error.nothingPlaying, flags: MessageFlags.Ephemeral });
      return;
    }

    if (kPlayer.loop === 'queue') {
      kPlayer.setLoop('none');
      await ctx.write({
        content: messages.queue.stoppedLoopingQueue,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      kPlayer.setLoop('queue');
      await ctx.write({ content: messages.queue.loopedQueue, flags: MessageFlags.Ephemeral });
    }
  }
}
