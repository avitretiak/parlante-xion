# Types — parlante-xion

## Overview

TypeScript type definitions. 6 files, 260 lines. Centralized via `#parlante/types` subpath import.

## Structure

```
types/
├── index.ts       # Type barrel (exports from all files)
├── player.ts      # ParlantePlayer types (10 exports)
├── commands.ts    # Command option types
├── db.ts          # Database schema types
├── services.ts    # Service interfaces
└── (../types.ts)  # Duplicate file in src/ — prefer types/index.ts
```

## Where to Look

| Need | File | Notes |
|------|------|-------|
| Player types | `player.ts` | ParlantePlayer, PlayerState, TrackInfo, etc. |
| Command options | `commands.ts` | Option type definitions for Seyfert commands |
| DB types | `db.ts` | Drizzle schema types (Setting, FavoriteQuery, etc.) |
| Service interfaces | `services.ts` | Service contracts |
| Import types | Use `#parlante/types` | Points to `./src/types/index.ts` |

## Conventions

**Import:** `#parlante/types` for the barrel, `#parlante/types/{file}` for specific files. Both resolve via the wildcard catchall, with `#parlante/types` having a semantic override to `./src/types/index.ts`.
```typescript
import type { ParlantePlayer } from '#parlante/types/player';
import type { /* ... */ } from '#parlante/types';
```

**Type-only imports:** Prefer `import type` for types (better tree-shaking, clearer intent)

## Notes

**Player types:** Most complex file. Defines ParlantePlayer state, track metadata, player events.

**DB types:** Generated from Drizzle schema. Don't edit manually — use `bun run db:generate`.
