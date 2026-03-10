# Queue Commands — parlante-xion

Queue manipulation commands. 8 commands. All require `commandQueue` + `voiceGuard` middlewares.

## Where to Look

| Command | File | Notes |
|---------|------|-------|
| `/queue` | `queue.ts` | Display queue with pagination |
| `/skip` | `skip.ts` | Skip current or multiple tracks |
| `/next` | `next.ts` | Skip to next track |
| `/unskip` | `unskip.ts` | Play previous track |
| `/shuffle` | `shuffle.ts` | Shuffle queue |
| `/remove` | `remove.ts` | Remove track by position |
| `/move` | `move.ts` | Move track between positions |
| `/clear` | `clear.ts` | Clear entire queue |

## Key Patterns

**Player access:** `ctx.client.kazagumo.players.get(guildId)` — always check for undefined before operating.

**Queue access:** `kPlayer.queue` — KazagumoQueue with array-like API.

**Service functions:** Complex operations use `#parlante/services/queue-service` (`removeTrackFromQueue`, `moveTrackInQueue`). Never mutate queue directly in commands.

**Queue display:** Pagination via embeds. Green while playing, orange while paused. Footer shows page info + total track count.
