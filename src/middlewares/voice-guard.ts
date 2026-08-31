import { createMiddleware } from 'seyfert';
import messages from '#parlante/utils/constants/messages';

export const voiceGuard = createMiddleware<void>(async ({ context, next, stop }) => {
  if (!context.guildId) {
    return stop(messages.error.notInDirectMessage);
  }

  const member = context.member;
  if (!member) {
    return stop(messages.error.notInVoiceChannel);
  }

  let userVoiceState;
  try {
    userVoiceState = await member.voice('flow');
  } catch {
    return stop(messages.error.notInVoiceChannel);
  }

  if (!userVoiceState?.channelId) {
    return stop(messages.error.notInVoiceChannel);
  }

  const botId = context.client.me.id;
  let guild;
  try {
    guild = await context.guild('flow');
  } catch {
    return stop(messages.error.notInVoiceChannel);
  }

  if (!guild) {
    return stop(messages.error.notInVoiceChannel);
  }

  let botVoiceState;
  try {
    const botMember = await guild.members.fetch(botId);
    botVoiceState = await botMember.voice('flow');
  } catch {
    botVoiceState = null;
  }

  if (botVoiceState?.channelId && botVoiceState.channelId !== userVoiceState.channelId) {
    return stop(messages.error.notInVoiceChannel);
  }

  return next();
});
