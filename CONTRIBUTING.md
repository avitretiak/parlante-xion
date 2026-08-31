# Contributing

Thanks for considering contributing to Parlante Xion.

## Getting Started

```bash
git clone https://github.com/avitretiak/parlante-xion.git
cd parlante-xion
bun install
cp .env.example .env   # fill in real values
```

## Development

```bash
bun run dev         # start bot
bun run typecheck   # type check
bun test            # run tests
bun run lint        # oxlint
bun run format      # oxfmt
```

A local NodeLink instance is required for audio features. Start it with:

```bash
docker compose -f docker-compose.yml up -d nodelink youtube-cipher
```

## Code Conventions

- **Imports**: `#parlante/*` subpath imports only, never relative cross-module
- **Commands**: Seyfert decorators `@Declare`, `@Options`, `@Middlewares`
- **Playback/queue**: require `@Middlewares(['voiceGuard', 'commandQueue'])`
- **Logging**: `debug`, `info`, `warn`, `error` from `#parlante/utils/system/logger`
- **Business logic**: in `src/services/`, not command handlers
- **i18n**: `en.ts` and `es-UY.ts` must stay synchronized

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system design.

## Before Submitting

- `bun test` passes (includes i18n key parity check)
- `bun run typecheck` passes
- `bun run lint` passes
- `bun run format:check` passes
- No `console.log` (use the logger)
- No `as any` or `@ts-ignore`

## Pull Requests

- Keep PRs focused — one feature or fix per PR
- Reference related issues
- No co-authorship trailers

## Commit Messages

Conventional Commits format. Subject ≤50 chars. Examples:

```
feat: add playlist export command
fix: handle NodeLink reconnect during playback
docs: add self-hosting guide
```
