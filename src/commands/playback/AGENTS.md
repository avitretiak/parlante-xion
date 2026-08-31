# Playback Commands — parlante-xion

Music playback controls. 8 commands. All require `commandQueue` + `voiceGuard` middlewares.

## Where to Look

| Command   | File        | Notes                                               |
| --------- | ----------- | --------------------------------------------------- |
| `/play`   | `play.ts`   | Search + queue tracks, create player (most complex) |
| `/tts`    | `tts.ts`    | TTS overlay via NodeLink mixer (unique pattern)     |
| `/seek`   | `seek.ts`   | Seek to absolute position (time string parsing)     |
| `/fseek`  | `fseek.ts`  | Forward/backward seek (seconds offset)              |
| `/pause`  | `pause.ts`  | Pause playback                                      |
| `/resume` | `resume.ts` | Resume playback                                     |
| `/replay` | `replay.ts` | Restart current track                               |
| `/stop`   | `stop.ts`   | Stop and clear queue                                |

## Key Patterns

**Play command:** Calls `searchTracks()` from `#parlante/services/search`. Creates player via `kazagumo.createPlayer()` if needed, wraps in `ParlantePlayer` via `playersManager.create()`. Handles playlists vs single tracks.

**TTS command (unique):** NodeLink mixer overlay (`/v4/sessions/{sessionId}/players/{guildId}/mixer`). Only works during active playback. Hardcoded: Flowery TTS, voice "Mateo", language "es-UY". 10-second max length.

**Seek commands:** Parse time strings (`"1:30"`, `"90s"`). Validate position within track bounds. Block livestreams.
