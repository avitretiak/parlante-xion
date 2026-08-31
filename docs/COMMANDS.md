# Commands

User reference and developer/agent reference for all parlante-xion commands.

All user-facing strings are internationalized (English + Spanish es-UY). The responses described below reflect the English locale.

## Middleware Reference

Commands declare middlewares via `@Middlewares([...])`. Two middlewares exist:

| Middleware     | Purpose                                                                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `voiceGuard`   | Validates user is in a voice channel and in the same channel as the bot. Calls `stop(errorMessage)` on failure — never defers or writes. Errors displayed by `onMiddlewaresError` in `src/index.ts`.                                  |
| `commandQueue` | Serializes command execution per guild via a promise chain. Prevents race conditions when multiple commands arrive simultaneously. Also used by the now-playing button controls, so buttons and commands cannot interleave per guild. |

Most playback and queue commands use both: `@Middlewares(['voiceGuard', 'commandQueue'])`.

## Permission Matrix

| Command             | Voice Required | Permission Required |
| ------------------- | -------------- | ------------------- |
| Playback commands   | Yes            | --                  |
| Queue commands      | Yes            | --                  |
| Loop commands       | Yes            | --                  |
| `/volume`           | Yes            | --                  |
| `/now-playing`      | Yes            | --                  |
| `/disconnect`       | Yes            | --                  |
| `/favorites use`    | Yes            | --                  |
| `/favorites list`   | No             | --                  |
| `/favorites create` | No             | --                  |
| `/favorites remove` | No             | --                  |
| `/config *`         | No             | Manage Guild        |
| `/cleanup`          | No             | Manage Messages     |

---

## Playback

### `/play`

Search and play a track or playlist.

| Option      | Type    | Required | Constraints                      |
| ----------- | ------- | -------- | -------------------------------- |
| `query`     | string  | Yes      | Autocomplete with 5-minute cache |
| `immediate` | boolean | No       | Add to front of queue            |
| `shuffle`   | boolean | No       | Shuffle the added tracks         |
| `skip`      | boolean | No       | Skip current track after adding  |

**Middlewares**: commandQueue, voiceGuard

**Flow**: Searches via Kazagumo. Single tracks are queued directly. Playlists are capped by the guild's `playlistLimit` setting (default 50). Creates a new player if none exists (applying guild default volume), otherwise reuses the existing one. Starts playback if the player was idle. Replies ephemeral.

### `/pause`

Toggle pause/resume on the current track.

**Middlewares**: commandQueue, voiceGuard

**Flow**: Checks a track is playing. Toggles the paused state. Replies with the new state.

### `/resume`

Resume playback if paused.

**Middlewares**: commandQueue, voiceGuard

**Flow**: Checks the player is paused. Resumes playback. If already playing, replies with an error message.

### `/stop`

Stop playback and clear the queue.

**Middlewares**: commandQueue, voiceGuard

**Flow**: Clears the queue, skips the current track, then destroys the player (disconnects from voice).

### `/replay`

Restart the current track from the beginning.

**Middlewares**: commandQueue, voiceGuard

**Flow**: Checks the current track is not a livestream. Seeks to position 0.

### `/seek`

Seek to an absolute position in the current track.

| Option | Type   | Required | Constraints                                                                      |
| ------ | ------ | -------- | -------------------------------------------------------------------------------- |
| `time` | string | Yes      | Accepts `90`, `5.5`, `1m30s`, `1h2m3s`, `MM:SS` (`1:30`), `HH:MM:SS` (`1:02:03`) |

**Middlewares**: commandQueue, voiceGuard

**Flow**: Parses the time string. Rejects negative values. Validates the position is within track bounds (0 to track length). Seeks. Replies with the formatted target time. Blocks livestreams.

### `/fseek`

Seek forward or backward relative to the current position.

| Option | Type   | Required | Constraints                                                                                                                    |
| ------ | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `time` | string | Yes      | Same formats as `/seek`, plus a leading `+`/`-` sign (`-30s`, `+1:30`). Added to current position, clamped to the track start. |

**Middlewares**: commandQueue, voiceGuard

**Flow**: Parses the time string, adds it to the current playback position, validates bounds, then seeks. Blocks livestreams.

### `/tts`

Overlay text-to-speech audio on the current track.

| Option    | Type   | Required | Constraints   |
| --------- | ------ | -------- | ------------- |
| `message` | string | Yes      | Text to speak |

**Middlewares**: commandQueue, voiceGuard

**Flow**: Checks music is currently playing. Resolves a TTS audio track via Flowery TTS (hardcoded Mateo voice, es-UY locale). POSTs to the NodeLink mixer endpoint to overlay the TTS on the current audio stream. Audio ducking is handled by NodeLink. Only works during active playback — no queuing, no voice/language selection.

---

## Queue

### `/queue`

Display the current queue with pagination.

