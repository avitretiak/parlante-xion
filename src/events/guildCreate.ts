import { createEvent } from 'seyfert';
import { info } from '#parlante/utils/system/logger';
import messages from '#parlante/utils/constants/messages';

export default createEvent({
  data: { name: 'guildCreate' },
  async run(guild) {
    // Settings are created lazily by getGuildSettings on first read; no
    // eager row is needed here.
    info(messages.debug.guildJoined(guild.name, guild.id));
  },
});
