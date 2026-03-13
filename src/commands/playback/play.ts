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

// Cache autocomplete results to avoid hammering NodeLink on every keystroke
const autocompleteCache = new Map<
  string,
  { results: Array<{ name: string; value: string }>; expiresAt: number }
>();
const AUTOCOMPLETE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
          return { name: name.slice(0, 100), value: t.uri ?? t.title };
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
    if (!result.tracks || result.tracks.length === 0) {
      await ctx.editOrReply({
        content: messages.error.noSongsFound,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const settings = await getGuildSettings(guildId);

    let tracks = result.tracks;
    if (result.type === 'SEARCH' || result.type === 'TRACK') {
      tracks = tracks.slice(0, 1);
    } else if (
      result.type === 'PLAYLIST' &&
      settings.playlistLimit &&
      tracks.length > settings.playlistLimit
    ) {
      tracks = tracks.slice(0, settings.playlistLimit);
    }

    let kPlayer = kazagumo.players.get(guildId);
    if (!kPlayer) {
      kPlayer = await kazagumo.createPlayer({
        guildId,
        voiceId,
        textId: ctx.channelId!,
        deaf: true,
        shardId: 0,
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

    const skipCurrentTrack = skip ?? false;
    if (skipCurrentTrack && kPlayer.queue.current) {
      kPlayer.skip();
    }

    if (!kPlayer.playing && !kPlayer.paused) {
      await kPlayer.play();
    }

    const track = result.tracks[0]!;

    if (result.tracks.length === 1 || result.type === 'TRACK' || result.type === 'SEARCH') {
      await ctx.editOrReply({
        content: messages.queue.addSuccess(track.title, immediate ?? false, skipCurrentTrack, ''),
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await ctx.editOrReply({
        content: messages.queue.addMultipleSuccess(
          result.playlistName ?? track.title,
          result.tracks.length - 1,
          skipCurrentTrack,
          '',
        ),
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
