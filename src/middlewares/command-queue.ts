import { createMiddleware } from 'seyfert';

/**
 * Command Queue Middleware
 * Serializes command execution per guild to prevent race conditions
 * when multiple commands arrive for the same guild simultaneously.
 */

const pending = new Map<string, Promise<void>>();

export const commandQueue = createMiddleware<void>(async ({ context, next }) => {
  const guildId = context.guildId;
  if (!guildId) return next();

  const previous = pending.get(guildId) ?? Promise.resolve();
  let resolve!: () => void;
  const current = new Promise<void>((r) => {
    resolve = r;
  });
  pending.set(
    guildId,
    previous.then(() => current),
  );

  await previous;
  try {
    await next();
  } finally {
    resolve();
    // Clean up if this was the last command for this guild
    if (pending.get(guildId) === current) {
      pending.delete(guildId);
    }
  }
});
