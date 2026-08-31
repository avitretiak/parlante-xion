import type { KazagumoPlayer } from 'kazagumo';
import type { UsingClient } from 'seyfert';
import type { ActionRow, Button } from 'seyfert';
import type { APIEmbed } from 'seyfert/lib/types';
import messages from '#parlante/utils/constants/messages';
import { buildNowPlayingEmbed } from '#parlante/utils/player/build-now-playing-embed';
import { debug, warn } from '#parlante/utils/system/logger';
import {
  addMixLayer as mixerAdd,
  deleteMixLayer,
  deleteAllMixLayers,
  listMixLayers,
} from '#parlante/services/mixer';
import { destroyPlayer, playersManager } from '#parlante/managers/players';

const EMBED_DEBOUNCE_MS = 5000;
const EMBED_REFRESH_INTERVAL_MS = 15_000; // 15 seconds
const MESSAGE_REPLACEMENT_THRESHOLD_MS = 45 * 60 * 1000; // 45 minutes
const EDIT_FAILURE_COOLDOWN_MS = 15_000; // 15 seconds
const AUTO_DELETE_DELAY_MS = 10_000; // 10 seconds
const QUEUE_ENDED_DELETE_DELAY_MS = 60_000; // 1 minute
const MIX_LAYER_POLL_INTERVAL_MS = 2_000;
const MIX_LAYER_POLL_MISS_THRESHOLD = 3;
const MIX_LAYER_MIN_TIMEOUT_MS = 5_000;
const MIX_LAYER_MAX_TIMEOUT_MS = 30_000;
const TTS_QUEUE_MAX_PENDING = 5;

type QueuedMixLayer = {
  encodedTrack: string;
  volume: number;
  timeoutMs: number;
};

type ActiveMixHandle = {
  // The session that actually created the layer — the retry may have landed
  // on a newer session after a rollover. Polling and cleanup must use this
  // exact session, never the current or the original guessed one.
  sessionId: string;
  timeout: NodeJS.Timeout;
  poller: NodeJS.Timeout | null;
};

// Snapshot captured at playerClosed time so the resume handler knows exactly
// which track was interrupted and where it was.
export type ResumeSnapshot = {
  trackId: string;
  position: number;
  paused: boolean;
  isStream: boolean;
  isSeekable: boolean;
  length: number;
};

export class ParlantePlayer {
  public textChannelId: string;
  private lastMessageId: string | null = null;
  private lastChannelId: string | null = null;
  private lastUpdateTime = 0;
  private debounceTimer: NodeJS.Timeout | null = null;
  private pending: { client: UsingClient; channelId: string } | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private queueEndedDeleteTimer: NodeJS.Timeout | null = null;
  private queueEndedRevision = 0;
  private refreshInterval: NodeJS.Timeout | null = null;
  private lastMessageSentAt = 0;
  private lastEditFailureTime = 0;
  private readonly activeMixes = new Map<string, ActiveMixHandle>();
  private readonly ttsQueue: QueuedMixLayer[] = [];
  private ttsPlaying = false;

  // Liveness token for mix dispatch: invalidated by voice close, cleanup and
  // destroy so a late POST result can never install timers/layers.
  private mixGeneration = 0;

  // Serializes message write/edit/delete operations so concurrent refresh,
  // immediate and debounced updates can never orphan or clear a freshly
  // tracked message.
  private messageOpChain: Promise<void> = Promise.resolve();

  // Track-scoped position tracking — reset on every playerStart so a stale
  // position from a previous track can never bleed into a resume attempt.
  private lastKnownTrackId: string | null = null;
  public lastKnownPosition = 0;

  // Single-flight resume guard — prevents stacked replays from multiple
  // consecutive close events and allows cancellation on destroy/skip.
  private resumeTimer: NodeJS.Timeout | null = null;
  private resumeNonce = 0;

  constructor(
    public kazagumoPlayer: KazagumoPlayer,
    public readonly guildId: string,
    textChannelId: string,
  ) {
    this.textChannelId = textChannelId;
  }

  setKazagumoPlayer(kazagumoPlayer: KazagumoPlayer): void {
    this.kazagumoPlayer = kazagumoPlayer;
  }

  // Called from playerStart so position tracking is always scoped to the
  // current track. Clears any pending resume from a previous track.
  resetPositionTracking(trackId: string): void {
    this.lastKnownTrackId = trackId;
    this.lastKnownPosition = 0;
    this.cancelResumeTimer();
  }

