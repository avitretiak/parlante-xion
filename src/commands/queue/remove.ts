import {
  Declare,
  Command,
  type CommandContext,
  Options,
  createIntegerOption,
  Middlewares,
  type AutocompleteInteraction,
} from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types';
import { playersManager } from '#parlante/managers/players';
import { formatQueueTrackChoiceLabel, removeQueuedTrack } from '#parlante/services/queue-service';
import messages from '#parlante/utils/constants/messages';
import { escapeDiscordMarkdown, getTrackTitle } from '#parlante/utils/general/string';

const AUTOCOMPLETE_MAX_CHOICES = 25;

export const removeOptions = {
  position: createIntegerOption({
    description: messages.commands.remove.position,
    required: true,
    min_value: 1,
    autocomplete: async (interaction: AutocompleteInteraction) => {
      const guildId = interaction.guildId;
      const kazagumo = interaction.client.kazagumo;
      const kPlayer = guildId ? kazagumo.players.get(guildId) : undefined;

      if (!kPlayer || !kPlayer.queue.current || kPlayer.queue.size === 0) {
        await interaction.respond([]);
        return;
      }

      const focused = String(interaction.getInput() ?? '').trim();

      const choices: Array<{ name: string; value: number }> = [];
      for (
        let index = 0;
        index < kPlayer.queue.size && choices.length < AUTOCOMPLETE_MAX_CHOICES;
        index += 1
      ) {
        const position = index + 1;
        const track = kPlayer.queue[index]!;
        if (focused !== '' && !position.toString().startsWith(focused)) continue;
        choices.push({ name: formatQueueTrackChoiceLabel(track, position), value: position });
      }

      await interaction.respond(choices);
    },
  }),
};

@Declare({
  name: 'remove',
  description: messages.commands.remove.description,
})
@Options(removeOptions)
@Middlewares(['voiceGuard', 'commandQueue'])
export default class RemoveCommand extends Command {
  async run(ctx: CommandContext<typeof removeOptions>) {
    const guildId = ctx.guildId!;
    const kazagumo = ctx.client.kazagumo;
    const kPlayer = kazagumo.players.get(guildId);

    if (!kPlayer || !kPlayer.queue.current) {
      await ctx.write({ content: messages.error.nothingPlaying, flags: MessageFlags.Ephemeral });
      return;
    }

    const removed = removeQueuedTrack(kPlayer, ctx.options.position);
    if (!removed) {
      await ctx.write({ content: messages.error.itemNotFound, flags: MessageFlags.Ephemeral });
      return;
    }

    const parlantePlayer = playersManager.get(guildId);
    if (parlantePlayer) {
      await parlantePlayer.sendOrUpdateNowPlaying(ctx.client, true);
    }

    await ctx.write({
      content: messages.queue.removedTrack(escapeDiscordMarkdown(getTrackTitle(removed))),
      flags: MessageFlags.Ephemeral,
    });
  }
}
