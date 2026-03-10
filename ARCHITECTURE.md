# Architecture

## Stack

- **Runtime**: Bun
- **Framework**: Seyfert (Discord bot framework with decorators)
- **Audio**: Kazagumo → Shoukaku → NodeLink (Lavalink-compatible)
- **Database**: Drizzle ORM + Bun SQLite
- **Logging**: LogTape with pretty formatter
- **Linting**: oxlint (`.oxlintrc.json`)
- **Formatting**: oxfmt (`.oxfmtrc.json`)
- **Languages**: English (`en`), Spanish (`es-UY`)

## System Overview

```
Discord Gateway
    ↓
Seyfert Client (src/index.ts)
    ↓
Middlewares: commandQueue → voiceGuard
    ↓
Command Handlers (src/commands/)
    ↓
Services (search, queue, config)
    ↓
Kazagumo → Shoukaku → NodeLink → YouTube/Spotify/SoundCloud
    ↓
Kazagumo Events
    ↓
PlayersManager → ParlantePlayer (per-guild state)
    ↓
Seyfert REST (messages, voice status) → Discord
    ↓
SQLite via Drizzle (settings, cache, favorites)
```

## Entry Point

`src/index.ts` — CLI dispatcher with subcommands:

| Command             | Action                      |
| ------------------- | --------------------------- |
| `start`             | Start bot                   |
| `dev`               | Start bot (alias)           |
| `migrate`           | Run Drizzle migrations only |
| `migrate-and-start` | Migrate then start (Docker) |

Startup sequence: create data directory → `initKazagumo(client)` → register middlewares (voiceGuard, commandQueue) → `client.start()`.

Seyfert's built-in logger is routed through LogTape. Global `unhandledRejection` handler prevents crashes. Error handlers registered for `onRunError`, `onPermissionsFail`, `onBotPermissionsFail`, `onOptionsError`, `onMiddlewaresError`.

## Commands (`src/commands/`)

Seyfert slash commands using `@Declare`, `@Options`, `@Middlewares` decorators. Organized by category:

```
commands/
├── config/      # cleanup, config, disconnect
├── controls/    # now-playing, volume
├── favorites/   # favorites (CRUD with autocomplete)
├── loop/        # loop, loop-queue
├── playback/    # play, pause, resume, stop, replay, seek, fseek, tts
└── queue/       # queue, skip, next, unskip, shuffle, remove, move, clear
```

All playback/queue commands use `@Middlewares(['commandQueue', 'voiceGuard'])`. See `docs/COMMANDS.md` for the full command reference with options, flows, and permissions.

## Middlewares (`src/middlewares/`)

### `voiceGuard`

Validates the user is in a voice channel (and same channel as bot if bot is connected). Calls `stop(errorMessage)` on failure — `onMiddlewaresError` in `src/index.ts` displays the error to the user. Never defers or writes directly.

### `commandQueue`

Serializes command execution per guild using a promise chain (`Map<guildId, Promise>`). Prevents race conditions when multiple commands arrive simultaneously. Transparent to commands — no error handling, just ordering.

## Audio Pipeline

### Kazagumo Setup (`src/structures/kazagumo.ts`)

Initializes Kazagumo with Seyfert connector. Connects to NodeLink using `NODELINK_URL` and `NODELINK_PASSWORD`. Shoukaku options: moveOnDisconnect, no resume, 3 reconnect retries.

Registers event handlers:

- `playerStart` — cancels idle timer, sets voice channel status, sends/updates now-playing embed, starts 5s refresh interval
- `playerEmpty` — stops refresh, sends queue-ended message, clears voice status, starts idle disconnect timer (guild-configurable wait)
- `playerDestroy` — stops all timers, clears voice status, deletes now-playing message, removes from PlayersManager
- `playerException` / `playerResolveError` — debug logging

All async event handlers are wrapped in try/catch to prevent unhandled rejections.

### ParlantePlayer (`src/structures/player.ts`)

Per-guild player state wrapper around `KazagumoPlayer`. Manages:

- Now-playing embeds (debounced 5s updates, auto-replace after 45min, edit failure cooldown 15s)
- Voice channel status text
- Idle disconnect timer (guild-configurable, default 30s)
- Periodic embed refresh (5s interval during playback)
- `destroy()` method clears all timers (debounceTimer, idleTimer, refreshInterval) and pending updates

