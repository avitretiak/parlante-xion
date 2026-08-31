import {
  Declare,
  Command,
  type CommandContext,
  Options,
  createStringOption,
  createBooleanOption,
  Middlewares,
  type AutocompleteInteraction,
} from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types/payloads/channel';
import messages from '#parlante/utils/constants/messages';
import { enqueueTracks, resolveQueueTracks } from '#parlante/services/queue-service';
import { describeQueryForLogs, searchTracks } from '#parlante/services/search';
import { getGuildSettings } from '#parlante/utils/config/get-guild-settings';
import { BoundedTtlCache } from '#parlante/utils/general/cache';
import { escapeDiscordMarkdown, getTrackTitle, truncate } from '#parlante/utils/general/string';
import { prettyTime } from '#parlante/utils/general/time';
import { isExplicitPlaylistUrl } from '#parlante/utils/general/url';
import { debug } from '#parlante/utils/system/logger';

// Cache autocomplete results to avoid hammering NodeLink on every keystroke
const AUTOCOMPLETE_CACHE_MAX_ENTRIES = 200;
const AUTOCOMPLETE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const autocompleteCache = new BoundedTtlCache<string, Array<{ name: string; value: string }>>(
  AUTOCOMPLETE_CACHE_MAX_ENTRIES,
  AUTOCOMPLETE_CACHE_TTL_MS,
);

const formatTrackAutocompleteValue = (track: {
  uri?: string;
  identifier?: string;
  title?: string;
  author?: string;
  sourceName?: string;
}) => {
  if (track.uri) return track.uri;
  if (track.identifier && track.sourceName === 'youtube') {
    return `https://www.youtube.com/watch?v=${track.identifier}`;
  }
  return `${track.title ?? ''} ${track.author ?? ''}`.trim();
};

const playOptions = {
  query: createStringOption({
    description: messages.commands.play.query,
    required: true as const,
    autocomplete: async (interaction: AutocompleteInteraction) => {
      const query = interaction.getInput()?.trim() ?? '';

      if (query.length < 2) {
        await interaction.respond([]);
        return;
      }

      try {
        new URL(query);
        await interaction.respond([]);
        return;
      } catch {}

      // Check in-memory cache (expired entries are dropped on read)
      const cached = autocompleteCache.get(query);
      if (cached) {
        await interaction.respond(cached);
        return;
      }

      try {
        const kazagumo = interaction.client.kazagumo;
        const result = await searchTracks(kazagumo, query, interaction.user.id);

        if (!result.tracks.length) {
          await interaction.respond([
            { name: messages.events.autocomplete.noTracks, value: 'noTracks' },
          ]);
          return;
        }

        const suggestions = result.tracks.slice(0, 25).map((t) => {
          const dur = t.isStream
            ? messages.player.live
            : prettyTime(Math.floor((t.length ?? 0) / 1000));
          const name = `${truncate(t.title, 45)} (${dur}) - ${truncate(t.author ?? '', 30)}`;
          return { name: name.slice(0, 100), value: formatTrackAutocompleteValue(t).slice(0, 100) };
        });

        autocompleteCache.set(query, suggestions);
        await interaction.respond(suggestions);
      } catch {
        await interaction.respond([]);
      }
    },
  }),
  immediate: createBooleanOption({
    description: messages.commands.play.addToFront,
  }),
  shuffle: createBooleanOption({
    description: messages.commands.play.shuffle,
  }),
  skip: createBooleanOption({
    description: messages.commands.play.skip,
  }),
};

@Declare({
  name: 'play',
  description: messages.commands.play.description,
})
@Options(playOptions)
@Middlewares(['voiceGuard', 'commandQueue'])
export default class PlayCommand extends Command {
  async run(ctx: CommandContext<typeof playOptions>) {
    await ctx.deferReply(true);

    const { query, immediate, shuffle, skip } = ctx.options;
    const guildId = ctx.guildId!;
    const kazagumo = ctx.client.kazagumo;

    const member = ctx.member!;
    const voiceState = await member.voice('flow');
    const voiceId = voiceState!.channelId!;

    const result = await searchTracks(kazagumo, query.trim(), ctx.author.id);
    debug(`[${guildId}] /play search diagnostics`, {
      ...describeQueryForLogs(query.trim()),
      resultType: result.type,
      tracksFound: result.tracks?.length ?? 0,
      playlistName: result.playlistName,
    });
    if (!result.tracks || result.tracks.length === 0) {
      await ctx.editOrReply({
        content: messages.error.noSongsFound,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const settings = await getGuildSettings(guildId);

    const tracks = resolveQueueTracks(result, query.trim(), settings.playlistLimit);
    const allowPlaylistExpansion = isExplicitPlaylistUrl(query.trim());

    debug(`[${guildId}] /play playlist expansion diagnostics`, {
      ...describeQueryForLogs(query.trim()),
      resultType: result.type,
      allowPlaylistExpansion,
      originalTracks: result.tracks.length,
      queuedTracks: tracks.length,
    });

    if (tracks.length === 0) {
      debug(`[${guildId}] /play aborted after expansion diagnostics`, {
        ...describeQueryForLogs(query.trim()),
        resultType: result.type,
        playlistLimit: settings.playlistLimit,
        originalTracks: result.tracks.length,
      });
      await ctx.editOrReply({
        content: messages.error.noSongsFound,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const firstTrack = tracks[0];
    const firstTrackTitle = escapeDiscordMarkdown(getTrackTitle(firstTrack));

    const skipCurrentTrack = skip ?? false;
    const kPlayer = await enqueueTracks(kazagumo, {
      guildId,
      voiceId,
      textChannelId: settings.reportChannelId ?? ctx.channelId!,
      shardId: ctx.client.gateway.calculateShardId(guildId),
      tracks,
      defaultVolume: settings.defaultVolume,
      front: immediate ?? false,
      shuffle: shuffle ?? false,
      skip: skipCurrentTrack,
    });

    debug(`[${guildId}] /play queue diagnostics`, {
      immediate: immediate ?? false,
      shuffle: shuffle ?? false,
      skip: skipCurrentTrack,
      addedTracks: tracks.length,
      queueSize: kPlayer.queue.size,
      hasCurrentTrack: Boolean(kPlayer.queue.current),
      playerState: kPlayer.state,
      playing: kPlayer.playing,
      paused: kPlayer.paused,
    });

    if (tracks.length === 1 || result.type === 'TRACK' || result.type === 'SEARCH') {
      await ctx.editOrReply({
        content: messages.queue.addSuccess(
          firstTrackTitle,
          immediate ?? false,
          skipCurrentTrack,
          '',
        ),
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await ctx.editOrReply({
        content: messages.queue.addMultipleSuccess(
          result.playlistName ? escapeDiscordMarkdown(result.playlistName) : firstTrackTitle,
          tracks.length - 1,
          skipCurrentTrack,
          '',
        ),
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
