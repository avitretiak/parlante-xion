import { config } from 'seyfert';

export default config.bot({
  token: process.env.DISCORD_TOKEN ?? '',
  intents: ['Guilds', 'GuildVoiceStates', 'GuildMessages'],
  locations: {
    base: 'src',
    commands: 'commands',
    components: 'components',
    events: 'events',
    langs: 'languages',
  },
});
