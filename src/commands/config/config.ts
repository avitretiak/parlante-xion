import {
  Declare,
  Command,
  SubCommand,
  type CommandContext,
  Options,
  createIntegerOption,
  createBooleanOption,
} from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types';
import { eq } from 'drizzle-orm';
import { db } from '#parlante/db';
import { setting } from '#parlante/db/schema';
import {
  getGuildSettings,
  invalidateGuildSettingsCache,
} from '#parlante/utils/config/get-guild-settings';
import messages from '#parlante/utils/constants/messages';

const playlistLimitOptions = {
  limit: createIntegerOption({
    description: messages.commands.config.setPlaylistLimit.limit,
    required: true as const,
    min_value: 1,
  }),
};

const waitDelayOptions = {
  delay: createIntegerOption({
    description: messages.commands.config.setWaitAfterQueueEmpties.delay,
    required: true as const,
    min_value: 0,
  }),
};

const leaveIfNoListenersOptions = {
  value: createBooleanOption({
    description: messages.commands.config.setLeaveIfNoListeners.value,
    required: true as const,
  }),
};

const queueAddResponseHiddenOptions = {
  value: createBooleanOption({
    description: messages.commands.config.setQueueAddResponseHidden.value,
    required: true as const,
  }),
};

const autoAnnounceOptions = {
  value: createBooleanOption({
    description: messages.commands.config.setAutoAnnounceNextSong.value,
    required: true as const,
  }),
};

const defaultVolumeOptions = {
  level: createIntegerOption({
    description: messages.commands.config.setDefaultVolume.level,
    required: true as const,
    min_value: 0,
    max_value: 100,
  }),
};

const defaultQueuePageSizeOptions = {
  'page-size': createIntegerOption({
    description: messages.commands.config.setDefaultQueuePageSize.pageSize,
    required: true as const,
    min_value: 1,
    max_value: 30,
  }),
};

@Declare({
  name: 'set-playlist-limit',
  description: messages.commands.config.setPlaylistLimit.description,
})
@Options(playlistLimitOptions)
class SetPlaylistLimitCommand extends SubCommand {
  async run(ctx: CommandContext<typeof playlistLimitOptions>) {
    const { limit } = ctx.options;
    const guildId = ctx.guildId!;

    if (limit < 1) {
      await ctx.write({ content: messages.error.invalidLimit, flags: MessageFlags.Ephemeral });
      return;
    }

    await getGuildSettings(guildId);
    await db.update(setting).set({ playlistLimit: limit }).where(eq(setting.guildId, guildId));
    invalidateGuildSettingsCache(guildId);

    await ctx.write({
      content: messages.config.updated.playlistLimit,
      flags: MessageFlags.Ephemeral,
    });
  }
}

@Declare({
  name: 'set-wait-after-queue-empties',
  description: messages.commands.config.setWaitAfterQueueEmpties.description,
})
@Options(waitDelayOptions)
class SetWaitAfterQueueEmptiesCommand extends SubCommand {
  async run(ctx: CommandContext<typeof waitDelayOptions>) {
    const { delay } = ctx.options;
    const guildId = ctx.guildId!;

    await getGuildSettings(guildId);
    await db
      .update(setting)
      .set({ secondsToWaitAfterQueueEmpties: delay })
      .where(eq(setting.guildId, guildId));
    invalidateGuildSettingsCache(guildId);

    await ctx.write({ content: messages.config.updated.waitDelay, flags: MessageFlags.Ephemeral });
  }
}

@Declare({
  name: 'set-leave-if-no-listeners',
  description: messages.commands.config.setLeaveIfNoListeners.description,
})
@Options(leaveIfNoListenersOptions)
class SetLeaveIfNoListenersCommand extends SubCommand {
  async run(ctx: CommandContext<typeof leaveIfNoListenersOptions>) {
    const { value } = ctx.options;
    const guildId = ctx.guildId!;

    await getGuildSettings(guildId);
    await db.update(setting).set({ leaveIfNoListeners: value }).where(eq(setting.guildId, guildId));
    invalidateGuildSettingsCache(guildId);

    await ctx.write({
      content: messages.config.updated.leaveSetting,
      flags: MessageFlags.Ephemeral,
    });
  }
}

