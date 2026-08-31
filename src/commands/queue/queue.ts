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
import { getGuildSettings } from '#parlante/utils/config/get-guild-settings';
import {
  escapeDiscordMarkdown,
  getDiscordUserMention,
  getTrackTitle,
  truncate,
} from '#parlante/utils/general/string';

const queueOptions = {
  page: createIntegerOption({
    description: messages.commands.queue.page,
  }),
  'page-size': createIntegerOption({
    description: messages.commands.queue.pageSize,
    min_value: 1,
    max_value: 30,
  }),
};

@Declare({
  name: 'queue',
  description: messages.commands.queue.description,
})
@Options(queueOptions)
@Middlewares(['voiceGuard', 'commandQueue'])
export default class QueueCommand extends Command {
  async run(ctx: CommandContext<typeof queueOptions>) {
    const guildId = ctx.guildId!;
    const kazagumo = ctx.client.kazagumo;
    const kPlayer = kazagumo.players.get(guildId);

    if (!kPlayer || !kPlayer.queue.current) {
      await ctx.write({ content: messages.error.nothingPlaying, flags: MessageFlags.Ephemeral });
      return;
    }

    const settings = await getGuildSettings(guildId);
    const pageSize = ctx.options['page-size'] ?? settings.defaultQueuePageSize ?? 10;
    const page = ctx.options.page ?? 1;

    const totalTracks = kPlayer.queue.size;
    const maxPages = Math.max(1, Math.ceil(totalTracks / pageSize));

    if (page < 1 || page > maxPages) {
      await ctx.write({ content: messages.error.itemNotFound, flags: MessageFlags.Ephemeral });
      return;
    }

    const startIndex = (page - 1) * pageSize;
    const upcomingTracks = [...kPlayer.queue].slice(startIndex, startIndex + pageSize);

    const embed = {
      color: kPlayer.paused ? 0xff9500 : 0x1db954,
      title: kPlayer.paused ? messages.embeds.queue.paused : messages.embeds.queue.nowPlaying,
      description: kPlayer.queue.current
        ? `**${escapeDiscordMarkdown(kPlayer.queue.current.author ?? '')} - ${escapeDiscordMarkdown(getTrackTitle(kPlayer.queue.current))}**`
        : messages.error.nothingPlaying,
      fields: upcomingTracks.map((track, i) => {
        const requester = getDiscordUserMention(track.requester);
        const artist = truncate(
          escapeDiscordMarkdown(track.author ?? messages.player.unknownArtist),
          900,
        );
        return {
          name: truncate(
            `${startIndex + i + 1}. ${escapeDiscordMarkdown(getTrackTitle(track))}`,
            256,
          ),
          value: `${artist}${requester ? `\n${messages.embeds.requestedBy}: ${requester}` : ''}`,
          inline: false,
        };
      }),
      footer: {
        text: `${messages.embeds.queue.page(page, maxPages)} • ${messages.embeds.queueInfo(totalTracks)}`,
      },
    };

    await ctx.write({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}