### PlayersManager (`src/managers/players.ts`)

`Map<guildId, ParlantePlayer>` with get/create/delete. `create()` reuses existing player if present (updates textChannelId). `delete()` calls `player.destroy()` before removing from the map.

### TTS

`/tts <text>` — overlays Flowery TTS audio (Mateo es-UY voice) on current track using NodeLink's mixer. Only works while music is playing. Audio ducking configured via NodeLink env vars.

## Database

Bun SQLite with Drizzle ORM. WAL mode + NORMAL synchronous for performance. Database path: `DATA_DIR/bot.db`. Migrations committed in `drizzle/` and run on startup via `drizzle-orm/bun-sqlite/migrator`.

### Tables

| Table         | Purpose                            | Key                 |
| ------------- | ---------------------------------- | ------------------- |
| KeyValueCache | TTL cache (autocomplete, metadata) | `key` (text PK)     |
| Setting       | Per-guild config                   | `guildId` (text PK) |
| FavoriteQuery | Saved search queries per guild     | `id` (auto-inc PK)  |

Setting defaults: playlistLimit=50, secondsToWaitAfterQueueEmpties=30, defaultVolume=100, defaultQueuePageSize=10.

## Events (`src/events/`)

| Event              | Handler                                     |
| ------------------ | ------------------------------------------- |
| `ready`            | Log banner, register commands if configured |
| `guildCreate`      | Log new guild, register commands            |
| `voiceStateUpdate` | Auto-disconnect when last listener leaves   |

## Services (`src/services/`)

| Service              | Purpose                                           |
| -------------------- | ------------------------------------------------- |
| `config.ts`          | Loads env vars (`DATA_DIR`)                       |
| `search.ts`          | `searchTracks()` via Kazagumo with error handling |
| `queue-service.ts`   | Queue operations (add with front/shuffle options) |
| `key-value-cache.ts` | TTL cache backed by KeyValueCache table           |

## Error Classes (`src/utils/error/errors.ts`)

Defines error hierarchy: `AppError` (base), `PlayerError`, `ValidationError`, `ConfigurationError`, `ServiceError`, `NetworkError`. No helper functions — class definitions only.

## Infrastructure

### Docker

2-stage Dockerfile (deps + runtime) on `oven/bun:1-alpine`. Runs as non-root `parlante` user. Healthcheck: `kill -0 1`. Three services in compose:

- `parlante-xion` — the bot
- `nodelink` — `performanc/nodelink:latest`
- `youtube-cipher` — `ghcr.io/kikkia/yt-cipher:master`

### CI

GitHub Actions on push to `main` — builds and pushes bot image to GHCR (multi-arch: amd64 + arm64).

## Import Aliases

All internal imports use `#parlante/*` subpath imports defined in both `package.json` `"imports"` and `tsconfig.json` `"paths"`. Hybrid system: wildcard catchall (`#parlante/*` → `src/*`) with semantic overrides for non-obvious mappings (`#parlante/config` → `src/services/config.ts`, `#parlante/db` → `src/db/index.ts`, `#parlante/types` → `src/types/index.ts`).

## Gotchas

**Init order:** `initKazagumo()` MUST be called before `client.start()` — wrong order breaks audio entirely.

**Import-time side effects:** DB initializes when `src/db/index.ts` is imported (not via explicit call).

**Memory leak:** MUST call `ParlantePlayer.destroy()` before `playersManager.delete()`. Skipping `destroy()` leaks `debounceTimer`, `idleTimer`, and `refreshInterval`.

**Middleware contract:** `voiceGuard` validates and calls `stop(errorMessage)` on failure. `onMiddlewaresError` in `src/index.ts` handles display. Never defer or write from `voiceGuard`.

**CLI dispatch:** Entry point uses `process.argv[2]` to map to handlers (`migrate-and-start`, `register-commands`, `dev`). Not a standard entry point pattern.

**Command registration:** Happens in `ready.ts` event handler, not a separate deploy script.

**TTS constraints:** Only works while music is playing. Hardcoded to Flowery TTS, voice "Mateo", language "es-UY". No YouTube search, no queue, no voice/language selection.
