# Agent Rules — parlante-xion

## Project Context

Discord music bot. Bun runtime, Seyfert framework, Kazagumo/Shoukaku/NodeLink audio pipeline, Drizzle ORM + SQLite.

## Code Conventions

- **Imports**: Use `#parlante/*` subpath imports (defined in `package.json` `"imports"` and `tsconfig.json` `"paths"`). Never use relative paths for cross-module imports.
- **Commands**: Seyfert decorators (`@Declare`, `@Options`, `@Middlewares`). All playback/queue commands must use `@Middlewares(['voiceGuard', 'commandQueue'])`.
- **Middlewares**: `voiceGuard` does validation only — calls `stop(errorMessage)` on failure, never defers or writes. `onMiddlewaresError` in `src/index.ts` handles display.
- **Formatting**: oxfmt (`.oxfmtrc.json`). **Linting**: oxlint (`.oxlintrc.json`). Pre-commit hook runs both via husky + lint-staged.
- **Logging**: Use `debug`, `info`, `warn`, `error` from `#parlante/utils/system/logger` (LogTape). Never use `console.log`.
- **i18n**: All user-facing strings go through `messages` from `#parlante/utils/constants/messages`. Both `en.ts` and `es-UY.ts` must stay in parity — run `bun test` to verify.
- **Error handling**: Async event handlers in `kazagumo.ts` must be wrapped in try/catch. Never suppress type errors with `as any` or `@ts-ignore`.
- **Error classes**: Define in `src/utils/error/errors.ts`. No helper functions — only class definitions.
- **Type safety**: Single `@ts-expect-error` exists in `kazagumo.ts` for Seyfert connector variance — documented, intentional.

## Architecture Boundaries

- `src/commands/` — Slash command handlers only. Business logic stays in services.
- `src/services/` — Stateless business logic. No Discord API calls except through Seyfert client.
- `src/structures/` — Stateful wrappers (ParlantePlayer, Kazagumo init). `ParlantePlayer.destroy()` must be called before removing from PlayersManager (clears timers).
- `src/middlewares/` — Seyfert middleware. voiceGuard = validation, commandQueue = serialization.
- `src/utils/` — Pure utilities. No state, no side effects.

## TTS Rules

TTS only works while music is playing. Uses NodeLink mixer overlay with Flowery TTS (Mateo, es-UY). No YouTube search, no queue, no language/voice selection. Hardcoded and simple.

## Database

Drizzle ORM + Bun SQLite. Migrations in `drizzle/`, run on startup with `migrate-and-start`. Schema in `src/db/schema.ts`. Three tables: KeyValueCache, Setting, FavoriteQuery.

## Testing

`bun test` — tests in `tests/`. i18n parity test enforces language key match between en.ts and es-UY.ts.

## Docker

2-stage build on `oven/bun:1-alpine`. Runs as non-root `parlante` user. NodeLink runs as separate container (`performanc/nodelink:latest`). YouTube cipher as third container.

## Commit Rules

No co-authorship trailers. No AI attribution in commits.
