# Playback Commands — parlante-xion

## Overview

Music playback controls. 8 commands, 604 lines total. All require voiceGuard + commandQueue middlewares.

## Where to Look

| Command | File | Lines | Purpose |
|---------|------|-------|---------|
| `/play` | `play.ts` | 192 | Search + queue tracks, create player (most complex) |
| `/tts` | `tts.ts` | 113 | TTS overlay via NodeLink mixer (unique pattern) |
| `/seek` | `seek.ts` | 89 | Seek to position (time string parsing) |
| `/fseek` | `fseek.ts` | 92 | Forward/backward seek (seconds offset) |
| `/pause` | `pause.ts` | ~30 | Pause playback |
| `/resume` | `resume.ts` | ~30 | Resume playback |
| `/replay` | `replay.ts` | ~30 | Restart current track |
| `/stop` | `stop.ts` | ~40 | Stop and clear queue |

## Conventions

**All commands follow this pattern:**
```typescript
@Declare({ name: '...', description: messages.commands....description })
@Middlewares(['voiceGuard', 'commandQueue'])
export default class XCommand extends Command {
  async run(ctx: CommandContext) {
    await ctx.deferReply();
    const guildId = ctx.guildId!;
    const kazagumo = ctx.client.kazagumo;
    const kPlayer = kazagumo.players.get(guildId);
    
    // Validation + execution
    // Response via ctx.editOrReply() or ctx.write()
  }
}
```

**Player access:** `ctx.client.kazagumo.players.get(guildId)` → KazagumoPlayer or undefined

**Play command specifics:**
- Calls `searchTracks(query, requester)` from `#parlante/services/search`
- Creates player via `kazagumo.createPlayer()` if needed
- Uses `playersManager.create()` to wrap in ParlantePlayer
- Handles playlists vs single tracks
- Queues tracks via `kPlayer.queue.add()`

**TTS command (unique):**
- Only works while music is playing
- NodeLink mixer overlay (`/v4/sessions/{sessionId}/players/{guildId}/mixer`)
- Hardcoded: Flowery TTS, voice "Mateo", language "es-UY"
- No YouTube search, no queue, no voice/language selection
- 10-second max length enforced

**Seek commands:**
- Parse time strings (seek.ts: "1:30", "90s")
- Offset calculations (fseek.ts: positive/negative seconds)
- Validate position in track bounds

## Anti-Patterns

- Never skip voiceGuard + commandQueue (serialization prevents race conditions)
- Never implement search logic in commands (use searchTracks service)
- Never access player queue directly without checking kPlayer exists
- Never extend TTS beyond playback overlay (architecture decision)