@Declare({
  name: 'set-queue-add-response-hidden',
  description: messages.commands.config.setQueueAddResponseHidden.description,
})
@Options(queueAddResponseHiddenOptions)
class SetQueueAddResponseHiddenCommand extends SubCommand {
  async run(ctx: CommandContext<typeof queueAddResponseHiddenOptions>) {
    const { value } = ctx.options;
    const guildId = ctx.guildId!;

    await getGuildSettings(guildId);
    await db
      .update(setting)
      .set({ queueAddResponseEphemeral: value })
      .where(eq(setting.guildId, guildId));
    invalidateGuildSettingsCache(guildId);

    await ctx.write({
      content: messages.config.updated.queueAddNotification,
      flags: MessageFlags.Ephemeral,
    });
  }
}

@Declare({
  name: 'set-auto-announce-next-song',
  description: messages.commands.config.setAutoAnnounceNextSong.description,
})
@Options(autoAnnounceOptions)
class SetAutoAnnounceNextSongCommand extends SubCommand {
  async run(ctx: CommandContext<typeof autoAnnounceOptions>) {
    const { value } = ctx.options;
    const guildId = ctx.guildId!;

    await getGuildSettings(guildId);
    await db
      .update(setting)
      .set({ autoAnnounceNextSong: value })
      .where(eq(setting.guildId, guildId));
    invalidateGuildSettingsCache(guildId);

    await ctx.write({
      content: messages.config.updated.autoAnnounce,
      flags: MessageFlags.Ephemeral,
    });
  }
}

@Declare({
  name: 'set-default-volume',
  description: messages.commands.config.setDefaultVolume.description,
})
@Options(defaultVolumeOptions)
class SetDefaultVolumeCommand extends SubCommand {
  async run(ctx: CommandContext<typeof defaultVolumeOptions>) {
    const { level } = ctx.options;
    const guildId = ctx.guildId!;

    await getGuildSettings(guildId);
    await db.update(setting).set({ defaultVolume: level }).where(eq(setting.guildId, guildId));
    invalidateGuildSettingsCache(guildId);

    await ctx.write({
      content: messages.config.updated.defaultVolume,
      flags: MessageFlags.Ephemeral,
    });
  }
}

@Declare({
  name: 'set-default-queue-page-size',
  description: messages.commands.config.setDefaultQueuePageSize.description,
})
@Options(defaultQueuePageSizeOptions)
class SetDefaultQueuePageSizeCommand extends SubCommand {
  async run(ctx: CommandContext<typeof defaultQueuePageSizeOptions>) {
    const pageSize = ctx.options['page-size'];
    const guildId = ctx.guildId!;

    await getGuildSettings(guildId);
    await db
      .update(setting)
      .set({ defaultQueuePageSize: pageSize })
      .where(eq(setting.guildId, guildId));
    invalidateGuildSettingsCache(guildId);

    await ctx.write({
      content: messages.config.updated.defaultQueuePageSize,
      flags: MessageFlags.Ephemeral,
    });
  }
}

@Declare({
  name: 'get',
  description: messages.commands.config.get,
})
class GetConfigCommand extends SubCommand {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId!;
    const config = await getGuildSettings(guildId);

    const settingsToShow = {
      [messages.config.labels.playlistLimit]: config.playlistLimit,
      [messages.config.labels.waitBeforeLeaving]:
        config.secondsToWaitAfterQueueEmpties === 0
          ? messages.config.labels.neverLeave
          : `${config.secondsToWaitAfterQueueEmpties}s`,
      [messages.config.labels.leaveIfNoListeners]: config.leaveIfNoListeners
        ? messages.config.labels.yes
        : messages.config.labels.no,
      [messages.config.labels.autoAnnounceNextSong]: config.autoAnnounceNextSong
        ? messages.config.labels.yes
        : messages.config.labels.no,
      [messages.config.labels.addToQueueResponses]: config.queueAddResponseEphemeral
        ? messages.config.labels.yes
        : messages.config.labels.no,
      [messages.config.labels.defaultVolume]: config.defaultVolume,
      [messages.config.labels.defaultQueuePageSize]: config.defaultQueuePageSize,
    };

    const embed = {
      color: 0x5865f2,
      title: messages.config.labels.title,
      description: Object.entries(settingsToShow)
        .map(([k, v]) => `**${k}**: ${v}`)
        .join('\n'),
    };

    await ctx.write({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

@Declare({
  name: 'config',
  description: messages.commands.config.description,
  defaultMemberPermissions: ['ManageGuild'],
})
@Options([
  SetPlaylistLimitCommand,
  SetWaitAfterQueueEmptiesCommand,
  SetLeaveIfNoListenersCommand,
  SetQueueAddResponseHiddenCommand,
  SetAutoAnnounceNextSongCommand,
  SetDefaultVolumeCommand,
  SetDefaultQueuePageSizeCommand,
  GetConfigCommand,
])
export default class ConfigCommand extends Command {}