  // Called from playerUpdate. Only records position when the update belongs to
  // the track we started tracking, preventing cross-track position bleed.
  recordPosition(trackId: string, position: number): void {
    if (this.lastKnownTrackId !== trackId) return;
    this.lastKnownPosition = position;
  }

  // Schedule a single-flight reconnect resume. Returns the nonce assigned to
  // this attempt so the caller can verify it is still current when it fires.
  scheduleResumeTimer(delayMs: number, fn: () => void): number {
    this.cancelResumeTimer();
    const nonce = ++this.resumeNonce;
    this.resumeTimer = setTimeout(() => {
      this.resumeTimer = null;
      fn();
    }, delayMs);
    return nonce;
  }

  // Returns true if the given nonce is still the active resume attempt.
  isResumeNonceCurrent(nonce: number): boolean {
    return this.resumeNonce === nonce;
  }

  cancelResumeTimer(): void {
    if (this.resumeTimer) {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }
    // Incrementing the nonce invalidates any in-flight async resume that
    // checked the nonce before the await but fires after cancelResumeTimer.
    this.resumeNonce++;
  }

  async sendOrUpdateNowPlaying(client: UsingClient, immediate = false): Promise<void> {
    this.cancelQueueEndedDeletion();
    if (immediate) {
      this.clearPending();
      await this.performNowPlayingUpdate(client, this.textChannelId);
      return;
    }

    const elapsed = Date.now() - this.lastUpdateTime;
    if (elapsed < EMBED_DEBOUNCE_MS) {
      this.pending = { client, channelId: this.textChannelId };
      if (!this.debounceTimer) {
        this.debounceTimer = setTimeout(() => {
          this.debounceTimer = null;
          const pending = this.pending;
          this.pending = null;
          if (pending) {
            this.performNowPlayingUpdate(pending.client, pending.channelId).catch((error) =>
              debug('Debounced now playing update failed', error),
            );
          }
        }, EMBED_DEBOUNCE_MS - elapsed);
      }
      return;
    }

    this.clearPending();
    await this.performNowPlayingUpdate(client, this.textChannelId);
  }

  async sendQueueEnded(client: UsingClient): Promise<void> {
    const channelId = this.lastChannelId ?? this.textChannelId;
    if (!channelId) return;
    this.cancelQueueEndedDeletion();
    const revision = this.queueEndedRevision;
    await this.writeOrEditMessage(
      client,
      channelId,
      {
        color: 0x0f0f0f,
        title: `⏹️ ${messages.player.endedTitle}`,
        description: messages.player.ended,
      },
      true,
    );
    if (revision !== this.queueEndedRevision) return;
    // Detach ownership: capture the exact message just written so this delayed
    // delete can never clear or delete a message tracked by a newer update.
    const messageId = this.lastMessageId;
    const targetChannelId = this.lastChannelId ?? channelId;
    if (!messageId || !targetChannelId) return;
    this.queueEndedDeleteTimer = setTimeout(() => {
      this.queueEndedDeleteTimer = null;
      // Run through the same operation chain as writes/edits so this DELETE
      // is ordered against any newer now-playing update: an update enqueued
      // after it always runs after, and writes a fresh card when ownership
      // was detached below.
      void this.enqueueMessageOp(async () => {
        // If this wrapper still tracks the exact captured message, detach
        // ownership synchronously before the awaited DELETE — a newer update
        // must never re-track a message that is about to be removed. If a
        // newer card is already tracked (different IDs), leave it untouched.
        if (this.lastMessageId === messageId && this.lastChannelId === targetChannelId) {
          this.clearLastMessage();
        }
        await this.deleteMessage(client, messageId, targetChannelId);
      });
    }, QUEUE_ENDED_DELETE_DELAY_MS);
  }

  async deleteNowPlayingMessage(client: UsingClient): Promise<void> {
    await this.enqueueMessageOp(async () => {
      if (!this.lastMessageId || !this.lastChannelId) return;
      const messageId = this.lastMessageId;
      const channelId = this.lastChannelId;
      await this.deleteMessage(client, messageId, channelId);
      this.clearLastMessage();
    });
  }

  private async deleteMessage(
    client: UsingClient,
    messageId: string,
    channelId: string,
  ): Promise<void> {
    try {
      await client.messages.delete(messageId, channelId);
    } catch (error) {
      debug('Failed to delete message', error);
    }
  }