| Option      | Type    | Required | Constraints                               |
| ----------- | ------- | -------- | ----------------------------------------- |
| `page`      | integer | No       | Default 1                                 |
| `page-size` | integer | No       | 1-30, default from guild settings (or 10) |

**Middlewares**: commandQueue, voiceGuard

**Flow**: Calculates pagination from queue size. Builds an embed showing the current track and upcoming tracks. Embed color is green while playing, orange while paused. Footer shows "Page X/Y" and total track count. Replies ephemeral.

### `/skip`

Skip the current track or multiple tracks.

| Option   | Type    | Required | Constraints      |
| -------- | ------- | -------- | ---------------- |
| `number` | integer | No       | Min 1, default 1 |

**Middlewares**: commandQueue, voiceGuard

**Flow**: Removes (n-1) tracks from the front of the queue, then skips the current track. If the number exceeds queue size, clears the queue and skips anyway.

### `/next`

Skip to the next track in the queue.

**Middlewares**: commandQueue, voiceGuard

**Flow**: Checks the queue is not empty. Skips the current track.

### `/unskip`

Go back to the previous track.

**Middlewares**: commandQueue, voiceGuard

**Flow**: Retrieves the previous track from history. If available, plays it. Otherwise replies with an error ("no song to go back to").

### `/shuffle`

Shuffle the queue.

**Middlewares**: commandQueue, voiceGuard

**Flow**: Checks there are at least 2 tracks in the queue. Shuffles. If fewer than 2, replies with an error.

### `/remove`

Remove a track from the queue by position.

| Option     | Type    | Required | Constraints         |
| ---------- | ------- | -------- | ------------------- |
| `position` | integer | Yes      | Min 1, autocomplete |

**Middlewares**: commandQueue, voiceGuard

**Flow**: The `position` option autocompletes with up to 25 queued tracks (labels match the queue-removal select: `number. artist - title [source]`, max 100 chars). Typing a position filters suggestions by numeric prefix. Submitting removes the track at that position, keeps the current track untouched, and refreshes the now-playing card immediately. Out-of-range positions are rejected with an error and the queue is left unchanged. Unlike the select menu, the slash command performs no fingerprint verification: it removes whatever track currently sits at the position.

### `/move`

Move a track from one position to another in the queue.

| Option | Type    | Required | Constraints |
| ------ | ------- | -------- | ----------- |
| `from` | integer | Yes      | Min 1       |
| `to`   | integer | Yes      | Min 1       |

**Middlewares**: commandQueue, voiceGuard

**Flow**: Splices the track out of the `from` position and inserts it at the `to` position.

### `/clear`

Clear the entire queue (current track keeps playing).

**Middlewares**: commandQueue, voiceGuard

**Flow**: Checks a track is currently playing. Clears all queued tracks.

---

## Loop

### `/loop`

Toggle track loop on/off.

**Middlewares**: commandQueue, voiceGuard

**Flow**: Toggles between `track` and `none` loop modes. Replies with the new state.

### `/loop-queue`

Toggle queue loop on/off.

**Middlewares**: commandQueue, voiceGuard

**Flow**: Toggles between `queue` and `none` loop modes. Replies with the new state.

---

## Controls

### `/volume`

Set the playback volume.

| Option  | Type    | Required | Constraints |
| ------- | ------- | -------- | ----------- |
| `level` | integer | Yes      | 0-100       |

**Middlewares**: commandQueue, voiceGuard

**Flow**: Sets the player volume. Updates the now-playing embed to reflect the new volume level.

### `/now-playing`

Show the current track with interactive controls.

**Middlewares**: commandQueue, voiceGuard

**Flow**: Checks a track is playing. Builds a now-playing embed with progress bar, track metadata, and button components (play/pause, skip, stop). Replies ephemeral.

---

## Config

Parent command requires **Manage Guild** permission. No voice middlewares.

### `/config get`

Show all current guild settings as an embed.

**Flow**: Fetches guild settings from the database. Builds a formatted embed with all setting values. Replies ephemeral.

### `/config set-playlist-limit`

| Option  | Type    | Required | Constraints |
| ------- | ------- | -------- | ----------- |
| `limit` | integer | Yes      | Min 1       |

Maximum number of tracks loaded from a single playlist.

### `/config set-wait-after-queue-empties`

| Option  | Type    | Required | Constraints     |
| ------- | ------- | -------- | --------------- |
| `delay` | integer | Yes      | Min 0 (seconds) |

Seconds to wait before auto-disconnecting when the queue is empty. Set to 0 to disable automatic disconnect.

### `/config set-leave-if-no-listeners`

| Option  | Type    | Required |
| ------- | ------- | -------- |
| `value` | boolean | Yes      |

Whether to auto-disconnect when all listeners leave the voice channel.

### `/config set-default-volume`

| Option  | Type    | Required | Constraints |
| ------- | ------- | -------- | ----------- |
| `level` | integer | Yes      | 0-100       |

Default volume applied when the player is created for a guild.

### `/config set-default-queue-page-size`

