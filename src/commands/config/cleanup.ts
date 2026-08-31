import { Declare, Command, type CommandContext } from 'seyfert';
import { ChannelType, MessageFlags } from 'seyfert/lib/types';
import { snowflakeToTimestamp } from 'seyfert/lib/common';
import messages from '#parlante/utils/constants/messages';

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_MESSAGES_PER_CHANNEL = 1000;

async function purgeBotMessages(
  ctx: CommandContext,
  channelId: string,
  botId: string,
): Promise<number> {
  const botMessageIds: string[] = [];
  let lastMessageId: string | undefined;

  for (let batch = 0; batch < MAX_MESSAGES_PER_CHANNEL / 100; batch++) {
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

  if (botMessageIds.length === 0) return 0;

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
        await ctx.client.messages.purge(chunk, channelId);
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

  return deletedCount;
}

@Declare({
  name: 'cleanup',
  description: messages.commands.cleanup.description,
  defaultMemberPermissions: ['ManageMessages'],
})
export default class CleanupCommand extends Command {
  async run(ctx: CommandContext) {
    await ctx.deferReply(true);

    const botId = ctx.client.me.id;
    const guilds = ctx.client.cache.guilds?.values() ?? [];
    let totalDeleted = 0;

    for (const guild of guilds) {
      // The slash command's Manage Messages permission only gates the guild
      // it was invoked in — verify it per guild before purging anywhere else.
      let member;
      try {
        member = await guild.members.fetch(ctx.author.id, true);
      } catch {
        continue;
      }
      const permissions = await member.roles.permissions(true);
      if (!permissions.has('ManageMessages')) continue;

      let channels;
      try {
        channels = await guild.channels.list(true);
      } catch {
        continue;
      }

      for (const channel of channels) {
        if (channel.type !== ChannelType.GuildText) continue;
        totalDeleted += await purgeBotMessages(ctx, channel.id, botId);
      }
    }

    await ctx.editOrReply({
      content:
        totalDeleted > 0
          ? messages.commands.cleanup.success(totalDeleted)
          : messages.commands.cleanup.noMessages,
      flags: MessageFlags.Ephemeral,
    });
  }
}
