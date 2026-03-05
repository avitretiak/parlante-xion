import { Declare, Command, type CommandContext } from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types';
import messages from '#parlante/utils/constants/messages';

const DISCORD_EPOCH = 1_420_070_400_000n;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

function snowflakeToTimestamp(id: string): number {
  return Number((BigInt(id) >> 22n) + DISCORD_EPOCH);
}

@Declare({
  name: 'cleanup',
  description: messages.commands.cleanup.description,
  defaultMemberPermissions: ['ManageMessages'],
})
export default class CleanupCommand extends Command {
  async run(ctx: CommandContext) {
    await ctx.deferReply(true);

    const channelId = ctx.channelId!;
    const botId = ctx.client.me.id;

    const botMessageIds: string[] = [];
    let lastMessageId: string | undefined;

    for (let batch = 0; batch < 10; batch++) {
      const fetchOptions: { limit: number; before?: string } = { limit: 100 };
      if (lastMessageId) fetchOptions.before = lastMessageId;

      const batch_msgs = await ctx.client.messages.list(channelId, fetchOptions);
      if (batch_msgs.length === 0) break;

      for (const msg of batch_msgs) {
        if (msg.author.id === botId) {
          botMessageIds.push(msg.id);
        }
        lastMessageId = msg.id;
      }

      if (batch_msgs.length < 100) break;
    }

    if (botMessageIds.length === 0) {
      await ctx.editOrReply({
        content: messages.commands.cleanup.noMessages,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    let deletedCount = 0;
    const now = Date.now();

    const recentIds: string[] = [];
    const oldIds: string[] = [];

    for (const id of botMessageIds) {
      const age = now - snowflakeToTimestamp(id);
      if (age < FOURTEEN_DAYS_MS) {
        recentIds.push(id);
      } else {
        oldIds.push(id);
      }
    }

    for (let i = 0; i < recentIds.length; i += 100) {
      const chunk = recentIds.slice(i, i + 100);
      if (chunk.length >= 2) {
        try {
          await ctx.client.proxy.channels(channelId).messages['bulk-delete'].post({
            body: { messages: chunk },
          });
          deletedCount += chunk.length;
        } catch {
          for (const id of chunk) {
            try {
              await ctx.client.messages.delete(id, channelId);
              deletedCount++;
            } catch {}
          }
        }
      } else if (chunk.length === 1) {
        try {
          await ctx.client.messages.delete(chunk[0]!, channelId);
          deletedCount++;
        } catch {}
      }
    }

    for (const id of oldIds) {
      try {
        await ctx.client.messages.delete(id, channelId);
        deletedCount++;
      } catch {}
    }

    await ctx.editOrReply({
      content: messages.commands.cleanup.success(deletedCount),
      flags: MessageFlags.Ephemeral,
    });
  }
}
