/**
 * Command Queue - Ensures commands execute sequentially per guild
 * This prevents race conditions when multiple commands are issued simultaneously
 */

export class CommandQueue {
  private queue: Array<{
    command: () => Promise<void>;
    resolve: () => void;
    reject: (error: unknown) => void;
  }> = [];
  private isProcessing = false;

  /**
   * Enqueue a command to be executed
   * @param command The command function to execute
   * @returns Promise that resolves when the command completes
   */
  async enqueue(command: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ command, resolve, reject });
      this.processNext();
    });
  }

  /**
   * Process the next command in the queue
   */
  private async processNext(): Promise<void> {
    // If already processing or queue is empty, do nothing
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const { command, resolve, reject } = this.queue.shift()!;

    try {
      await command();
      resolve();
    } catch (error) {
      reject(error);
    } finally {
      this.isProcessing = false;
      // Process next command if any
      this.processNext();
    }
  }

  /**
   * Get the current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Check if a command is currently being processed
   */
  isBusy(): boolean {
    return this.isProcessing;
  }
}

/**
 * Command Queue Manager - Manages command queues per guild
 */
export class CommandQueueManager {
  private queues = new Map<string, CommandQueue>();

  /**
   * Get or create a command queue for a guild
   * @param guildId The guild ID
   * @returns The command queue for the guild
   */
  getQueue(guildId: string): CommandQueue {
    if (!this.queues.has(guildId)) {
      this.queues.set(guildId, new CommandQueue());
    }
    return this.queues.get(guildId)!;
  }

  /**
   * Remove a command queue for a guild (cleanup)
   * @param guildId The guild ID
   */
  removeQueue(guildId: string): void {
    this.queues.delete(guildId);
  }
}
