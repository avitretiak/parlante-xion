# Self-Hosting Guide

Step-by-step guide to self-host Parlante Xion on your own server.

## Hardware Requirements

| Resource | Minimum | Recommended |
| -------- | ------- | ----------- |
| CPU      | 2 cores | 4 cores     |
| RAM      | 512 MB  | 1 GB        |
| Disk     | 1 GB    | 5 GB        |
| Network  | 10 Mbps | 50 Mbps     |

The stack runs three containers: the bot, NodeLink (audio server), and youtube-cipher (YouTube decryption). NodeLink is the heaviest — it streams and transcodes audio in real time.

## Prerequisites

- A Linux server (or any Docker host) with **Docker Compose** installed
- A **Discord bot token** (see below)
- A **Spotify app** (see below) — optional but enables Spotify playback
- A domain or public IP is **not** required; the bot connects outbound to Discord and streaming services

## 1. Get a Discord Bot Token

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**, name it (e.g. "Parlante Xion")
3. Go to **Bot** tab → **Add Bot**
4. No privileged Gateway intents are required — the bot only uses non-privileged intents (`Guilds`, `GuildVoiceStates`, `GuildMessages`)
5. Copy the token (click **Reset Token** if unavailable)
6. Go to **OAuth2** → **URL Generator**
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Embed Links`, `Connect`, `Speak`, `Use Voice Activity`, `Use External Apps` (optional)
   - A minimal permissions integer: `274877974592`
7. Open the generated URL and invite the bot to your server

## 2. Get Spotify Credentials (Optional)

If you want Spotify track/playlist support:

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click **Create App**, fill in name and description
3. Copy **Client ID** and **Client Secret**
4. No redirect URI needed — NodeLink uses client credentials flow

Skip this step and leave `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` empty if you don't need Spotify.

## 3. Clone and Configure

```bash
git clone https://github.com/avitretiak/parlante-xion.git
cd parlante-xion
cp .env.example .env
```

Edit `.env` and fill in:

```ini
# Required
DISCORD_TOKEN=your_discord_bot_token
NODELINK_PASSWORD=choose_a_strong_password

# Optional (for Spotify)
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
```

All other variables have safe defaults. See [CONFIGURATION.md](CONFIGURATION.md) for the full reference.

## 4. Start the Stack

```bash
docker compose -f docker-compose.yml up -d
```

This starts three containers:

- `nodelink` — Lavalink-compatible audio server (port 3000, internal only)
- `youtube-cipher` — YouTube decryption helper (port 8081, internal only)
- `parlante-xion` — the Discord bot

First startup takes a minute — NodeLink downloads YouTube cipher keys, and the bot registers slash commands globally.

Check logs:

```bash
docker compose -f docker-compose.yml logs -f parlante-xion
```

You should see:

```
✨ INF  Sincronizando esquema de base de datos...
✨ INF  Bot listo como Parlante Xion, sirviendo N servidores
✨ INF  Comandos slash registrados.
```

## 5. Verify

In Discord, type `/play never gonna give you up`. The bot should join your voice channel and start playing.

Volume control: `/volume 50`

Full command list: see [COMMANDS.md](COMMANDS.md).

## Production Deployment

For production, use `docker-compose.prod.yml` which pulls pre-built images from GHCR instead of building locally:

```bash
cp .env.example .env   # edit with real values
docker compose -f docker-compose.prod.yml up -d
```

The prod compose does not include optional bot customization env vars (language, activity, etc.) — add them to the `parlante-xion` service's `environment:` block if needed.

### Version Pinning

Pin to a specific version instead of tracking `latest`:

```yaml
parlante-xion:
  image: ghcr.io/avitretiak/parlante-xion:v1.0.2
  pull_policy: never
```

To update, change the tag and run `docker compose -f docker-compose.prod.yml up -d`.

## Firewall

No inbound ports needed. The bot makes outbound connections to:

- Discord Gateway and REST API (TCP 443)
- Streaming services (YouTube, Spotify, SoundCloud) via NodeLink

## Troubleshooting

### Bot doesn't join voice

- Check the bot has **Connect** and **Speak** permissions in the voice channel
- Verify `DISCORD_TOKEN` is correct in `.env`
- Check logs: `docker compose -f docker-compose.yml logs parlante-xion`

### NodeLink errors

- Verify `NODELINK_PASSWORD` matches in both `.env` and NodeLink's environment
- Check NodeLink logs: `docker compose -f docker-compose.yml logs nodelink`
- If the error is about YouTube cipher, ensure `youtube-cipher` container is healthy: `docker compose -f docker-compose.yml ps`

### No sound / audio cuts out

- Check server resources — NodeLink needs CPU for transcoding
- Reduce bitrate if needed via NodeLink config (see [CONFIGURATION.md](CONFIGURATION.md))
- Ensure the bot user in Discord has **Use Voice Activity** permission
