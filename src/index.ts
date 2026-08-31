import { mkdir } from 'node:fs/promises';
import { Client, Logger } from 'seyfert';
import type { UsingClient } from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types/payloads/channel';
import { LogLevels } from 'seyfert/lib/common/it/logger';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import type { Kazagumo } from 'kazagumo';
import { DATA_DIR } from '#parlante/config';
import { db } from '#parlante/db';
import { initKazagumo } from '#parlante/structures/kazagumo';
import { destroyPlayer } from '#parlante/managers/players';
import logBanner from '#parlante/utils/system/log-banner';
import { debug, info, warn, error, serializeUnknown } from '#parlante/utils/system/logger';
import { voiceGuard } from '#parlante/middlewares/voice-guard';
import { commandQueue } from '#parlante/middlewares/command-queue';
import messages from '#parlante/utils/constants/messages';

// Format Seyfert log arguments: strings pass through, anything else goes
// through the structured serializer so Error details survive stringification
// (plain JSON.stringify(new Error()) is `{}`).
export const formatSeyfertLogArgs = (args: unknown[]): string =>
  args
    .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(serializeUnknown(arg))))
    .join(' ');

// Route Seyfert's built-in Logger through LogTape. Must return `undefined`
// (NOT `[]`): Logger.rawLog does `if (!log) return`, and an empty array is
// truthy, so it would write an empty file entry and print a blank console
// line instead of suppressing Seyfert's own output.
export const seyfertLogAdapter = (self: Logger, level: LogLevels, args: unknown[]): undefined => {
  const prefix = self.options.name ? `${self.options.name} ` : '';
  const fullMsg = `${prefix}${formatSeyfertLogArgs(args)}`;
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
    case LogLevels.Fatal:
      error(fullMsg);
      break;
  }
  return undefined;
};

Logger.customize(seyfertLogAdapter);

export const client = new Client({
  // No mention type is parsed globally: nobody gets pinged. Mentions inside
  // embeds (e.g. the requester) still render as clickable mentions — embed
  // mentions never ping regardless of this policy.
  allowedMentions: {
    replied_user: false,
    parse: [],
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
  error('Unhandled promise rejection (caught to prevent crash)', {
    reasonType: typeof reason,
    reason: serializeUnknown(reason),
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

// ─── Graceful shutdown ─────────────────────────────────────────────────────

// Bounded grace period before a stuck shutdown is force-exited.
const SHUTDOWN_GRACE_MS = 10_000;

let shutdownStarted = false;

// Wait for every active player to be REALLY torn down (leaves the voice
// channel, destroys the player on the node, unregisters it) through the P1
// teardown helper, then tear down the Shoukaku nodes. Seyfert's Client has no
// stop/close API, so gateway teardown is left to process exit.
export const performShutdown = async (kazagumo: Kazagumo | undefined): Promise<void> => {
  if (!kazagumo) return;

  // One stuck/failed player must not block the rest from being destroyed, but
  // real teardown failures must still surface: attempt every player and node,
  // then aggregate rejections so the caller exits non-zero.
  const results = await Promise.allSettled(
    [...kazagumo.players.keys()].map((guildId) => destroyPlayer(kazagumo, guildId)),
  );

  for (const [name] of kazagumo.shoukaku.nodes) {
    kazagumo.shoukaku.removeNode(name, 'Bot shutting down');
  }

  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((failure) => failure.reason),
      `Failed to tear down ${failures.length} player(s)`,
    );
  }
};

// Teardown wrapped in a bounded grace window: force-exit(1) if the teardown
// outlives `graceMs`, otherwise normal exit(0). `exit` is injectable so tests
// can observe the exit path without killing the test process.
export const shutdownWithGrace = (
  kazagumo: Kazagumo | undefined,
  options: { exit?: (code?: number) => never; graceMs?: number } = {},
): Promise<void> => {
  const { exit = process.exit, graceMs = SHUTDOWN_GRACE_MS } = options;
  const forceTimer = setTimeout(() => {
    error(`Graceful shutdown exceeded ${graceMs}ms, forcing exit`);
    exit(1);
  }, graceMs);
  forceTimer.unref?.();

  // Teardown failures surface as a failed exit after every player and node was
  // still attempted; only a clean teardown exits 0.
  return performShutdown(kazagumo)
    .then(() => {
      clearTimeout(forceTimer);
      exit(0);
    })
    .catch((err) => {
      clearTimeout(forceTimer);
      error('Error during shutdown', err);
      exit(1);
    });
};

// Idempotent entry point: repeated signals (SIGTERM then SIGINT, a retried
// SIGTERM, ...) must not start a second teardown sequence.
export const shutdown = (
  kazagumo: Kazagumo | undefined,
  signal: string,
  options: { exit?: (code?: number) => never; graceMs?: number } = {},
): Promise<void> => {
  if (shutdownStarted) return Promise.resolve();
  shutdownStarted = true;
  info(`Received ${signal}, shutting down gracefully`);
  return shutdownWithGrace(kazagumo, options);
};

const installShutdownHandlers = (): void => {
  process.once('SIGTERM', () => {
    void shutdown((client as unknown as UsingClient).kazagumo, 'SIGTERM');
  });
  process.once('SIGINT', () => {
    void shutdown((client as unknown as UsingClient).kazagumo, 'SIGINT');
  });
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

// Only run the CLI (and install real signal handlers) when this file is the
// entry point; importing it from tests must stay side-effect free apart from
// the client/logger setup above.
if (import.meta.main) {
  installShutdownHandlers();

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
}
