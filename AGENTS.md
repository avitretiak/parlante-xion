# Agent Rules — parlante-xion

Discord music bot. Bun + Seyfert + Kazagumo/Shoukaku/NodeLink + Drizzle SQLite. Bilingual en/es-UY.

## Deeper Documentation

| Document                                         | Scope                                                |
| ------------------------------------------------ | ---------------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)               | System design, bootstrap, audio pipeline, gotchas    |
| [docs/COMMANDS.md](docs/COMMANDS.md)             | Full command reference — options, flows, permissions |
| [src/commands/AGENTS.md](src/commands/AGENTS.md) | Command handler conventions and patterns             |
| [src/utils/AGENTS.md](src/utils/AGENTS.md)       | Utility functions navigation                         |

## Where to Look

| Task           | Location                     |
| -------------- | ---------------------------- |
| Add command    | `src/commands/`              |
| Audio pipeline | `src/structures/kazagumo.ts` |
| Player state   | `src/managers/players.ts`    |
| i18n messages  | `src/languages/`             |
| DB schema      | `src/db/schema.ts`           |
| Middleware     | `src/middlewares/`           |
| TTS            | `src/services/tts/`          |

## Conventions

**Imports:** `#parlante/*` subpath imports only (never relative cross-module). Defined in `package.json` imports + `tsconfig.json` paths.

**Commands:** Seyfert decorators `@Declare`, `@Options`, `@Middlewares`. Playback/queue commands require `@Middlewares(['voiceGuard', 'commandQueue'])`. Business logic stays in `src/services/`.

**Logging:** `debug`, `info`, `warn`, `error` from `#parlante/utils/system/logger`. Never `console.log` (exception: `log-banner.ts` startup).

**Formatting + Linting:** oxfmt (`.oxfmtrc.json`), oxlint (`.oxlintrc.json`). Pre-commit hook runs both.

**i18n:** `en.ts` and `es-UY.ts` must stay synchronized. `bun test` enforces key parity.

## Anti-Patterns

- Never relative imports cross-module (use `#parlante/*`)
- Never `console.log` (except `log-banner.ts`)
- Never `as any` or `@ts-ignore` (the intentional `as unknown as UsingClient` bridge cast in `initKazagumo` in `kazagumo.ts` is documented)
- Never skip `ParlantePlayer.destroy()` before `playersManager.delete()` — leaks timers
- Never put business logic in command handlers (use services)
- Never defer/write from middlewares (voiceGuard only validates)

## Commands

```bash
bun run dev          # start bot
bun run typecheck    # type check
bun test             # tests (i18n parity)
bun run lint         # oxlint
bun run format       # oxfmt
```

## Commit Rules

No co-authorship trailers. No AI attribution.
