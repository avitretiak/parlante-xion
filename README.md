# parlante-xion

[![CI](https://github.com/avitretiak/parlante-xion/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/avitretiak/parlante-xion/actions/workflows/docker-publish.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e0?logo=bun)](https://bun.sh)
[![Docker](https://img.shields.io/badge/container-Docker-2496ED?logo=docker)](https://hub.docker.com/)

## Features

- YouTube, Spotify, SoundCloud playback
- Queue management (shuffle, move, remove, skip)
- TTS overlay (Spanish es-UY voice) on current track
- Per-guild configuration (volume, playlist limit, auto-disconnect)
- Interactive now-playing embed with controls
- Favorites system with autocomplete
- Bilingual: English and Spanish (es-UY)
- Docker Compose one-command setup

## Quick Start

```bash
git clone https://github.com/avitretiak/parlante-xion.git
cd parlante-xion
cp .env.example .env   # fill in required values
docker compose up -d
```

See [docs/SETUP.md](docs/SETUP.md) for the full self-hosting guide.

## Docs

| Document                                       | Content                          |
| ---------------------------------------------- | -------------------------------- |
| [docs/SETUP.md](docs/SETUP.md)                 | Self-hosting step-by-step        |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Every config key explained       |
| [docs/COMMANDS.md](docs/COMMANDS.md)           | Full command reference           |
| [ARCHITECTURE.md](ARCHITECTURE.md)             | System design and audio pipeline |
| [CHANGELOG.md](CHANGELOG.md)                   | Release history                  |
| [CONTRIBUTING.md](CONTRIBUTING.md)             | Development guide                |

## Stack

- [Bun](https://bun.sh/) runtime
- [Seyfert](https://seyfert.dev/) Discord framework
- [Kazagumo](https://github.com/WuncleCode/kazagumo) → [Shoukaku](https://github.com/Deivu/Shoukaku) → [NodeLink](https://github.com/PerformanC/NodeLink)
- [Drizzle ORM](https://orm.drizzle.team/) + Bun SQLite
- English / Spanish (es-UY)

## Environment Variables

### Required

| Variable                | Description                  |
| ----------------------- | ---------------------------- |
| `DISCORD_TOKEN`         | Discord bot token            |
| `NODELINK_PASSWORD`     | NodeLink server password     |
| `SPOTIFY_CLIENT_ID`     | Spotify app client ID        |
| `SPOTIFY_CLIENT_SECRET` | Spotify app client secret    |
| `YOUTUBE_CIPHER_TOKEN`  | YouTube cipher service token |

### Optional

| Variable            | Default                                                                  | Description                                        |
| ------------------- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| `NODELINK_URL`      | `http://nodelink:3000` (Compose) / `localhost:2333` (bare `bun run dev`) | NodeLink URL                                       |
| `DATA_DIR`          | `/data`                                                                  | Data directory (DB, etc)                           |
| `DATABASE_URL`      | `file:/data/db.sqlite`                                                   | SQLite URL (defaults to `DATA_DIR/db.sqlite`)      |
| `LANGUAGE`          | `es-UY`                                                                  | `en` or `es-UY`                                    |
| `BOT_STATUS`        | `online`                                                                 | `online` / `idle` / `dnd` / `invisible`            |
| `BOT_ACTIVITY_TYPE` | `LISTENING`                                                              | `PLAYING` / `STREAMING` / `LISTENING` / `WATCHING` |
| `BOT_ACTIVITY`      | `🎵 Pinchando unos temaikenes`                                           | Activity text                                      |
| `BOT_ACTIVITY_URL`  | _(none)_                                                                 | Activity URL (`STREAMING` only)                    |
| `LOG_LEVEL`         | `info`                                                                   | `debug` in development                             |
| `PRETTY_LOGS`       | `true`                                                                   | Pretty console formatter                           |

## Commands

| Command              | Description                    |
| -------------------- | ------------------------------ |
| `/play <query>`      | Play a track or add to queue   |
| `/tts <text>`        | Overlay TTS on current track   |
| `/pause`             | Pause playback                 |
| `/resume`            | Resume playback                |
| `/stop`              | Stop and clear queue           |
| `/replay`            | Restart current track          |
| `/seek <time>`       | Seek to position               |
| `/fseek <seconds>`   | Seek forward/backward          |
| `/queue`             | Show queue                     |
| `/skip`              | Skip current track             |
| `/next`              | Skip to next track             |
| `/unskip`            | Play previous track            |
| `/shuffle`           | Shuffle queue                  |
| `/remove <position>` | Remove track from queue        |
| `/move <from> <to>`  | Move track in queue            |
| `/clear`             | Clear queue                    |
| `/loop`              | Toggle track loop              |
| `/loop-queue`        | Toggle queue loop              |
| `/volume <level>`    | Set volume (0-100)             |
| `/now-playing`       | Show current track             |
| `/config`            | Configure bot settings         |
| `/cleanup`           | Delete bot messages in channel |
| `/disconnect`        | Disconnect from voice          |
| `/favorites`         | Manage favorite queries        |

See [`docs/COMMANDS.md`](docs/COMMANDS.md) for detailed command reference with options, flows, and permissions.

## Development

```bash
bun install
bun run dev          # start bot (NodeLink must be running)
bun run typecheck    # type check
bun test             # run tests
bun run lint         # lint (oxlint)
bun run format       # format (oxfmt)
```

## License

MIT
