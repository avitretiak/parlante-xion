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

**Import:** Always use `#parlante/types` or `#parlante/types/{file}`
```typescript
import type { ParlantePlayer } from '#parlante/types/player';
import type { /* ... */ } from '#parlante/types';
```

**Package.json mapping:**
```json
"#parlante/types": "./src/types/index.ts",
"#parlante/types/*": "./src/types/*"
```

**tsconfig.json paths:**
```json
"#parlante/types": ["./src/types/index.ts"],
"#parlante/types/*": ["./src/types/*"]
```

**Type-only imports:** Prefer `import type` for types (better tree-shaking, clearer intent)

## Notes

**Duplication issue:** `src/types.ts` exists alongside `src/types/index.ts`. Package.json points to `types/index.ts` (canonical). Consider removing `types.ts` to avoid confusion.

**Player types:** Most complex file. Defines ParlantePlayer state, track metadata, player events.

**DB types:** Generated from Drizzle schema. Don't edit manually — use `bun run db:generate`.
