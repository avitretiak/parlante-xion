import {
  ActionRow,
  ComponentCommand,
  StringSelectMenu,
  StringSelectOption,
  type ComponentContext,
} from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types';
import { destroyPlayer, playersManager } from '#parlante/managers/players';
import { runExclusive } from '#parlante/middlewares/command-queue';
import {
  formatQueueTrackChoiceLabel,
  getQueueFingerprint,
  getQueueTrackFingerprint,
} from '#parlante/services/queue-service';
import { error } from '#parlante/utils/system/logger';
import messages from '#parlante/utils/constants/messages';

const HANDLED_IDS = [
  'player_toggle_play_pause',
  'player_skip',
  'player_stop',
  'player_remove_queue',
];
const QUEUE_REMOVE_SELECT_ID = 'queue_remove_select';
const MAX_SELECT_OPTIONS = 25;
const DISCORD_USER_ID_PATTERN = /^\d{17,20}$/;

export default class PlayerControlsCommand extends ComponentCommand {
  componentType = 'Button' as const;

  filter(ctx: ComponentContext<'Button'>): boolean {
    return HANDLED_IDS.includes(ctx.customId);
  }

  async run(ctx: ComponentContext<'Button'>) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.write({
        content: messages.error.notInDirectMessage,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Acknowledge before waiting on the lock: `runExclusive` can wait behind
    // any in-flight /play, TTS, or other queued command, and if the holder
    // outlasts Discord's interaction acknowledgement window the button token
    // expires and the ack itself rejects. Validation failures after the lock
    // are sent as followups on the already-acknowledged interaction.
    await ctx.deferUpdate();

    // Same per-guild exclusivity as the commandQueue middleware: rapid
    // toggle/skip/stop clicks are serialized so they cannot race each other
    // (or an in-flight command) on the same player.
    await runExclusive(guildId, () => this.handleButton(ctx, guildId));
  }

  private async handleButton(ctx: ComponentContext<'Button'>, guildId: string) {
    const kazagumo = ctx.client.kazagumo;
    const kPlayer = kazagumo.players.get(guildId);
    const parlantePlayer = playersManager.get(guildId);

    if (!kPlayer || !kPlayer.queue.current) {
      await ctx.followup({
        content: messages.error.nothingPlaying,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const member = ctx.member;
    if (member) {
      const userVoiceState = await member.voice('flow');
      if (!userVoiceState?.channelId || userVoiceState.channelId !== kPlayer.voiceId) {
        await ctx.followup({
          content: messages.error.notInVoiceChannel,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

    switch (ctx.customId) {
      case 'player_toggle_play_pause': {
        if (kPlayer.paused) {
          kPlayer.pause(false);
        } else {
          kPlayer.pause(true);
        }
        if (parlantePlayer) {
          await parlantePlayer.sendOrUpdateNowPlaying(ctx.client, true);
        }
        break;
      }
      case 'player_skip': {
        if (kPlayer.queue.size === 0) {
          await ctx.followup({
            content: messages.error.noSongToSkip,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await kPlayer.skip();
        break;
      }
      case 'player_stop': {
        try {
          await destroyPlayer(kazagumo, guildId);
        } catch (err) {
          error(`[${guildId}] Failed to destroy player from stop button`, err);
        }
        break;
      }
      case 'player_remove_queue': {
        if (kPlayer.queue.size === 0) {
          await ctx.followup({
            content: messages.error.itemNotFound,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        // Discord caps select menus at 25 options; when more tracks remain the
        // response says so instead of hiding the overflow silently.
        const queueTracks = [...kPlayer.queue].slice(0, MAX_SELECT_OPTIONS);
        // Snapshot the whole pending queue once: every option carries the same
        // queue fingerprint, so any insert/remove/reorder before submit makes
        // the whole menu stale (see queue-removal.ts).
        const queueFingerprint = getQueueFingerprint(kPlayer);
        const options = await Promise.all(
          queueTracks.map(async (track, index) => {
            const position = index + 1;
            const option = new StringSelectOption()
              .setLabel(formatQueueTrackChoiceLabel(track, position))
              .setValue(`${position}:${getQueueTrackFingerprint(track)}:${queueFingerprint}`);
            const requester = track.requester;
            if (typeof requester === 'string' && DISCORD_USER_ID_PATTERN.test(requester)) {
              const user = await ctx.client.cache?.users?.raw(requester);
              const displayName = user?.global_name ?? user?.username ?? requester;
              option.setDescription(messages.queue.removeRequester(`@${displayName}`));
            }
            return option;
          }),
        );
        const select = new StringSelectMenu()
          .setCustomId(QUEUE_REMOVE_SELECT_ID)
          .setPlaceholder(messages.queue.removeSelectPlaceholder)
          .setValuesLength({ min: 1, max: 1 })
          .setOptions(options);

        const remaining = kPlayer.queue.size - queueTracks.length;
        const content =
          remaining > 0
            ? `${messages.queue.removePrompt}\n\n${messages.queue.removePromptLimited(remaining)}`
            : messages.queue.removePrompt;

        await ctx.followup({
          content,
          components: [new ActionRow<StringSelectMenu>().addComponents(select)],
          flags: MessageFlags.Ephemeral,
        });
        break;
      }
    }
  }
}
