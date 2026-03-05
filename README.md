# parlante-xion

Self-hosted Discord music bot. YouTube, Spotify, SoundCloud via NodeLink.

## Stack

- [Bun](https://bun.sh/) runtime
- [Seyfert](https://seyfert.dev/) Discord framework
- [Kazagumo](https://github.com/WuncleCode/kazagumo) → [Shoukaku](https://github.com/Deivu/Shoukaku) → [NodeLink](https://github.com/PerformanC/NodeLink)
- [Drizzle ORM](https://orm.drizzle.team/) + Bun SQLite
- English / Spanish (es-UY)

## Setup

```bash
git clone https://github.com/avitretiak/parlante-xion.git
cd parlante-xion
cp .env.example .env   # fill in required values
docker compose up
```

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

| Variable                   | Default                        | Description                                 |
| -------------------------- | ------------------------------ | ------------------------------------------- |
| `NODELINK_URL`             | `http://nodelink:3000`         | NodeLink URL                                |
| `DATA_DIR`                 | `/data`                        | Data directory (DB, etc)                    |
| `BOT_STATUS`               | `online`                       | `online` / `idle` / `dnd` / `invisible`     |
| `BOT_ACTIVITY_TYPE`        | `LISTENING`                    | `PLAYING` / `LISTENING` / `WATCHING`        |
| `BOT_ACTIVITY`             | `🎵 Pinchando unos temaikenes` | Activity text                               |
| `LANGUAGE`                 | `es-UY`                        | `en` or `es-UY`                             |
| `REGISTER_COMMANDS_ON_BOT` | `false`                        | Register slash commands globally on startup |

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
| `/next <position>`   | Skip to position in queue      |
| `/unskip`            | Play previous track            |
| `/shuffle`           | Shuffle queue                  |
| `/remove <position>` | Remove track from queue        |
| `/move <from> <to>`  | Move track in queue            |
| `/clear`             | Clear queue                    |
| `/loop`              | Toggle track loop              |
| `/loop-queue`        | Toggle queue loop              |
| `/volume <level>`    | Set volume (0–100)             |
| `/now-playing`       | Show current track             |
| `/player-controls`   | Interactive player buttons     |
| `/config`            | Configure bot settings         |
| `/cleanup`           | Delete bot messages in channel |
| `/disconnect`        | Disconnect from voice          |
| `/favorites`         | Manage favorite queries        |

## Development

```bash
bun install
bun run dev          # start bot (NodeLink must be running)
bun run typecheck    # type check
bun test             # run tests
bun run lint         # lint
bun run format       # format
```

## License

MIT
