import {
  configureSync,
  getLogger,
  getConsoleSink,
  type LogLevel,
  type LogRecord,
  type ConsoleFormatter,
  defaultConsoleFormatter,
  type TextFormatter,
} from '@logtape/logtape';
import { getPrettyFormatter } from '@logtape/pretty';

// Configuration
const isDevelopment = process.env.NODE_ENV !== 'production';
const logLevel = (process.env.LOG_LEVEL?.toLowerCase() ||
  (isDevelopment ? 'debug' : 'info')) as LogLevel;
const usePrettyPrint = process.env.PRETTY_LOGS !== 'false';
const consoleFormatter: ConsoleFormatter | TextFormatter = usePrettyPrint
  ? getPrettyFormatter({
      messageStyle: null,
      messageColor: 'white',
      timestamp: 'date-time',
      categoryWidth: 0,
      categoryTruncate: false,
      timestampStyle: ['dim', 'italic'],
      level: 'ABBR',
      wordWrap: false,
    })
  : defaultConsoleFormatter;

// Initialize LogTape
configureSync({
  sinks: {
    console: getConsoleSink({ formatter: consoleFormatter }),
  },
  loggers: [
    { category: [], sinks: ['console'], lowestLevel: logLevel },
    {
      category: ['logtape', 'meta'],
      sinks: ['console'],
      lowestLevel: 'warning',
    },
  ],
});

const logger = getLogger([]);

// Message helpers
const getMessage = (key?: string, ...args: unknown[]): string => key || String(args[0] || '');

const cleanMessage = (message: string): string => message.replace(/\[bun\] Warning: /g, '');

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const serializeUnknown = (value: unknown): Record<string, unknown> => {
  if (value instanceof Error) {
    const cause = value.cause;
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(cause === undefined ? {} : { cause }),
    };
  }

  if (isPlainObject(value)) {
    return value;
  }

  return { value };
};

// Create a LogRecord for warnings
const createWarningRecord = (message: string): LogRecord => ({
  category: [],
  level: 'warning',
  message: [message],
  rawMessage: message,
  timestamp: Date.now(),
  properties: {},
});

// Format and output a warning through LogTape (for intercepted console.warn calls)
const formatAndOutputWarning = (message: string): void => {
  const cleaned = cleanMessage(message);
  if (!cleaned.trim()) return;

  const formatted = consoleFormatter(createWarningRecord(cleaned));
  if (typeof formatted === 'string') {
    originalConsoleWarn(formatted.replace(/\r?\n$/, ''));
  } else {
    originalConsoleWarn(...(formatted as readonly unknown[]));
  }
};

// Check if call originates from LogTape
const isFromLogTape = (): boolean => {
  const stack = new Error().stack;
  return stack ? stack.includes('@logtape') || stack.includes('logtape') : false;
};

// Store original console methods before interception
const originalConsoleWarn = console.warn;
const originalEmitWarning = process.emitWarning;

// Intercept console.warn to route through LogTape formatting
console.warn = (...args: unknown[]): void => {
  if (isFromLogTape()) {
    originalConsoleWarn.apply(console, args);
    return;
  }
  formatAndOutputWarning(args.map(String).join(' '));
};

// Intercept process.emitWarning to route through LogTape
process.emitWarning = ((warning: string | Error, ...args: unknown[]): void => {
  if (isFromLogTape()) {
    (originalEmitWarning as (warning: string | Error, ...args: unknown[]) => void).call(
      process,
      warning,
      ...args,
    );
    return;
  }
  const message = typeof warning === 'string' ? warning : warning.message;
  formatAndOutputWarning(message);
  (originalEmitWarning as (warning: string | Error, ...args: unknown[]) => void).call(
    process,
    warning,
    ...args,
  );
}) as typeof process.emitWarning;

// Public API
export const debug = (message: string, ...args: unknown[]): void => {
  if (
    args.length === 1 &&
    typeof args[0] === 'object' &&
    args[0] !== null &&
    !Array.isArray(args[0])
  ) {
    logger.debug(message, args[0] as Record<string, unknown>);
  } else if (args.length > 0) {
    logger.debug(message, { args });
  } else {
    logger.debug(message);
  }
};

export const info = (key?: string, ...args: unknown[]): void => {
  logger.info(getMessage(key, ...args));
};

export const warn = (key?: string, ...args: unknown[]): void => {
  if (args.length === 1 && isPlainObject(args[0])) {
    logger.warn(getMessage(key), serializeUnknown(args[0]));
    return;
  }

  logger.warn(getMessage(key, ...args));
};

export const error = (key?: string, ...args: unknown[]): void => {
  if (args.length === 1) {
    const [value] = args;
    if (value instanceof Error) {
      logger.error(key || value.message, serializeUnknown(value));
      return;
    }

    if (isPlainObject(value)) {
      logger.error(getMessage(key), serializeUnknown(value));
      return;
    }
  }

  logger.error(getMessage(key, ...args));
};
