import type { KazagumoPlayer } from 'kazagumo';
import type { UsingClient } from 'seyfert';
import type { ActionRow, Button } from 'seyfert';
import messages from '#parlante/utils/constants/messages';
import { buildNowPlayingEmbed } from '#parlante/utils/player/build-now-playing-embed';
import { debug, warn } from '#parlante/utils/system/logger';
import {
  addMixLayer as mixerAdd,
  deleteMixLayer,
  deleteAllMixLayers,
  listMixLayers,
} from '#parlante/services/mixer';

const EMBED_DEBOUNCE_MS = 5000;
const MESSAGE_REPLACEMENT_THRESHOLD_MS = 45 * 60 * 1000; // 45 minutes
const EDIT_FAILURE_COOLDOWN_MS = 15_000; // 15 seconds
const AUTO_DELETE_DELAY_MS = 10_000; // 10 seconds
const MIX_LAYER_POLL_INTERVAL_MS = 2_000;
const MIX_LAYER_POLL_MISS_THRESHOLD = 3;
const MIX_LAYER_MIN_TIMEOUT_MS = 5_000;
const MIX_LAYER_MAX_TIMEOUT_MS = 30_000;

type QueuedMixLayer = {
  encodedTrack: string;
  volume: number;
  timeoutMs: number;
};

type ActiveMixHandle = {
  timeout: NodeJS.Timeout;
  poller: NodeJS.Timeout | null;
};

type Embed = {
  color?: number;
  title?: string;
  description?: string;
  thumbnail?: { url: string };
  timestamp?: string;
  footer?: { text: string };
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
  private refreshInterval: NodeJS.Timeout | null = null;
  private lastMessageSentAt = 0;
  private lastEditFailureTime = 0;
  private readonly activeMixes = new Map<string, ActiveMixHandle>();
  private readonly ttsQueue: QueuedMixLayer[] = [];
  private ttsPlaying = false;

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
  }

  async deleteNowPlayingMessage(client: UsingClient): Promise<void> {
    if (!this.lastMessageId || !this.lastChannelId) return;
    try {
      await client.messages.delete(this.lastMessageId, this.lastChannelId);
    } catch (error) {
      debug('Failed to delete now playing message', error);
    }
    this.clearLastMessage();
  }

  clearLastMessage(): void {
    this.lastMessageId = null;
    this.lastChannelId = null;
    this.lastMessageSentAt = 0;
  }

  startIdleTimer(client: UsingClient, timeoutMs: number): void {
    this.cancelIdleTimer();
    const wait = Math.max(0, timeoutMs);
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.clearVoiceStatus(client).catch((error) =>
        debug('Failed to clear voice status on idle', error),
      );
      const kazagumo = (
        this.kazagumoPlayer as { kazagumo?: { destroyPlayer: (guildId: string) => void } }
      ).kazagumo;
      kazagumo?.destroyPlayer?.(this.guildId);
    }, wait);
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
    }, 5000);
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

  addMixLayer(encodedTrack: string, volume: number, timeoutMs = MIX_LAYER_MAX_TIMEOUT_MS): boolean {
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
    this.clearMixTimeouts();
    this.ttsPlaying = false;
    this.playNextTts();
  }

  async cleanupMixLayers(): Promise<void> {
    this.ttsQueue.length = 0;
    this.ttsPlaying = false;

    for (const handle of this.activeMixes.values()) {
      clearTimeout(handle.timeout);
      if (handle.poller) {
        clearInterval(handle.poller);
      }
    }
    this.activeMixes.clear();

    const sessionId = this.kazagumoPlayer.shoukaku.node.sessionId;
    if (!sessionId) return;
    await deleteAllMixLayers(sessionId, this.guildId);
  }

  destroy(): void {
    this.clearPending();
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

    mixerAdd(sessionId, this.guildId, encodedTrack, volume)
      .then(async (layer) => {
        if (!layer) {
          debug(`[${this.guildId}] Mix layer failed, attempting cleanup and retry`);
          await this.cleanupMixLayers();
          layer = await mixerAdd(sessionId, this.guildId, encodedTrack, volume);
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
          if (pollInFlight) return;

          pollInFlight = true;
          void listMixLayers(sessionId, this.guildId)
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

        this.activeMixes.set(mixId, { timeout, poller });
      })
      .catch((err) => {
        warn(`[${this.guildId}] Mix layer dispatch error`, err);
        this.ttsPlaying = false;
        this.playNextTts();
      });
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
      const sessionId = this.kazagumoPlayer.shoukaku.node.sessionId;
      if (sessionId) {
        void deleteMixLayer(sessionId, this.guildId, mixId);
      }
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
    embed: Embed,
    clearComponents: boolean,
    components?: ActionRow<Button>[],
  ): Promise<void> {
    const messageComponents = clearComponents ? [] : components;

    if (this.lastMessageId && this.lastMessageSentAt > 0) {
      const age = Date.now() - this.lastMessageSentAt;
      if (age > MESSAGE_REPLACEMENT_THRESHOLD_MS) {
        client.messages.delete(this.lastMessageId, this.lastChannelId!).catch(() => {});
        this.clearLastMessage();
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
  }
}
