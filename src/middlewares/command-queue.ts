import { createMiddleware } from 'seyfert';

/**
 * Command Queue Middleware
 * Serializes command execution per guild to prevent race conditions
 * when multiple commands arrive for the same guild simultaneously.
 */

const pending = new Map<string, Promise<void>>();

/**
 * Runs `task` exclusively per guild: concurrent invocations for the same
 * guild are serialized in arrival order, while different guilds proceed
 * independently. Shared by the commandQueue middleware and player control
 * buttons so buttons and commands cannot interleave per guild.
 */
export function runExclusive(guildId: string, task: () => Promise<void>): Promise<void> {
  const previous = pending.get(guildId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  pending.set(guildId, current);

  return previous.then(async () => {
    try {
      await task();
    } finally {
      release();
      // Clean up if this was the last queued task for this guild.
      if (pending.get(guildId) === current) {
        pending.delete(guildId);
      }
    }
  });
}

export const commandQueue = createMiddleware<void>(async ({ context, next }) => {
  const guildId = context.guildId;
  if (!guildId) return next();

  return runExclusive(guildId, async () => {
    await next();
  });
});
