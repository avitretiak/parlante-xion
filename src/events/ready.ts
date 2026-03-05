import { createEvent } from 'seyfert';
import { buildNodeConfig } from '../structures/kazagumo';
import { info } from '#parlante/utils/system/logger';
import messages from '#parlante/utils/constants/messages';

const ACTIVITY_TYPE_MAP: Record<string, number> = {
  PLAYING: 0,
  STREAMING: 1,
  LISTENING: 2,
  WATCHING: 3,
};

export default createEvent({
  data: { name: 'botReady', once: true },
  async run(user, client) {
    const guilds = await client.guilds.list();
    info(messages.debug.botReadyAs(user.username, guilds.length));

    const status = process.env.BOT_STATUS ?? 'online';
    const activityTypeStr = process.env.BOT_ACTIVITY_TYPE ?? 'LISTENING';
    const activityName = process.env.BOT_ACTIVITY ?? '🎵 Pinchando unos temaikenes';
    const activityUrl = process.env.BOT_ACTIVITY_URL || undefined;
    const activityType = ACTIVITY_TYPE_MAP[activityTypeStr] ?? 2;

    client.gateway.setPresence({
      since: null,
      afk: false,
      status: status as 'online' | 'idle' | 'dnd' | 'invisible',
      activities: [
        {
          name: activityName,
          type: activityType,
          ...(activityUrl ? { url: activityUrl } : {}),
        },
      ],
    } as Parameters<typeof client.gateway.setPresence>[0]);

    await client.kazagumo.shoukaku.addNode(buildNodeConfig());

    // Register commands to all current guilds so getCommand() can find them
    const guildIds = guilds.map((g) => g.id);
    for (const command of client.commands.values) {
      command.guildId = guildIds;
    }
    info(messages.debug.registeringCommands);
    await client.uploadCommands();
    info(messages.debug.commandsRegistered);
  },
});
