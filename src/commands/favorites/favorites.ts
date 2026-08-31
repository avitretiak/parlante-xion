import {
  Declare,
  Command,
  SubCommand,
  type CommandContext,
  type AutocompleteInteraction,
  Options,
  createStringOption,
  createBooleanOption,
  Middlewares,
} from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types/payloads/channel';
import { and, eq } from 'drizzle-orm';
import { db } from '#parlante/db';
import { favoriteQuery } from '#parlante/db/schema';
import { enqueueTracks, resolveQueueTracks } from '#parlante/services/queue-service';
import {
  createFavorite,
  favoriteListValue,
  FAVORITE_MAX_LENGTH,
  FAVORITE_QUERY_MAX_LENGTH,
  normalizeFavoriteName,
  normalizeFavoriteQuery,
} from '#parlante/services/favorites-service';
import { describeQueryForLogs, searchTracks } from '#parlante/services/search';
import { getGuildSettings } from '#parlante/utils/config/get-guild-settings';
import { isExplicitPlaylistUrl } from '#parlante/utils/general/url';
import { escapeDiscordMarkdown, getTrackTitle } from '#parlante/utils/general/string';
import { debug } from '#parlante/utils/system/logger';
import messages from '#parlante/utils/constants/messages';

const useOptions = {
  name: createStringOption({
    description: messages.favorites.use.name,
    required: true as const,
    max_length: FAVORITE_MAX_LENGTH,
    autocomplete: async (interaction: AutocompleteInteraction) => {
      const focused = interaction.getInput()?.trim() ?? '';
      const guildId = interaction.guildId!;

      const favorites = await db
        .select()
        .from(favoriteQuery)
        .where(eq(favoriteQuery.guildId, guildId));

      const filtered =
        focused === ''
          ? favorites
          : favorites.filter((f) => f.name.toLowerCase().startsWith(focused.toLowerCase()));

      const results = filtered.slice(0, 25).map((f) => ({
        name: f.name.slice(0, 100),
        value: f.name.slice(0, 100),
      }));

      await interaction.respond(results);
    },
  }),
  immediate: createBooleanOption({
    description: messages.commands.favorites.immediate,
  }),
  shuffle: createBooleanOption({
    description: messages.commands.favorites.shuffle,
  }),
  skip: createBooleanOption({
    description: messages.commands.favorites.skip,
  }),
};

