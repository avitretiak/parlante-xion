import {
  Declare,
  Command,
  type CommandContext,
  Options,
  createIntegerOption,
  Middlewares,
} from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types';
import { playersManager } from '#parlante/managers/players';
import messages from '#parlante/utils/constants/messages';

const volumeOptions = {
  level: createIntegerOption({
    description: messages.commands.volume.level,
    required: true as const,
    min_value: 0,
    max_value: 100,
  }),
};

@Declare({
  name: 'volume',
  description: messages.commands.volume.description,
})
@Options(volumeOptions)
@Middlewares(['commandQueue', 'voiceGuard'])
export default class VolumeCommand extends Command {
  async run(ctx: CommandContext<typeof volumeOptions>) {
    const guildId = ctx.guildId!;
    const kazagumo = ctx.client.kazagumo;
    const kPlayer = kazagumo.players.get(guildId);

    if (!kPlayer || !kPlayer.queue.current) {
      await ctx.write({ content: messages.error.nothingPlaying, flags: MessageFlags.Ephemeral });
      return;
    }

    const level = ctx.options.level;
    kPlayer.setVolume(level);
    await ctx.write({ content: messages.player.volumeSet(level), flags: MessageFlags.Ephemeral });

    const parlantePlayer = playersManager.get(guildId);
    if (parlantePlayer) {
      await parlantePlayer.sendOrUpdateNowPlaying(ctx.client, true);
    }
  }
}
