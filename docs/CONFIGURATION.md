# Configuration Reference

Every configuration variable for Parlante Xion and its companion services.

## Bot Environment Variables

Set in `.env` or the compose `environment:` block.

### Required

| Variable            | Description                                   | Example                 |
| ------------------- | --------------------------------------------- | ----------------------- |
| `DISCORD_TOKEN`     | Discord bot token                             | `MTIzNDU2Nzg5...`       |
| `NODELINK_PASSWORD` | Password for NodeLink audio server connection | `super-secret-password` |

### Optional

| Variable                | Default                                                    | Description                                                    |
| ----------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| `NODELINK_URL`          | `http://nodelink:3000` (compose) / `localhost:2333` (bare) | NodeLink WebSocket URL                                         |
| `SPOTIFY_CLIENT_ID`     | _(none)_                                                   | Spotify application client ID                                  |
| `SPOTIFY_CLIENT_SECRET` | _(none)_                                                   | Spotify application client secret                              |
| `YOUTUBE_CIPHER_TOKEN`  | _(none)_                                                   | YouTube cipher service API token                               |
| `DATA_DIR`              | `/data`                                                    | Data directory (SQLite database)                               |
| `DATABASE_URL`          | `file:/data/db.sqlite`                                     | SQLite connection URL                                          |
| `LANGUAGE`              | `es-UY`                                                    | Bot language: `en` or `es-UY`                                  |
| `BOT_STATUS`            | `online`                                                   | Discord status: `online`, `idle`, `dnd`, `invisible`           |
| `BOT_ACTIVITY_TYPE`     | `LISTENING`                                                | Activity type: `PLAYING`, `STREAMING`, `LISTENING`, `WATCHING` |
| `BOT_ACTIVITY`          | `🎵 Pinchando unos temaikenes`                             | Activity status text                                           |
| `BOT_ACTIVITY_URL`      | _(none)_                                                   | Stream URL (required for `STREAMING` activity)                 |
| `LOG_LEVEL`             | `info`                                                     | LogTape log level: `debug`, `info`, `warn`, `error`            |
| `PRETTY_LOGS`           | `true`                                                     | Enable pretty console log formatting                           |

## NodeLink Configuration

NodeLink is configured via `NODELINK_*` environment variables. These are passed to the `nodelink` container in the compose file.

### Server

| Variable                   | Default   | Description           |
| -------------------------- | --------- | --------------------- |
| `NODELINK_SERVER_PASSWORD` | _(none)_  | Server password       |
| `NODELINK_SERVER_PORT`     | `3000`    | WebSocket server port |
| `NODELINK_SERVER_ADDRESS`  | `0.0.0.0` | Bind address          |

### Spotify Source

| Variable                                | Default  | Description           |
| --------------------------------------- | -------- | --------------------- |
| `NODELINK_SOURCES_SPOTIFY_CLIENTID`     | _(none)_ | Spotify client ID     |
| `NODELINK_SOURCES_SPOTIFY_CLIENTSECRET` | _(none)_ | Spotify client secret |

Spotify is disabled if both are empty.

### YouTube Source

| Variable                                | Default  | Description                |
| --------------------------------------- | -------- | -------------------------- |
| `NODELINK_SOURCES_YOUTUBE_CIPHER_URL`   | _(none)_ | YouTube cipher service URL |
| `NODELINK_SOURCES_YOUTUBE_CIPHER_TOKEN` | _(none)_ | Cipher service auth token  |

### TTS / Audio Ducking

Audio ducking (lowering music volume during TTS) is configured via NodeLink environment variables:

| Variable                            | Default | Description                   |
| ----------------------------------- | ------- | ----------------------------- |
| `NODELINK_MIXER_DUCKING_ENABLED`    | `false` | Enable audio ducking          |
| `NODELINK_MIXER_DUCKING_REDUCTION`  | `-15`   | Volume reduction in dB        |
| `NODELINK_MIXER_DUCKING_ATTACK_MS`  | `200`   | Ducking transition time (ms)  |
| `NODELINK_MIXER_DUCKING_RELEASE_MS` | `500`   | Recovery transition time (ms) |

## Docker Compose

### Development (`docker-compose.yml`)

Builds the bot locally. Uses named volumes for persistence. Good for development and testing.

```bash
docker compose -f docker-compose.yml up -d
```

### Production (`docker-compose.prod.yml`)

Pulls pre-built images from `ghcr.io/avitretiak/parlante-xion`. Uses named volumes for persistence.

```bash
docker compose -f docker-compose.prod.yml up -d
```

Key differences:

- `parlante-xion` pulls image instead of building
- Fewer exposed env vars (only `DISCORD_TOKEN`, `NODELINK_PASSWORD`, `DATA_DIR`, `NODELINK_URL`)
  Data is stored in the named volumes `parlante-xion-data` (bot) and `nodelink-data` (NodeLink).

### Persistence

| Service         | Dev Volume      | Prod Volume          |
| --------------- | --------------- | -------------------- |
| `parlante-xion` | `parlante-xion` | `parlante-xion-data` |
| `nodelink`      | `nodelink-data` | `nodelink-data`      |

### Healthchecks

Both compose files include health checks:

- **NodeLink**: HTTP GET `/version` on port 3000 every 30s
- **Parlante Xion**: process check (`pgrep`) every 30s
- Dockerfile includes the same pgrep healthcheck for standalone use

## Database

SQLite database stored at `DATA_DIR/db.sqlite` (default: `/data/db.sqlite`). Override with `DATABASE_URL`.

Tables:

- `setting` — per-guild configuration (volume, playlist limit, auto-disconnect)
- `favorite_query` — saved search queries per guild

Back up the data directory to preserve settings and favorites.

## Guild Settings

Configurable per-server via `/config` commands:

| Setting                  | Default | Range | Description                                          |
| ------------------------ | ------- | ----- | ---------------------------------------------------- |
| Playlist Limit           | 50      | 1+    | Max tracks loaded from a single playlist             |
| Wait After Queue Empties | 30      | 0+    | Seconds before auto-disconnect (0=disable)           |
| Leave If No Listeners    | true    | bool  | Auto-disconnect when voice channel empties           |
| Default Volume           | 100     | 0-100 | Volume when player is created                        |
| Default Queue Page Size  | 10      | 1-30  | Tracks per page in `/queue`                          |
| Report Channel           | —       | —     | Channel where now-playing/status messages are pinned |
