import { createEvent } from 'seyfert';
import { buildNodeConfig } from '#parlante/config';
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

    // Register commands globally once (no per-guild guildId mutation): the
    // interaction gateway resolves global commands in every guild, so new
    // guilds need no per-guild upload and stale guildId arrays stay absent.
    info(messages.debug.registeringCommands);
    await client.uploadCommands();
    info(messages.debug.commandsRegistered);
  },
});
