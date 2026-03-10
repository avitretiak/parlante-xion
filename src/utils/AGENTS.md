# Utils — parlante-xion

## Overview

Pure utilities. 14 files across 6 subdirs, 772 lines total. No state, no side effects (except logger).

## Structure

```
utils/
├── system/       # Infrastructure (4 files)
│   ├── logger.ts           # LogTape logger instance (never use console.log)
│   ├── command-queue.ts    # CommandQueue/Manager for serialization
│   ├── log-banner.ts       # Startup banner display
│   └── (other)
├── player/       # Player UI helpers (2 files)
│   ├── build-now-playing-embed.ts  # Now-playing embed builder
│   └── get-progress-bar.ts         # Track progress bar ASCII art
├── constants/    # App constants (2 files)
│   ├── constants.ts        # Global constants (colors, limits, etc.)
│   └── messages.ts         # i18n message keys (ALL user-facing text)
├── config/       # Config helpers (2 files)
│   ├── create-database-url.ts      # DB URL builder from env
│   └── get-guild-settings.ts       # Guild settings cache
├── error/        # Error classes (1 file)
│   └── errors.ts           # Error class definitions ONLY (no helpers)
└── general/      # Generic utilities (4 files)
    ├── arrays.ts           # shuffle function
    ├── string.ts           # String manipulation
    ├── time.ts             # Time formatting (ms → "1:30")
    └── url.ts              # URL cleaning/validation
```

## Where to Look

| Task | File | Notes |
|------|------|-------|
| Add logging | `system/logger.ts` | LogTape. Use debug/info/warn/error, never console.log |
| Command serialization | `system/command-queue.ts` | CommandQueue/Manager. Used by commandQueue middleware |
| Now-playing embeds | `player/build-now-playing-embed.ts` | Embed construction for current track |
| Progress bars | `player/get-progress-bar.ts` | ASCII progress bar [▓▓▓▓░░░░░░] |
| User-facing text | `constants/messages.ts` | ALL UI strings. Reference by key, actual text in languages/ |
| Global constants | `constants/constants.ts` | Embed colors, limits, defaults |
| DB URL | `config/create-database-url.ts` | Resolves DATABASE_URL or builds from DATA_DIR |
| Guild settings | `config/get-guild-settings.ts` | Cached guild config (playlistLimit, leaveOnEmpty, etc.) |
| Error classes | `error/errors.ts` | Classes only. No helper functions. |
| Shuffle | `general/arrays.ts` | Fisher-Yates shuffle |
| Time formatting | `general/time.ts` | milliseconds → "1:30:45" |
| URL cleaning | `general/url.ts` | Strip markdown, clean URLs for search |

## Conventions

**Import via subpath:**
```typescript
import { debug, info, warn, error } from '#parlante/utils/system/logger';
import { shuffle } from '#parlante/utils/general/arrays';
import messages from '#parlante/utils/constants/messages';
```

**Pure functions:** All utils except logger are pure (no side effects, no state mutations, deterministic)

**Logging:** Use logger functions, never `console.log`. Configured in `src/index.ts` (LogTape setup).

**Messages:** All user-facing strings via `messages` keys. Actual text in `src/languages/en.ts` and `es-UY.ts`.

**Error classes:** Define in `errors.ts`, throw from services. Classes only, no helper functions per AGENTS.md rules.

## Anti-Patterns

- Never use `console.log` (use logger)
- Never add state to utilities (keep pure)
- Never put business logic here (use services)
- Never add helper functions to `errors.ts` (classes only)
- Never hardcode user-facing text (use messages constants)
