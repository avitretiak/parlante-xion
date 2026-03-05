import { createEvent } from 'seyfert';
import { getGuildSettings } from '#parlante/utils/config/get-guild-settings';

export default createEvent({
  data: { name: 'voiceStateUpdate' },
  async run([newState, oldState], client) {
    const guildId = newState.guildId ?? oldState?.guildId;
    if (!guildId) return;

    const kPlayer = client.kazagumo.players.get(guildId);
    if (!kPlayer) return;

    const botChannelId = kPlayer.voiceId;
    if (!botChannelId) return;

    const settings = await getGuildSettings(guildId);
    if (!settings.leaveIfNoListeners) return;

    const voiceStates = await client.cache.voiceStates?.values(guildId);
    if (!voiceStates) return;

    const botUserId = client.me.id;
    const humanListeners = voiceStates.filter(
      (vs) => vs.channelId === botChannelId && vs.userId !== botUserId,
    );

    if (humanListeners.length === 0) {
      try {
        await client.kazagumo.destroyPlayer(guildId);
      } catch {
        // Player may already be destroyed (e.g. race with NodeLink disconnect)
      }
    }
  },
});
