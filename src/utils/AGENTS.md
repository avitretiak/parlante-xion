# Utils — parlante-xion

Pure utilities. 10 files across 5 subdirs. No state, no side effects (except logger).

## Structure

```
utils/
├── system/       # Logger, startup banner
├── player/       # Now-playing embed builder, progress bar
├── constants/    # i18n message keys
├── config/       # DB URL builder, guild settings cache
└── general/      # String, time formatting, URL cleaning
```

## Where to Look

| Task               | File                                                                 |
| ------------------ | -------------------------------------------------------------------- |
| Add logging        | `system/logger.ts`                                                   |
| Now-playing embeds | `player/build-now-playing-embed.ts`                                  |
| Progress bars      | `player/get-progress-bar.ts`                                         |
| User-facing text   | `constants/messages.ts` — keys only, actual text in `src/languages/` |
| Guild settings     | `config/get-guild-settings.ts`                                       |
| Time formatting    | `general/time.ts`                                                    |
