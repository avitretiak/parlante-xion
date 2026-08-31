# Commands — parlante-xion

Slash command handlers. 24 files across 6 domains. Full command reference with options and flows: [docs/COMMANDS.md](../../docs/COMMANDS.md).

## Structure

```
commands/
├── playback/   # Play, pause, resume, stop, seek, TTS (8 files) — See playback/AGENTS.md
├── queue/      # Queue display, skip, shuffle, remove, move (8 files) — See queue/AGENTS.md
├── config/     # Bot config, cleanup, disconnect (3 files)
├── controls/   # Volume, now-playing (2 files)
├── loop/       # Loop track/queue (2 files)
└── favorites/  # Favorite queries CRUD with autocomplete (1 file)
```

## Where to Look

| Task                 | File                            | Notes                                        |
| -------------------- | ------------------------------- | -------------------------------------------- |
| Add playback command | `playback/*.ts`                 | See [playback/AGENTS.md](playback/AGENTS.md) |
| Add queue command    | `queue/*.ts`                    | See [queue/AGENTS.md](queue/AGENTS.md)       |
| Config command       | `config/config.ts`              | SubCommand pattern, guild settings           |
| Volume control       | `controls/volume.ts`            | Integer option, 0-100 range                  |
| Loop modes           | `loop/loop.ts`, `loop-queue.ts` | Toggle track/queue loop                      |
| Favorites            | `favorites/favorites.ts`        | Largest file, SubCommand pattern             |

## Command Boilerplate

```typescript
@Declare({
  name: 'command-name',
  description: messages.commands.commandName.description,
})
@Middlewares(['voiceGuard', 'commandQueue']) // playback/queue only
export default class CommandName extends Command {
  async run(ctx: CommandContext) {
    await ctx.deferReply(); // Or deferReply(true) for ephemeral
    // Validation → service call → response
  }
}
```

Options: `createStringOption`, `createIntegerOption`, `createBooleanOption` from Seyfert. Commands are thin handlers — complex logic goes to `src/services/`.
