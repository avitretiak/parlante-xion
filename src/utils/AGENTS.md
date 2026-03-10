# Utils — parlante-xion

Pure utilities. 14 files across 6 subdirs. No state, no side effects (except logger).

## Structure

```
utils/
├── system/       # Logger, command queue, startup banner
├── player/       # Now-playing embed builder, progress bar
├── constants/    # Global constants, i18n message keys
├── config/       # DB URL builder, guild settings cache
├── error/        # Error class definitions (classes only, no helpers)
└── general/      # Shuffle, string, time formatting, URL cleaning
```

## Where to Look

| Task | File |
|------|------|
| Add logging | `system/logger.ts` |
| Command serialization | `system/command-queue.ts` |
| Now-playing embeds | `player/build-now-playing-embed.ts` |
| Progress bars | `player/get-progress-bar.ts` |
| User-facing text | `constants/messages.ts` — keys only, actual text in `src/languages/` |
| Global constants | `constants/constants.ts` |
| Guild settings | `config/get-guild-settings.ts` |
| Error classes | `error/errors.ts` |
| Time formatting | `general/time.ts` |
