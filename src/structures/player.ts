import type { KazagumoPlayer } from 'kazagumo';
import type { UsingClient } from 'seyfert';
import type { ActionRow, Button } from 'seyfert';
import messages from '#parlante/utils/constants/messages';
import { buildNowPlayingEmbed } from '#parlante/utils/player/build-now-playing-embed';
import { debug, warn } from '#parlante/utils/system/logger';
import { addMixLayer as mixerAdd, deleteAllMixLayers } from '#parlante/services/mixer';

const EMBED_DEBOUNCE_MS = 5000;
const MESSAGE_REPLACEMENT_THRESHOLD_MS = 45 * 60 * 1000; // 45 minutes
const EDIT_FAILURE_COOLDOWN_MS = 15_000; // 15 seconds
const AUTO_DELETE_DELAY_MS = 10_000; // 10 seconds
const MIX_LAYER_SAFETY_TIMEOUT_MS = 120_000; // 2 minutes — fallback if MixEndedEvent never arrives

type Embed = {
  color?: number;
  title?: string;
  description?: string;
  thumbnail?: { url: string };
  timestamp?: string;
  footer?: { text: string };
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
  private readonly activeMixes = new Map<string, NodeJS.Timeout>();

  constructor(
    public readonly kazagumoPlayer: KazagumoPlayer,
    public readonly guildId: string,
    textChannelId: string,
  ) {
    this.textChannelId = textChannelId;
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

  async addMixLayer(encodedTrack: string, volume: number): Promise<boolean> {
    const sessionId = this.kazagumoPlayer.shoukaku.node.sessionId;
    if (!sessionId) {
      warn(`[${this.guildId}] No session ID available for mix layer`);
      return false;
    }

    let layer = await mixerAdd(sessionId, this.guildId, encodedTrack, volume);

    if (!layer) {
      debug(`[${this.guildId}] Mix layer failed, attempting cleanup and retry`);
      await this.cleanupMixLayers();
      layer = await mixerAdd(sessionId, this.guildId, encodedTrack, volume);
    }

    if (!layer) return false;

    const mixId = layer.id;
    const timeout = setTimeout(() => {
      this.activeMixes.delete(mixId);
      debug(`[${this.guildId}] Mix layer ${mixId} expired by safety timeout`);
    }, MIX_LAYER_SAFETY_TIMEOUT_MS);
    this.activeMixes.set(mixId, timeout);
    return true;
  }

  onMixEnded(mixId: string): void {
    const timeout = this.activeMixes.get(mixId);
    if (!timeout) return;
    clearTimeout(timeout);
    this.activeMixes.delete(mixId);
    debug(`[${this.guildId}] Mix layer ended: ${mixId}`);
  }

  async cleanupMixLayers(): Promise<void> {
    for (const timeout of this.activeMixes.values()) {
      clearTimeout(timeout);
    }
    this.activeMixes.clear();

    const sessionId = this.kazagumoPlayer.shoukaku.node.sessionId;
    if (!sessionId) return;
    await deleteAllMixLayers(sessionId, this.guildId);
  }

  destroy(): void {
    this.clearPending();
    this.cancelIdleTimer();
    this.stopRefreshInterval();
    this.clearMixTimeouts();
  }

  private clearPending(): void {
    this.pending = null;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private clearMixTimeouts(): void {
    for (const timeout of this.activeMixes.values()) {
      clearTimeout(timeout);
    }
    this.activeMixes.clear();
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