  private enqueueMessageOp<T>(op: () => Promise<T>): Promise<T> {
    const run = this.messageOpChain.then(op);
    this.messageOpChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  clearLastMessage(): void {
    this.lastMessageId = null;
    this.lastChannelId = null;
    this.lastMessageSentAt = 0;
  }

  startIdleTimer(client: UsingClient, timeoutMs: number): void {
    this.cancelIdleTimer();
    // A non-positive timeout means "never leave the channel".
    if (timeoutMs <= 0) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      void this.onIdleTimeout(client);
    }, timeoutMs);
  }

  private async onIdleTimeout(client: UsingClient): Promise<void> {
    const player = this.kazagumoPlayer;
    // Revalidate before leaving: only act when this wrapper is still the live
    // player and the queue is still empty — a new track may have started
    // while the timer was pending.
    const kazagumo = player.kazagumo;
    if (kazagumo.players.get(this.guildId) !== player) return;
    if (playersManager.get(this.guildId) !== this) return;
    if (player.playing || player.paused) return;
    if (player.queue.current || player.queue.size > 0) return;
    await this.clearVoiceStatus(client);
    // Revalidate after the awaited status cleanup: playback may have started
    // (or the wrapper been rebound) while the request was pending — never
    // destroy a live or newer player.
    if (kazagumo.players.get(this.guildId) !== player) return;
    if (playersManager.get(this.guildId) !== this) return;
    if (player.playing || player.paused) return;
    if (player.queue.current || player.queue.size > 0) return;
    try {
      await destroyPlayer(kazagumo, this.guildId);
    } catch (err) {
      debug(`[${this.guildId}] Idle teardown failed`, err);
    }
  }

  cancelIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  startRefreshInterval(client: UsingClient): void {
    this.stopRefreshInterval();
    this.refreshInterval = setInterval(() => {
      const kPlayer = this.kazagumoPlayer;
      if (kPlayer.paused || !kPlayer.queue.current) return;
      if (kPlayer.queue.current.isStream) return;
      this.performNowPlayingUpdate(client, this.textChannelId).catch((error) =>
        debug('Refresh interval now playing update failed', error),
      );
    }, EMBED_REFRESH_INTERVAL_MS);
  }

  stopRefreshInterval(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  async setVoiceStatus(client: UsingClient, status: string): Promise<void> {
    const voiceChannelId = this.kazagumoPlayer.voiceId;
    if (!voiceChannelId) return;
    try {
      await client.rest.request('PUT', `/channels/${voiceChannelId}/voice-status`, {
        body: { status },
      });
    } catch (error) {
      debug('Voice status failed', error);
    }
  }

  async clearVoiceStatus(client: UsingClient): Promise<void> {
    await this.setVoiceStatus(client, '');
  }

  sendAutoDeleteMessage(client: UsingClient, content: string): void {
    const channelId = this.textChannelId;
    client.messages
      .write(channelId, { content })
      .then((message) => {
        if (message && 'id' in message) {
          const messageId = message.id as string;
          setTimeout(() => {
            client.messages.delete(messageId, channelId).catch(() => {});
          }, AUTO_DELETE_DELAY_MS);
        }
      })
      .catch((err) => debug('Failed to send auto-delete message', err));
  }

  // Read-only capacity probe for the TTS mix queue, mirroring the addMixLayer
  // bound. Commands consult this BEFORE remote synthesis so a full queue never
  // pays for NodeLink resolve work; addMixLayer keeps the authoritative guard
  // for any caller that skips the probe.
  hasTtsCapacity(): boolean {
    return this.ttsQueue.length < TTS_QUEUE_MAX_PENDING;
  }

  addMixLayer(encodedTrack: string, volume: number, timeoutMs = MIX_LAYER_MAX_TIMEOUT_MS): boolean {
    // The active item is not part of the pending queue: it was shifted out
    // when playback started, so the cap only bounds what is still waiting.
    if (this.ttsQueue.length >= TTS_QUEUE_MAX_PENDING) {
      return false;
    }
    const boundedTimeout = Math.min(
      MIX_LAYER_MAX_TIMEOUT_MS,
      Math.max(MIX_LAYER_MIN_TIMEOUT_MS, timeoutMs),
    );
    this.ttsQueue.push({ encodedTrack, volume, timeoutMs: boundedTimeout });
    if (!this.ttsPlaying) {
      this.playNextTts();
    }
    return true;
  }

  onMixEnded(mixId: string): void {
    this.finishMixLayer(mixId, 'event');
  }

  onVoiceConnectionClosed(): void {
    if (!this.ttsPlaying && this.activeMixes.size === 0) return;

    warn(
      `[${this.guildId}] Voice closed while TTS mix was active; unlocking queue and dropping in-flight mix`,
    );
    this.mixGeneration++;
    this.clearMixTimeouts();
    this.ttsPlaying = false;
    this.playNextTts();
  }

  async cleanupMixLayers(): Promise<void> {
    this.mixGeneration++;
    this.ttsQueue.length = 0;
    this.ttsPlaying = false;

    // Retain origin-session metadata until every layer is deleted: after a
    // session rollover the creating session may no longer be current, and
    // cleanup must target each layer's own session, never the current one.
    const sessions = new Set<string>();
    for (const handle of this.activeMixes.values()) {
      clearTimeout(handle.timeout);
      if (handle.poller) {
        clearInterval(handle.poller);
      }
      sessions.add(handle.sessionId);
    }
    this.activeMixes.clear();

    // Untracked layers can only belong to the current session — any layer
    // created under an older session is tracked with its origin sessionId.
    const currentSessionId = this.kazagumoPlayer.shoukaku.node.sessionId;
    if (currentSessionId) {
      sessions.add(currentSessionId);
    }

    if (sessions.size === 0) return;
    await Promise.all(
      [...sessions].map((sessionId) => deleteAllMixLayers(sessionId, this.guildId)),
    );
  }

  destroy(): void {
    this.mixGeneration++;
    this.clearPending();
    this.cancelQueueEndedDeletion();
    this.cancelIdleTimer();
    this.cancelResumeTimer();
    this.stopRefreshInterval();
    this.ttsQueue.length = 0;
    this.ttsPlaying = false;
    this.clearMixTimeouts();
  }

  private playNextTts(): void {
    const next = this.ttsQueue.shift();
    if (!next) return;

    this.ttsPlaying = true;
    this.dispatchMixLayer(next.encodedTrack, next.volume, next.timeoutMs);
  }

  private dispatchMixLayer(encodedTrack: string, volume: number, timeoutMs: number): void {
    const sessionId = this.kazagumoPlayer.shoukaku.node.sessionId;
    if (!sessionId) {
      warn(`[${this.guildId}] No session ID available for mix layer`);
      this.ttsPlaying = false;
      this.playNextTts();
      return;
    }

    // Liveness token: invalidated by voice close, cleanup and destroy, so a
    // late POST result can never install timers/layers for a dead session.
    const generation = this.mixGeneration;

    void mixerAdd(sessionId, this.guildId, encodedTrack, volume)
      .then(async (layer) => {
        // Session that actually created the layer — the retry may have landed
        // on a different (newer) session after a rollover.
        let createdSessionId = sessionId;
        if (!layer) {
          // Retry directly with a freshly read session — no lifecycle-wide
          // cleanup (it would erase queued TTS) and never a stale session.
          const retrySessionId = this.kazagumoPlayer.shoukaku.node.sessionId;
          if (!retrySessionId) {
            debug(`[${this.guildId}] Mix layer retry skipped: no session ID`);
            if (this.mixGeneration === generation) {
              this.ttsPlaying = false;
              this.playNextTts();
            }
            return;
          }
          layer = await mixerAdd(retrySessionId, this.guildId, encodedTrack, volume);
          createdSessionId = retrySessionId;
        }

        // Late result: the session moved on. Drop the remote layer from the
        // session that created it, but install no local state.
        if (this.mixGeneration !== generation) {
          if (layer) {
            void deleteMixLayer(createdSessionId, this.guildId, layer.id);
          }
          return;
        }

        if (!layer) {
          warn(`[${this.guildId}] Mix layer failed after retry`);
          this.ttsPlaying = false;
          this.playNextTts();
          return;
        }

        const mixId = layer.id;
        const timeout = setTimeout(() => {
          this.finishMixLayer(mixId, 'safety-timeout');
        }, timeoutMs);

        let pollInFlight = false;
        let consecutiveMisses = 0;
        const poller = setInterval(() => {
          if (pollInFlight || !this.activeMixes.has(mixId)) return;

          pollInFlight = true;
          void listMixLayers(createdSessionId, this.guildId)
            .then((layers) => {
              if (!this.activeMixes.has(mixId)) return;

              const stillPresent = layers.some((layer) => layer.id === mixId);
              if (stillPresent) {
                consecutiveMisses = 0;
                return;
              }

              consecutiveMisses += 1;
              if (consecutiveMisses < MIX_LAYER_POLL_MISS_THRESHOLD) return;
              this.finishMixLayer(mixId, 'poll-miss');
            })
            .finally(() => {
              pollInFlight = false;
            });
        }, MIX_LAYER_POLL_INTERVAL_MS);

        this.activeMixes.set(mixId, { sessionId: createdSessionId, timeout, poller });
      })
      .catch((err) => {
        if (this.mixGeneration !== generation) return;
        warn(`[${this.guildId}] Mix layer dispatch error`, err);
        this.ttsPlaying = false;
        this.playNextTts();
      });
  }

  private cancelQueueEndedDeletion(): void {
    this.queueEndedRevision++;
    if (this.queueEndedDeleteTimer) {
      clearTimeout(this.queueEndedDeleteTimer);
      this.queueEndedDeleteTimer = null;
    }
  }

  private clearPending(): void {
    this.pending = null;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private clearMixTimeouts(): void {
    for (const handle of this.activeMixes.values()) {
      clearTimeout(handle.timeout);
      if (handle.poller) {
        clearInterval(handle.poller);
      }
    }
    this.activeMixes.clear();
  }

  private finishMixLayer(mixId: string, reason: 'event' | 'safety-timeout' | 'poll-miss'): void {
    const handle = this.activeMixes.get(mixId);
    if (!handle) return;

    clearTimeout(handle.timeout);
    if (handle.poller) {
      clearInterval(handle.poller);
    }
    this.activeMixes.delete(mixId);

    if (reason !== 'event') {
      // Cleanup targets the session that created the layer, not whatever
      // session happens to be current now.
      void deleteMixLayer(handle.sessionId, this.guildId, mixId);
    }

    debug(`[${this.guildId}] Mix layer ${mixId} finished (${reason})`);
    this.ttsPlaying = false;
    this.playNextTts();
  }

  private async performNowPlayingUpdate(client: UsingClient, channelId: string): Promise<void> {
    const { embed, components } = buildNowPlayingEmbed(this.kazagumoPlayer);
    await this.writeOrEditMessage(client, channelId, embed, false, components);
  }

  private async writeOrEditMessage(
    client: UsingClient,
    channelId: string,
    embed: APIEmbed,
    clearComponents: boolean,
    components?: ActionRow<Button>[],
  ): Promise<void> {
    await this.enqueueMessageOp(async () => {
      const messageComponents = clearComponents ? [] : components;

      if (this.lastMessageId && this.lastMessageSentAt > 0) {
        const age = Date.now() - this.lastMessageSentAt;
        // A stale card is replaced when it is old, or whenever the target
        // channel changed (e.g. a report channel was configured mid-session):
        // the old card would otherwise be orphaned as spam.
        if (age > MESSAGE_REPLACEMENT_THRESHOLD_MS || this.lastChannelId !== channelId) {
          const oldMessageId = this.lastMessageId;
          const oldChannelId = this.lastChannelId!;
          this.clearLastMessage();
          await this.deleteMessage(client, oldMessageId, oldChannelId);
        }
      }

      if (this.lastMessageId && this.lastChannelId === channelId) {
        try {
          await client.messages.edit(this.lastMessageId, channelId, {
            embeds: [embed],
            components: messageComponents,
          });
          this.lastUpdateTime = Date.now();
          return;
        } catch (error) {
          debug('Failed to edit now playing message', error);
          const code =
            error && typeof error === 'object' && 'code' in error
              ? (error as { code: number }).code
              : null;

          if (code === 429) {
            return;
          }
          if (code === 10008 || code === 50035) {
            this.clearLastMessage();
          } else {
            const now = Date.now();
            if (now - this.lastEditFailureTime < EDIT_FAILURE_COOLDOWN_MS) {
              return;
            }
            this.lastEditFailureTime = now;
            this.clearLastMessage();
          }
        }
      }

      try {
        const message = await client.messages.write(channelId, {
          embeds: [embed],
          components: messageComponents,
        });
        if (message && 'id' in message) {
          this.lastMessageId = message.id as string;
          this.lastChannelId = channelId;
          this.lastMessageSentAt = Date.now();
        }
        this.lastUpdateTime = Date.now();
      } catch (error) {
        debug('Failed to send now playing message', error);
      }
    });
  }
}
