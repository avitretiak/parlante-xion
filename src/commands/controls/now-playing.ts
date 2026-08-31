import { Declare, Command, type CommandContext, Middlewares } from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types';
import messages from '#parlante/utils/constants/messages';
import { buildNowPlayingEmbed } from '#parlante/utils/player/build-now-playing-embed';

@Declare({
  name: 'now-playing',
  description: messages.commands.nowPlaying.description,
})
@Middlewares(['voiceGuard', 'commandQueue'])
export default class NowPlayingCommand extends Command {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId!;
    const kazagumo = ctx.client.kazagumo;
    const kPlayer = kazagumo.players.get(guildId);

    if (!kPlayer || !kPlayer.queue.current) {
      await ctx.write({
        content: messages.commands.nowPlaying.nothingPlaying,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { embed, components } = buildNowPlayingEmbed(kPlayer);
    await ctx.write({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
  }
}
