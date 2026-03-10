# Queue Commands — parlante-xion

## Overview

Queue manipulation commands. 8 commands, 362 lines total. All require voiceGuard + commandQueue for serialization.

## Where to Look

| Command | File | Lines | Purpose |
|---------|------|-------|---------|
| `/queue` | `queue.ts` | 74 | Display queue with pagination |
| `/skip` | `skip.ts` | ~45 | Skip current track |
| `/next` | `next.ts` | ~40 | Skip to next track (alias) |
| `/unskip` | `unskip.ts` | ~40 | Play previous track |
| `/shuffle` | `shuffle.ts` | ~40 | Shuffle queue |
| `/remove` | `remove.ts` | ~45 | Remove track by position |
| `/move` | `move.ts` | 65 | Move track from position to position |
| `/clear` | `clear.ts` | ~40 | Clear entire queue |

## Conventions

**All commands follow this pattern:**
```typescript
@Declare({ name: '...', description: messages.commands....description })
@Middlewares(['voiceGuard', 'commandQueue'])
export default class XCommand extends Command {
  async run(ctx: CommandContext) {
    const guildId = ctx.guildId!;
    const kazagumo = ctx.client.kazagumo;
    const kPlayer = kazagumo.players.get(guildId);
    
    if (!kPlayer) {
      await ctx.write({ content: messages.error.noPlayer, flags: Ephemeral });
      return;
    }
    
    // Queue operation
    // Response
  }
}
```

**Queue access:** `kPlayer.queue` → KazagumoQueue with array-like API

**Business logic:** Complex queue operations use `#parlante/services/queue-service`:
- `removeTrackFromQueue(queue, position)`
- `moveTrackInQueue(queue, from, to)`

**commandQueue middleware:** Ensures serial execution per guild. Critical for preventing:
- Concurrent skip + remove race conditions
- Queue corruption from parallel modifications
- Player state inconsistencies

**Queue display:**
- Pagination via embeds (10 tracks per page)
- Shows current track separately
- Total duration calculation

## Anti-Patterns

- Never skip commandQueue middleware (causes race conditions)
- Never modify queue without checking kPlayer exists
- Never implement queue logic in commands (use queue-service)
- Never mutate queue during iteration (use service functions)