| Option      | Type    | Required | Constraints |
| ----------- | ------- | -------- | ----------- |
| `page-size` | integer | Yes      | 1-30        |

Default page size for `/queue` when the user doesn't specify one.

### `/config set-report-channel`

| Option    | Type    | Required | Constraints  |
| --------- | ------- | -------- | ------------ |
| `channel` | channel | Yes      | Text channel |

Permanent report channel: now-playing and status messages are posted here regardless of which channel the command was issued from. Cleared by setting a different channel. When unset, output follows the command's channel as before.

All `set-*` subcommands update the guild's Setting row in the database and invalidate the settings cache.

---

## Utility

### `/disconnect`

Disconnect the bot from the voice channel.

**Middlewares**: commandQueue, voiceGuard

**Flow**: Checks the player exists. Destroys the Kazagumo player, which triggers cleanup (timers, voice status, now-playing message).

### `/cleanup`

Delete bot messages from every server the bot is in.

**Middlewares**: None

**Permission**: Manage Messages (verified per guild)

**Flow**: Iterates all guilds the bot is in and every text channel of each, skipping guilds where the invoker lacks Manage Messages. In each channel it fetches up to 1000 recent bot messages. Messages less than 14 days old are bulk-deleted (Discord API limit). Older messages are deleted individually. Replies with the total count of deleted messages.

---

## Favorites

### `/favorites use`

Play a saved favorite query.

| Option      | Type    | Required | Constraints                                      |
| ----------- | ------- | -------- | ------------------------------------------------ |
| `name`      | string  | Yes      | Autocomplete from saved favorites, max 100 chars |
| `immediate` | boolean | No       | Add to front of queue                            |
| `shuffle`   | boolean | No       | Shuffle the added tracks                         |
| `skip`      | boolean | No       | Skip current track after adding                  |

**Middlewares**: commandQueue, voiceGuard

**Flow**: Looks up the saved query by name and guild. Searches tracks using the saved query string. Queues and plays the results identically to `/play`.

### `/favorites list`

List all saved favorites for the guild.

**Middlewares**: None

**Flow**: Fetches all favorites for the guild. Displays up to 25 in an embed. If more exist, shows "...and X more" in the footer. Replies ephemeral.

### `/favorites create`

Save a search query as a favorite.

| Option  | Type   | Required | Constraints            |
| ------- | ------ | -------- | ---------------------- |
| `name`  | string | Yes      | 1-100 chars after trim |
| `query` | string | Yes      | 1-100 chars after trim |

**Middlewares**: None

**Flow**: Trims both inputs; rejects empty or over-100-character values. Inserts into the FavoriteQuery table, treating any name conflict (including concurrent duplicates) as "already exists". Unique constraint on (guildId, name).

### `/favorites remove`

Delete a saved favorite.

| Option | Type   | Required | Constraints                       |
| ------ | ------ | -------- | --------------------------------- |
| `name` | string | Yes      | Autocomplete from saved favorites |

**Middlewares**: None

**Flow**: Looks up the favorite. Checks permission — the author who created it or the guild owner can delete. Removes from database. Autocomplete shows all favorites to the guild owner, only own favorites to other users.

---

## Button Controls

The `/now-playing` command attaches interactive buttons to its embed. These are component commands defined in `src/components/player-controls.ts`.

All four buttons perform inline validation (check guild context, player exists, user in same voice channel) rather than using middleware. They call `deferUpdate()` to acknowledge the interaction silently.

| Button ID                  | Action                                                    |
| -------------------------- | --------------------------------------------------------- |
| `player_toggle_play_pause` | Toggle pause/resume, update embed                         |
| `player_skip`              | Skip current track. Ephemeral followup if queue is empty. |
| `player_stop`              | Destroy player (stop + disconnect)                        |
| `player_remove_queue`      | Open ephemeral select of queued tracks to remove          |

## Queue Removal Select

The `player_remove_queue` button on the now-playing card opens an ephemeral string select (`queue_remove_select`) listing the first 25 queued tracks. The current track is never offered for removal.

- Each option is labeled `number. artist - title [source]` (max 100 chars; select labels are plain text). Valid requester IDs use cached Discord display names in option descriptions, falling back to the ID when unavailable.
- When more than 25 tracks are queued, the prompt says how many were omitted.
- The select option value is `position:trackFingerprint:queueFingerprint`: the track fingerprint is compact SHA-256 (base64url) over stable track metadata including requester, and the queue fingerprint covers ordered per-entry identities plus track fingerprints for every pending track (current track excluded). Values stay under Discord's 100-character limit.
- Selecting an option removes that exact queued entry (both fingerprints verified at submit time) and refreshes the now-playing card immediately. If ordered entry identity or content no longer matches the snapshot — including replacement by a distinct exact duplicate — removal is refused, queue stays untouched, and menu becomes localized "queue changed" message with no components.
- Like the button controls, the select acknowledges the interaction before waiting on the per-guild command lock and performs inline voice validation. Validation failures replace and clear the ephemeral menu.
