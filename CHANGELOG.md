# Changelog

All notable changes to Parlante Xion.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `/config set-report-channel`: pin now-playing and status messages to a permanent channel
- `/cleanup` now purges bot messages across every server the bot is in (per-guild Manage Messages required)

### Changed

- Pin Bun 1.4.0 stable for Docker and CI

### Fixed

- Now-playing card is deleted instead of orphaned when the output channel changes mid-session
- NodeLink-restart recovery
- CI test environment sets a writable `DATA_DIR` for database initialization
- Corrected the pinned `oven-sh/setup-bun` action revision in the CI workflow
- Live-node rebind and null-session resume guard

## [1.0.2] — 2026-08-04

### Added

- Healthchecks for all services
- Multi-architecture Docker images
- Documentation: self-hosting, configuration, and command guides

### Changed

- CI quality gates: typecheck, lint, format check, and tests
- Deployment and build hardening

## [1.0.1] — 2026-03-10

### Changed

- Docker build and import setup improvements; consolidated imports and contributor docs

### Fixed

- Unloadable tracks and now-playing status/UI
- Atomic player teardown
- YouTube single-video playlist parameters
- Voice guard behavior
- Non-ASCII label handling

## [1.0.0] — 2026-03-05

### Added

- Initial public release
- YouTube, Spotify, SoundCloud playback via NodeLink
- 24 slash commands: play, pause, resume, stop, skip, queue, loop, shuffle, seek, volume, TTS, and more
- Per-guild configuration (playlist limit, auto-disconnect, volume)
- Favorites system with autocomplete
- TTS overlay via Flowery (es-UY voice)
- Now-playing embed with interactive controls and progress bar
- Auto-disconnect on idle and empty voice channel
- Volume ducking during TTS
- Bilingual support: English and Spanish (es-UY)
- Docker Compose setup with NodeLink and youtube-cipher
- Drizzle ORM + Bun SQLite for persistence
- GitHub Actions CI/CD with GHCR image publishing

[1.0.2]: https://github.com/avitretiak/parlante-xion/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/avitretiak/parlante-xion/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/avitretiak/parlante-xion/releases/tag/v1.0.0
