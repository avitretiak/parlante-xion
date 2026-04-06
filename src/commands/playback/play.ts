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
import { searchTracks } from '#parlante/services/search';
import { addToQueue } from '#parlante/services/queue-service';
import { playersManager } from '#parlante/managers/players';
import { getGuildSettings } from '#parlante/utils/config/get-guild-settings';
import { truncate } from '#parlante/utils/general/string';
import { prettyTime } from '#parlante/utils/general/time';
import { isExplicitPlaylistUrl } from '#parlante/utils/general/url';
import { debug } from '#parlante/utils/system/logger';

// Cache autocomplete results to avoid hammering NodeLink on every keystroke
const autocompleteCache = new Map<
  string,
  { results: Array<{ name: string; value: string }>; expiresAt: number }
>();
const AUTOCOMPLETE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

      // Check in-memory cache
      const cached = autocompleteCache.get(query);
      if (cached) {
        if (Date.now() < cached.expiresAt) {
          await interaction.respond(cached.results);
          return;
        }
        autocompleteCache.delete(query);
      }

      try {
        const kazagumo = interaction.client.kazagumo;
        const guildId = interaction.guildId;
        const result = await searchTracks(kazagumo, query, guildId);

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

        autocompleteCache.set(query, {
          results: suggestions,
          expiresAt: Date.now() + AUTOCOMPLETE_CACHE_TTL_MS,
        });
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
  async onAutocomplete(interaction: AutocompleteInteraction) {
    await playOptions.query.autocomplete!(interaction);
  }

  async run(ctx: CommandContext<typeof playOptions>) {
    await ctx.deferReply(true);

    const { query, immediate, shuffle, skip } = ctx.options;
    const guildId = ctx.guildId!;
    const kazagumo = ctx.client.kazagumo;

    const member = ctx.member!;
    const voiceState = await member.voice('flow');
    const voiceId = voiceState!.channelId!;

    const result = await searchTracks(kazagumo, query.trim(), guildId);
    debug(`[${guildId}] /play search diagnostics`, {
      query: query.trim(),
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

    let tracks = result.tracks;
    const allowPlaylistExpansion = isExplicitPlaylistUrl(query.trim());
    if (result.type === 'SEARCH' || result.type === 'TRACK') {
      tracks = tracks.slice(0, 1);
    } else if (result.type === 'PLAYLIST' && !allowPlaylistExpansion) {
      tracks = tracks.slice(0, 1);
    } else if (
      result.type === 'PLAYLIST' &&
      settings.playlistLimit &&
      tracks.length > settings.playlistLimit
    ) {
      tracks = tracks.slice(0, settings.playlistLimit);
    }

    debug(`[${guildId}] /play playlist expansion diagnostics`, {
      query: query.trim(),
      resultType: result.type,
      allowPlaylistExpansion,
      originalTracks: result.tracks.length,
      queuedTracks: tracks.length,
    });

    if (tracks.length === 0) {
      debug(`[${guildId}] /play aborted after expansion diagnostics`, {
        query: query.trim(),
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
    const firstTrackTitle =
      firstTrack?.title ??
      (firstTrack as { info?: { title?: string } } | undefined)?.info?.title ??
      'Unknown Track';

    let kPlayer = kazagumo.players.get(guildId);
    if (!kPlayer) {
      const shardId = ctx.client.gateway.calculateShardId(guildId);
      kPlayer = await kazagumo.createPlayer({
        guildId,
        voiceId,
        textId: ctx.channelId!,
        deaf: true,
        shardId,
      });

      debug(`[${guildId}] /play createPlayer diagnostics`, {
        voiceId,
        textId: ctx.channelId,
        shardId,
      });

      playersManager.create(guildId, kPlayer, ctx.channelId!);

      if (settings.defaultVolume !== undefined && settings.defaultVolume !== null) {
        kPlayer.setVolume(settings.defaultVolume);
      }
    } else {
      playersManager.create(guildId, kPlayer, ctx.channelId!);
    }

    addToQueue(kPlayer, tracks, {
      front: immediate ?? false,
      shuffle: shuffle ?? false,
    });

    debug(`[${guildId}] /play queue diagnostics`, {
      immediate: immediate ?? false,
      shuffle: shuffle ?? false,
      skip: skip ?? false,
      addedTracks: tracks.length,
      queueSize: kPlayer.queue.size,
      hasCurrentTrack: Boolean(kPlayer.queue.current),
      playerState: kPlayer.state,
      playing: kPlayer.playing,
      paused: kPlayer.paused,
    });

    const skipCurrentTrack = skip ?? false;
    if (skipCurrentTrack && kPlayer.queue.current) {
      kPlayer.skip();
    }

    if (!kPlayer.playing && !kPlayer.paused) {
      debug(`[${guildId}] /play play() trigger diagnostics`, {
        reason: 'player_not_playing_and_not_paused',
        queueSize: kPlayer.queue.size,
        hasCurrentTrack: Boolean(kPlayer.queue.current),
        playerState: kPlayer.state,
      });
      await kPlayer.play();
    } else {
      debug(`[${guildId}] /play play() skipped diagnostics`, {
        reason: 'already_playing_or_paused',
        queueSize: kPlayer.queue.size,
        hasCurrentTrack: Boolean(kPlayer.queue.current),
        playerState: kPlayer.state,
        playing: kPlayer.playing,
        paused: kPlayer.paused,
      });
    }

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
          result.playlistName ?? firstTrackTitle,
          tracks.length - 1,
          skipCurrentTrack,
          '',
        ),
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
