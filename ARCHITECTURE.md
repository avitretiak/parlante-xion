# Architecture

## Stack

- **Runtime**: Bun
- **Framework**: Seyfert (Discord bot framework with decorators)
- **Audio**: Kazagumo → Shoukaku → NodeLink (Lavalink-compatible)
- **Database**: Drizzle ORM + Bun SQLite
- **Logging**: LogTape with pretty formatter
- **Languages**: English (`en`), Spanish (`es-UY`)

## System Overview

```
Discord Gateway
    ↓
Seyfert Client (src/index.ts)
    ↓
Middlewares: voiceGuard → commandQueue
    ↓
Command Handlers (src/commands/)
    ↓
Kazagumo ← Shoukaku ← NodeLink ← YouTube/Spotify/SoundCloud
    ↓
ParlantePlayer (src/structures/player.ts)
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

Seyfert's built-in logger is routed through LogTape. Global `unhandledRejection` handler prevents crashes.

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

All playback/queue commands use `@Middlewares(['voiceGuard', 'commandQueue'])`.

## Middlewares (`src/middlewares/`)

### `voiceGuard`

Validates user is in a voice channel (and same channel as bot if bot is connected). Calls `stop(errorMessage)` on failure — `onMiddlewaresError` in `src/index.ts` displays the error to the user.

### `commandQueue`

Serializes command execution per guild using a promise chain. Prevents race conditions when multiple commands arrive simultaneously.

## Audio Pipeline

### Kazagumo Setup (`src/structures/kazagumo.ts`)

Initializes Kazagumo with Seyfert connector. Registers event handlers:

- `playerStart` — sets voice channel status, sends now-playing embed
- `playerEmpty` — sends queue-ended message, starts idle disconnect timer
- `playerDestroy` — cleans up voice status, deletes now-playing message
- `playerException` / `playerResolveError` — debug logging

All async event handlers are wrapped in try/catch to prevent unhandled rejections.

### ParlantePlayer (`src/structures/player.ts`)

Per-guild player state wrapper around `KazagumoPlayer`. Manages:

- Now-playing embeds (debounced updates, auto-replace after 45min)
- Voice channel status text
- Idle disconnect timer
- Periodic embed refresh (5s interval during playback)

### PlayersManager (`src/managers/players.ts`)

Simple `Map<guildId, ParlantePlayer>` with get/set/delete.

### TTS

`/tts <text>` — overlays Flowery TTS audio (Mateo es-UY voice) on current track using NodeLink's mixer. Only works while music is playing. Audio ducking configured via NodeLink env vars.

## Database

Bun SQLite with Drizzle ORM. Migrations committed in `drizzle/` and run on startup via `drizzle-orm/bun-sqlite/migrator`.

### Tables

| Table         | Purpose                            | Key                 |
| ------------- | ---------------------------------- | ------------------- |
| KeyValueCache | TTL cache (autocomplete, metadata) | `key` (text PK)     |
| Setting       | Per-guild config                   | `guildId` (text PK) |
| FavoriteQuery | Saved search queries per guild     | `id` (auto-inc PK)  |

## Events (`src/events/`)

| Event              | Handler                                     |
| ------------------ | ------------------------------------------- |
| `ready`            | Log banner, register commands if configured |
| `guildCreate`      | Log new guild, register commands            |
| `voiceStateUpdate` | Auto-disconnect when last listener leaves   |

## Services (`src/services/`)

| Service              | Purpose                                           |
| -------------------- | ------------------------------------------------- |
| `config.ts`          | Loads env vars (`DATA_DIR`, `DISCORD_TOKEN`, etc) |
| `search.ts`          | `searchTracks()` via Kazagumo                     |
| `queue-service.ts`   | Queue operations (add, manage tracks)             |
| `key-value-cache.ts` | TTL cache backed by KeyValueCache table           |

## Infrastructure

### Docker

2-stage Dockerfile (deps + runtime) on `oven/bun:1-alpine`. Three services in compose:

- `parlante-xion` — the bot
- `nodelink` — `performanc/nodelink:latest`
- `youtube-cipher` — `ghcr.io/kikkia/yt-cipher:master`

### CI

GitHub Actions on push to `main` — builds and pushes bot image to GHCR (multi-arch: amd64 + arm64).

## Import Aliases

All internal imports use `#parlante/*` subpath imports defined in `package.json` `"imports"` field. Example: `#parlante/utils/system/logger`, `#parlante/db/schema`.
