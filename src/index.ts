import { mkdir } from 'node:fs/promises';
import { Client, Logger } from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types/payloads/channel';
import { LogLevels } from 'seyfert/lib/common/it/logger';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { DATA_DIR } from '#parlante/config';
import { db } from '#parlante/db';
import { initKazagumo } from '#parlante/structures/kazagumo';
import logBanner from '#parlante/utils/system/log-banner';
import { debug, info, warn, error } from '#parlante/utils/system/logger';
import { voiceGuard } from '#parlante/middlewares/voice-guard';
import { commandQueue } from '#parlante/middlewares/command-queue';
import messages from '#parlante/utils/constants/messages';

// Route Seyfert's built-in Logger through LogTape
Logger.customize((self, level, args) => {
  const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  const prefix = self.options.name ? `${self.options.name} ` : '';
  const fullMsg = `${prefix}${msg}`;
  switch (level) {
    case LogLevels.Debug:
      debug(fullMsg);
      break;
    case LogLevels.Info:
      info(fullMsg);
      break;
    case LogLevels.Warn:
      warn(fullMsg);
      break;
    case LogLevels.Error:
      error(fullMsg);
      break;
    case LogLevels.Fatal:
      error(fullMsg);
      break;
  }
  return []; // Return empty array to suppress Seyfert's own output
});

const client = new Client({
  allowedMentions: {
    replied_user: false,
    parse: ['roles', 'users'],
  },
  commands: {
    reply: () => true,
    defaults: {
      onRunError: (ctx, err) => {
        const message = err instanceof Error ? err.message : String(err ?? 'Unknown error');
        ctx.client.logger.error(`[${ctx.author.id}] RunError: ${message}`);
        ctx.write({ content: messages.error.commandFailed }).catch(() => {});
      },
      onPermissionsFail: (ctx, permissions) => {
        return ctx.write({
          content: messages.error.missingPermissions(permissions.map(String)),
        });
      },
      onBotPermissionsFail: (ctx, permissions) => {
        return ctx.write({
          content: messages.error.botMissingPermissions(permissions.map(String)),
        });
      },
      onOptionsError: (ctx, metadata) => {
        const message =
          metadata && typeof metadata === 'object' && 'message' in metadata
            ? (metadata as { message?: string }).message
            : undefined;
        return ctx.write({
          content: messages.error.optionsError(message ?? 'Invalid option'),
        });
      },
      onMiddlewaresError: async (ctx, err) => {
        const content = typeof err === 'string' ? err : String(err ?? 'Unknown error');
        try {
          await ctx.write({ content, flags: MessageFlags.Ephemeral });
        } catch {
          try {
            await ctx.editOrReply({ content, flags: MessageFlags.Ephemeral });
          } catch {
            // noop
          }
        }
      },
    },
  },
});

client.events.onFail = (event, err) => {
  client.logger.error(err, `[Event] ${event}`);
};

process.on('unhandledRejection', (reason) => {
  if (reason instanceof Error) {
    error('Unhandled promise rejection (caught to prevent crash)', reason);
    return;
  }

  error('Unhandled promise rejection (caught to prevent crash)', {
    reasonType: typeof reason,
    reason,
  });
});

// ─── Core lifecycle functions ──────────────────────────────────────────────

const runMigrations = () => {
  info(messages.spinner.syncingDatabaseSchema);
  try {
    migrate(db, { migrationsFolder: './drizzle' });
    info(messages.spinner.databaseSchemaSynced);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    error(`${messages.spinner.databaseSchemaSyncError} ${errMsg}`);
    process.exit(1);
  }
};

const startBot = async () => {
  // 1. Create data directory
  info(messages.debug.creatingDataDir);
  await mkdir(DATA_DIR, { recursive: true });

  // 2. Initialize Kazagumo (MUST be before client.start())
  info(messages.debug.initializingMusicSystem);
  initKazagumo(client);

  // 3. Configure services
  client.setServices({
    middlewares: {
      voiceGuard,
      commandQueue,
    },
    cache: {
      disabledCache: {
        bans: true,
        emojis: true,
        stickers: true,
        roles: true,
        overwrites: true,
        presences: true,
        stageInstances: true,
      },
    },
  });

  // 4. Start bot
  info(messages.spinner.connectingToDiscord);
  await client.start();
};

// ─── CLI entry points ──────────────────────────────────────────────────────

const runStart = async () => {
  await logBanner();
  await startBot();
};

const runDev = runStart;

const runMigrateAndStart = async () => {
  await logBanner();
  await runMigrations();
  await startBot();
};

const runMigrateOnly = async () => {
  await runMigrations();
};

// ─── CLI dispatch ──────────────────────────────────────────────────────────

const cliCommands: Record<string, { description: string; handler: () => Promise<void> }> = {
  start: {
    description: messages.cli.start.description,
    handler: runStart,
  },
  migrate: {
    description: messages.cli.migrate.description,
    handler: runMigrateOnly,
  },
  'migrate-and-start': {
    description: messages.cli.migrateAndStart.description,
    handler: runMigrateAndStart,
  },
  dev: {
    description: messages.cli.dev.description,
    handler: runDev,
  },
};

const showHelp = () => {
  info(messages.cli.help.usage);
  info(messages.cli.help.commands);
  for (const [name, cmd] of Object.entries(cliCommands)) {
    info(`  ${name.padEnd(20)} ${cmd.description}`);
  }
};

const arg = process.argv[2] ?? 'start';

if (arg === '--help' || arg === '-h') {
  showHelp();
  process.exit(0);
}

const chosen = cliCommands[arg];
if (!chosen) {
  error(`${messages.debug.unknownCommand}: ${arg}`);
  info(messages.debug.runWithHelpToSeeCommands);
  process.exit(1);
}

chosen.handler().catch((err) => {
  error('Fatal error during startup', err);
  process.exit(1);
});
