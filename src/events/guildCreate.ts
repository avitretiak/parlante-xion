import { createEvent } from 'seyfert';
import { eq } from 'drizzle-orm';
import { db } from '#parlante/db';
import { setting } from '#parlante/db/schema';
import { info } from '#parlante/utils/system/logger';
import messages from '#parlante/utils/constants/messages';

export default createEvent({
  data: { name: 'guildCreate' },
  async run(guild, client) {
    const existing = await db.select().from(setting).where(eq(setting.guildId, guild.id)).limit(1);

    if (existing.length === 0) {
      await db.insert(setting).values({ guildId: guild.id });
    }

    for (const command of client.commands.values) {
      if (!command.guildId) {
        command.guildId = [guild.id];
      } else if (!command.guildId.includes(guild.id)) {
        command.guildId = [...command.guildId, guild.id];
      }
    }
    await client.uploadCommands();

    info(messages.debug.guildJoined(guild.name, guild.id));
  },
});
