# Commands — parlante-xion

## Overview

Slash command handlers for Discord bot. 24 files across 6 domains: playback, queue, config, controls, loop, favorites.

## Structure

```
commands/
├── playback/   # Play, pause, resume, stop, seek, TTS (8 files, 604 lines) — See playback/AGENTS.md
├── queue/      # Queue display, skip, shuffle, remove, move (8 files, 362 lines) — See queue/AGENTS.md
├── config/     # Bot config, cleanup, disconnect (3 files, 423 lines)
├── controls/   # Volume, now-playing (2 files, 76 lines)
├── loop/       # Loop track/queue (2 files, 64 lines)
└── favorites/  # Favorite queries (1 file, 346 lines)
```

## Where to Look

| Task | File | Notes |
|------|------|-------|
| Add playback command | `playback/*.ts` | Requires voiceGuard + commandQueue. See [playback/AGENTS.md](playback/AGENTS.md) |
| Add queue command | `queue/*.ts` | Requires voiceGuard + commandQueue. See [queue/AGENTS.md](queue/AGENTS.md) |
| Config command | `config/config.ts` | SubCommand pattern, guild settings |
| Volume control | `controls/volume.ts` | Integer option, 0-100 range |
| Loop modes | `loop/loop.ts`, `loop-queue.ts` | Toggle track/queue loop |
| Favorites | `favorites/favorites.ts` | Largest file (346 lines), SubCommand pattern |

## Conventions

**Command structure:**
```typescript
@Declare({
  name: 'command-name',
  description: messages.commands.commandName.description,
})
@Middlewares(['voiceGuard', 'commandQueue'])  // For playback/queue only
export default class CommandName extends Command {
  async run(ctx: CommandContext) {
    await ctx.deferReply();  // Or deferReply(true) for ephemeral
    // Validation
    // Business logic via services
    // Response
  }
}
```

**Naming:** kebab-case, descriptive (e.g., `now-playing`, `loop-queue`)

**Options:** Use `createStringOption`, `createIntegerOption`, `createBooleanOption` from Seyfert

**Middlewares:**
- `voiceGuard`: Validates user in voice channel, same as bot if bot connected. Calls `stop(errorMessage)` on failure.
- `commandQueue`: Serializes command execution per guild (prevents race conditions on player/queue state)

**Required for playback/queue commands:** `@Middlewares(['voiceGuard', 'commandQueue'])`

**Business logic:** Commands are thin handlers. Complex logic → `src/services/`

## Anti-Patterns

- Never put business logic in commands (use services)
- Never defer/write from middlewares (voiceGuard only validates)
- Never skip voiceGuard + commandQueue for playback/queue commands
- Never use relative imports (use `#parlante/*`)
