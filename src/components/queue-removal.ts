import { ComponentCommand, type ComponentContext } from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types';
import { playersManager } from '#parlante/managers/players';
import { runExclusive } from '#parlante/middlewares/command-queue';
import { removeQueuedTrack } from '#parlante/services/queue-service';
import messages from '#parlante/utils/constants/messages';
import { escapeDiscordMarkdown, getTrackTitle } from '#parlante/utils/general/string';

const QUEUE_REMOVE_SELECT_ID = 'queue_remove_select';
// Strictly a positive position plus the two compact base64url fingerprints
// the button attached when it built the menu: `12:AbC-9_xYz:qRs-0_AbC` (both
// exactly 43 chars, SHA-256 base64url).
const SELECT_VALUE_PATTERN = /^(\d+):([A-Za-z0-9_-]{43}):([A-Za-z0-9_-]{43})$/;

export default class QueueRemovalCommand extends ComponentCommand {
  componentType = 'StringSelect' as const;

  filter(ctx: ComponentContext<'StringSelect'>): boolean {
    return ctx.customId === QUEUE_REMOVE_SELECT_ID;
  }

  async run(ctx: ComponentContext<'StringSelect'>) {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.deferUpdate();
      await ctx.followup({
        content: messages.error.notInDirectMessage,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Acknowledge before waiting on the lock: `runExclusive` can wait behind
    // any in-flight /play, TTS, or other queued command, and if the holder
    // outlasts Discord's interaction acknowledgement window the select token
    // expires and the ack itself rejects.
    await ctx.deferUpdate();

    await runExclusive(guildId, () => this.handleSelect(ctx, guildId));
  }

  private async handleSelect(ctx: ComponentContext<'StringSelect'>, guildId: string) {
    const kazagumo = ctx.client.kazagumo;
    const kPlayer = kazagumo.players.get(guildId);
    const parlantePlayer = playersManager.get(guildId);

    if (!kPlayer || !kPlayer.queue.current) {
      await ctx.editOrReply({
        content: messages.error.nothingPlaying,
        components: [],
      });
      return;
    }

    const member = ctx.member;
    if (member) {
      const userVoiceState = await member.voice('flow');
      if (!userVoiceState?.channelId || userVoiceState.channelId !== kPlayer.voiceId) {
        await ctx.editOrReply({
          content: messages.error.notInVoiceChannel,
          components: [],
        });
        return;
      }
    }

    const value = ctx.interaction.values[0];
    const match = typeof value === 'string' ? SELECT_VALUE_PATTERN.exec(value) : null;
    const position = match ? Number(match[1]) : NaN;
    const fingerprint = match?.[2];
    const queueFingerprint = match?.[3];

    if (
      !match ||
      !Number.isSafeInteger(position) ||
      position < 1 ||
      !fingerprint ||
      !queueFingerprint
    ) {
      await ctx.editOrReply({
        content: messages.queue.removeStale,
        components: [],
      });
      return;
    }

    // Atomic against the menu snapshot: both the track fingerprint and the
    // whole-queue fingerprint must match what the button captured. Any insert,
    // removal, or reorder since then yields null and leaves the queue
    // untouched — including replacement by an exact duplicate.
    const removed = removeQueuedTrack(kPlayer, position, fingerprint, queueFingerprint);
    if (!removed) {
      await ctx.editOrReply({
        content: messages.queue.removeStale,
        components: [],
      });
      return;
    }

    if (parlantePlayer) {
      await parlantePlayer.sendOrUpdateNowPlaying(ctx.client, true);
    }

    await ctx.editOrReply({
      content: messages.queue.removedTrack(escapeDiscordMarkdown(getTrackTitle(removed))),
      components: [],
    });
  }
}
