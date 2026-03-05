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
import { searchTracks } from '#parlante/services/search';
import { addToQueue } from '#parlante/services/queue-service';
import { playersManager } from '#parlante/managers/players';
import { getGuildSettings } from '#parlante/utils/config/get-guild-settings';
import messages from '#parlante/utils/constants/messages';

const useOptions = {
  name: createStringOption({
    description: messages.favorites.use.name,
    required: true as const,
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
@Middlewares(['commandQueue'])
class UseFavoriteCommand extends SubCommand {
  async onAutocomplete(interaction: AutocompleteInteraction) {
    await useOptions.name.autocomplete!(interaction);
  }

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
    const result = await searchTracks(kazagumo, favorite.query, guildId);

    if (!result.tracks || result.tracks.length === 0) {
      await ctx.editOrReply({
        content: messages.error.noSongsFound,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const settings = await getGuildSettings(guildId);

    let tracks = result.tracks;
    if (
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

    const immediate = ctx.options.immediate ?? false;
    const shuffle = ctx.options.shuffle ?? false;
    const skip = ctx.options.skip ?? false;

    addToQueue(kPlayer, tracks, { front: immediate, shuffle });

    if (skip && kPlayer.queue.current) {
      kPlayer.skip();
    }

    if (!kPlayer.playing && !kPlayer.paused) {
      await kPlayer.play();
    }

    const track = result.tracks[0]!;
    if (result.tracks.length === 1 || result.type === 'TRACK' || result.type === 'SEARCH') {
      await ctx.editOrReply({
        content: messages.queue.addSuccess(track.title, immediate, skip, ''),
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await ctx.editOrReply({
        content: messages.queue.addMultipleSuccess(
          result.playlistName ?? track.title,
          result.tracks.length - 1,
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
      name: f.name,
      value: `${f.query} (<@${f.authorId}>)`,
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
  }),
  query: createStringOption({
    description: messages.favorites.create.query,
    required: true as const,
  }),
};

@Declare({
  name: 'create',
  description: messages.favorites.create.description,
})
@Options(createOptions)
class CreateFavoriteCommand extends SubCommand {
  async run(ctx: CommandContext<typeof createOptions>) {
    const name = ctx.options.name.trim();
    const query = ctx.options.query.trim();
    const guildId = ctx.guildId!;

    const existingFavorite = await db
      .select()
      .from(favoriteQuery)
      .where(and(eq(favoriteQuery.guildId, guildId), eq(favoriteQuery.name, name)))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (existingFavorite) {
      await ctx.write({ content: messages.favorites.alreadyExists, flags: MessageFlags.Ephemeral });
      return;
    }

    await db.insert(favoriteQuery).values({
      authorId: ctx.author.id,
      guildId,
      name,
      query,
    });

    await ctx.write({ content: messages.favorites.created, flags: MessageFlags.Ephemeral });
  }
}

const removeOptions = {
  name: createStringOption({
    description: messages.favorites.remove.name,
    required: true as const,
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
  async onAutocomplete(interaction: AutocompleteInteraction) {
    await removeOptions.name.autocomplete!(interaction);
  }

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