@Declare({
  name: 'use',
  description: messages.favorites.use.description,
})
@Options(useOptions)
@Middlewares(['voiceGuard', 'commandQueue'])
class UseFavoriteCommand extends SubCommand {
  async run(ctx: CommandContext<typeof useOptions>) {
    const name = ctx.options.name.trim();
    const guildId = ctx.guildId!;

    await ctx.deferReply(true);

    const favorite = await db
      .select()
      .from(favoriteQuery)
      .where(and(eq(favoriteQuery.name, name), eq(favoriteQuery.guildId, guildId)))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (!favorite) {
      await ctx.editOrReply({
        content: messages.favorites.notFound,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const member = ctx.member;
    if (!member) {
      await ctx.editOrReply({
        content: messages.error.notInVoiceChannel,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const voiceState = await member.voice('flow');
    const voiceId = voiceState?.channelId;
    if (!voiceId) {
      await ctx.editOrReply({
        content: messages.error.notInVoiceChannel,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const kazagumo = ctx.client.kazagumo;
    const result = await searchTracks(kazagumo, favorite.query, ctx.author.id);

    if (!result.tracks || result.tracks.length === 0) {
      await ctx.editOrReply({
        content: messages.error.noSongsFound,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const settings = await getGuildSettings(guildId);

    const tracks = resolveQueueTracks(result, favorite.query, settings.playlistLimit);
    const allowPlaylistExpansion = isExplicitPlaylistUrl(favorite.query);

    debug(`[${guildId}] /favorites use playlist expansion diagnostics`, {
      favoriteName: favorite.name,
      ...describeQueryForLogs(favorite.query),
      resultType: result.type,
      allowPlaylistExpansion,
      originalTracks: result.tracks.length,
      queuedTracks: tracks.length,
    });

    const immediate = ctx.options.immediate ?? false;
    const shuffle = ctx.options.shuffle ?? false;
    const skip = ctx.options.skip ?? false;
    await enqueueTracks(kazagumo, {
      guildId,
      voiceId,
      textChannelId: settings.reportChannelId ?? ctx.channelId!,
      shardId: ctx.client.gateway.calculateShardId(guildId),
      tracks,
      defaultVolume: settings.defaultVolume,
      front: immediate,
      shuffle,
      skip,
    });

    const track = tracks[0];
    const trackTitle = escapeDiscordMarkdown(getTrackTitle(track));
    if (tracks.length === 1 || result.type === 'TRACK' || result.type === 'SEARCH') {
      await ctx.editOrReply({
        content: messages.queue.addSuccess(trackTitle, immediate, skip, ''),
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await ctx.editOrReply({
        content: messages.queue.addMultipleSuccess(
          result.playlistName ? escapeDiscordMarkdown(result.playlistName) : trackTitle,
          tracks.length - 1,
          skip,
          '',
        ),
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

@Declare({
  name: 'list',
  description: messages.favorites.list.description,
})
class ListFavoritesCommand extends SubCommand {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId!;

    const favorites = await db
      .select()
      .from(favoriteQuery)
      .where(eq(favoriteQuery.guildId, guildId));

    if (favorites.length === 0) {
      await ctx.write({ content: messages.favorites.none, flags: MessageFlags.Ephemeral });
      return;
    }

    const displayCount = Math.min(favorites.length, 25);
    const fields = favorites.slice(0, displayCount).map((f) => ({
      name: escapeDiscordMarkdown(f.name),
      value: favoriteListValue(f.query, f.authorId),
      inline: false,
    }));

    const footer =
      favorites.length > 25 ? { text: `...and ${favorites.length - 25} more` } : undefined;

    const embed = {
      title: messages.commands.favorites.description,
      fields,
      footer,
    };

    await ctx.write({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

const createOptions = {
  name: createStringOption({
    description: messages.favorites.create.name,
    required: true as const,
    max_length: FAVORITE_MAX_LENGTH,
  }),
  query: createStringOption({
    description: messages.favorites.create.query,
    required: true as const,
    max_length: FAVORITE_QUERY_MAX_LENGTH,
  }),
};

@Declare({
  name: 'create',
  description: messages.favorites.create.description,
})
@Options(createOptions)
class CreateFavoriteCommand extends SubCommand {
  async run(ctx: CommandContext<typeof createOptions>) {
    const name = normalizeFavoriteName(ctx.options.name);
    const query = normalizeFavoriteQuery(ctx.options.query);
    const guildId = ctx.guildId!;

    if (name === null) {
      await ctx.write({
        content: messages.favorites.create.invalidName,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (query === null) {
      await ctx.write({
        content: messages.favorites.create.invalidQuery,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Conflict-aware insert: a concurrent duplicate (or an existing row)
    // yields no row instead of a unique-constraint rejection.
    const created = await createFavorite({
      authorId: ctx.author.id,
      guildId,
      name,
      query,
    });

    if (created === null) {
      await ctx.write({
        content: messages.favorites.alreadyExists,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await ctx.write({ content: messages.favorites.created, flags: MessageFlags.Ephemeral });
  }
}

const removeOptions = {
  name: createStringOption({
    description: messages.favorites.remove.name,
    required: true as const,
    max_length: FAVORITE_MAX_LENGTH,
    autocomplete: async (interaction: AutocompleteInteraction) => {
      const focused = interaction.getInput()?.trim() ?? '';
      const guildId = interaction.guildId!;
      const userId = interaction.user.id;

      const favorites = await db
        .select()
        .from(favoriteQuery)
        .where(eq(favoriteQuery.guildId, guildId));

      const guild = await interaction.fetchGuild('flow');
      const isOwner = guild?.ownerId === userId;

      let filtered = isOwner ? favorites : favorites.filter((f) => f.authorId === userId);

      if (focused !== '') {
        filtered = filtered.filter((f) => f.name.toLowerCase().startsWith(focused.toLowerCase()));
      }

      const results = filtered.slice(0, 25).map((f) => ({
        name: f.name.slice(0, 100),
        value: f.name.slice(0, 100),
      }));

      await interaction.respond(results);
    },
  }),
};

@Declare({
  name: 'remove',
  description: messages.favorites.remove.description,
})
@Options(removeOptions)
class RemoveFavoriteCommand extends SubCommand {
  async run(ctx: CommandContext<typeof removeOptions>) {
    const name = ctx.options.name.trim();
    const guildId = ctx.guildId!;

    const favorite = await db
      .select()
      .from(favoriteQuery)
      .where(and(eq(favoriteQuery.name, name), eq(favoriteQuery.guildId, guildId)))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (!favorite) {
      await ctx.write({ content: messages.favorites.notFound, flags: MessageFlags.Ephemeral });
      return;
    }

    const guild = await ctx.guild('flow');
    const isOwner = guild?.ownerId === ctx.author.id;

    if (!isOwner && favorite.authorId !== ctx.author.id) {
      await ctx.write({ content: messages.favorites.onlyRemoveOwn, flags: MessageFlags.Ephemeral });
      return;
    }

    await db.delete(favoriteQuery).where(eq(favoriteQuery.id, favorite.id));

    await ctx.write({ content: messages.favorites.removed, flags: MessageFlags.Ephemeral });
  }
}

@Declare({
  name: 'favorites',
  description: messages.commands.favorites.description,
})
@Options([UseFavoriteCommand, ListFavoritesCommand, CreateFavoriteCommand, RemoveFavoriteCommand])
export default class FavoritesCommand extends Command {}
