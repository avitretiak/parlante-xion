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
Middlewares: voiceGuard → commandQueue
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
SQLite via Drizzle (settings, favorites)
```

## Entry Point

`src/index.ts` — CLI dispatcher with subcommands:

| Command             | Action                      |
| ------------------- | --------------------------- |
| `start`             | Start bot                   |
| `dev`               | Start bot (alias)           |
| `migrate`           | Run Drizzle migrations only |
| `migrate-and-start` | Migrate then start (Docker) |

Startup sequence: create data directory → `initKazagumo(client)` → register middlewares (voiceGuard, commandQueue) → `client.start()`. `migrate-and-start` (the Docker default) runs `migrate` first: apply `drizzle/` migrations, exit(1) on failure.

Shutdown: `SIGTERM`/`SIGINT` (installed once, idempotent) tear down every active player and remove the Shoukaku node, then exit 0. Any real teardown failure exits 1 after all players/nodes were still attempted; a shutdown stuck past a 10s grace window force-exits 1. Seyfert's client has no stop API, so gateway teardown is left to process exit.

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

All playback/queue commands use `@Middlewares(['voiceGuard', 'commandQueue'])`. See `docs/COMMANDS.md` for the full command reference with options, flows, and permissions.

## Middlewares (`src/middlewares/`)

### `voiceGuard`

Validates the user is in a voice channel (and same channel as bot if bot is connected). Calls `stop(errorMessage)` on failure — `onMiddlewaresError` in `src/index.ts` displays the error to the user. Never defers or writes directly.

### `commandQueue`

Serializes command execution per guild using a promise chain (`Map<guildId, Promise>`). Prevents race conditions when multiple commands arrive simultaneously. Transparent to commands — no error handling, just ordering.

## Audio Pipeline

### Kazagumo Setup (`src/structures/kazagumo.ts`)

Initializes Kazagumo with Seyfert connector. Connects to NodeLink using `NODELINK_URL` and `NODELINK_PASSWORD`. Shoukaku enables server-session resume (300s), library resume fallback, and six reconnect retries.

Registers event handlers:

- `playerStart` — cancels idle timer, sets voice channel status, sends/updates now-playing embed, starts 5s refresh interval
- `playerEmpty` — stops refresh, sends queue-ended message, clears voice status, starts idle disconnect timer (guild-configurable wait)
- `playerDestroy` — stops all timers, clears voice status, deletes now-playing message, removes from PlayersManager
- `playerClosed`, `playerException`, `playerStuck`, `playerResolveError` — recover or advance after failed playback

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

Bun SQLite with Drizzle ORM. WAL mode + NORMAL synchronous for performance. Database path: `DATA_DIR/db.sqlite` (override with `DATABASE_URL`, e.g. `file:/data/db.sqlite`). Migrations committed in `drizzle/` run via `drizzle-orm/bun-sqlite/migrator` — only the `migrate` and `migrate-and-start` CLI commands run them; plain `start`/`dev` do not. The Docker image starts with `migrate-and-start`.

### Tables

| Table         | Purpose                        | Key                 |
| ------------- | ------------------------------ | ------------------- |
| Setting       | Per-guild config               | `guildId` (text PK) |
| FavoriteQuery | Saved search queries per guild | `id` (auto-inc PK)  |

Setting defaults: playlistLimit=50, secondsToWaitAfterQueueEmpties=30, leaveIfNoListeners=true, defaultVolume=100, defaultQueuePageSize=10.

## Events (`src/events/`)

| Event              | Handler                                      |
| ------------------ | -------------------------------------------- |
| `ready`            | Log banner, register slash commands globally |
| `guildCreate`      | Log new guild                                |
| `voiceStateUpdate` | Auto-disconnect when last listener leaves    |

## Services (`src/services/`)

| Service            | Purpose                                                          |
| ------------------ | ---------------------------------------------------------------- |
| `config.ts`        | Loads data and NodeLink configuration                            |
| `search.ts`        | `searchTracks()` via Kazagumo with error handling                |
| `queue-service.ts` | Resolves playlist limits and creates, queues, and starts players |

## Infrastructure

### Docker

2-stage Dockerfile (deps + runtime) on `oven/bun:canary-alpine@sha256:6692655a2f4f308f370f59273a48b7d77bd840cc2635c9721ba589ac6133d24d`. Runs as non-root `parlante` user, `CMD ["bun", "run", "src/index.ts", "migrate-and-start"]`. HEALTHCHECK via `pgrep` every 30s. Three services in compose:

- `nodelink` — `performanc/nodelink:3.8.0@sha256:3fc8abbc2d01a7787c6141b948958929b55c3a4e1422eea278e4f7a4e08b7ab1`
- `youtube-cipher` — `ghcr.io/kikkia/yt-cipher@sha256:76e485a7f88363f5f67db8eeb1c7a7a6d5706c669ed0b01652e546405b0f2da2`

### CI

GitHub Actions: PRs gate on test + typecheck + lint + format-check. Push to `main` or tag `v*` builds and pushes multi-arch (amd64 + arm64) image to GHCR, then deploys via Komodo.

## Import Aliases

All internal imports use `#parlante/*` subpath imports defined in both `package.json` `"imports"` and `tsconfig.json` `"paths"`. Semantic overrides cover `#parlante/config` → `src/services/config.ts` and `#parlante/db` → `src/db/index.ts`.

## Gotchas

**Init order:** `initKazagumo()` MUST be called before `client.start()` — wrong order breaks audio entirely.

**Import-time side effects:** DB initializes when `src/db/index.ts` is imported (not via explicit call).

**Memory leak:** MUST call `ParlantePlayer.destroy()` before `playersManager.delete()`. Skipping `destroy()` leaks `debounceTimer`, `idleTimer`, and `refreshInterval`.

**Middleware ordering:** `commandQueue` MUST be the last middleware in the chain. Seyfert's `stop()` resolves the framework promise without unwinding `await next()` in upstream middlewares — any middleware that acquires a resource (like `commandQueue`'s per-guild lock) will deadlock if a downstream middleware calls `stop()`. All guard/validation middlewares go before `commandQueue`.

**Middleware contract:** `voiceGuard` validates and calls `stop(errorMessage)` on failure. `onMiddlewaresError` in `src/index.ts` handles display. Never defer or write from `voiceGuard`.

**CLI dispatch:** Entry point uses `process.argv[2]` to map to handlers (`start`, `dev`, `migrate`, `migrate-and-start`). Not a standard entry point pattern.

**Command registration:** Happens unconditionally in the `ready.ts` event handler, not a separate deploy script and not behind any environment toggle.

**TTS constraints:** Only works while music is playing. Hardcoded to Flowery TTS, voice "Mateo", language "es-UY". No YouTube search, no queue, no voice/language selection.
