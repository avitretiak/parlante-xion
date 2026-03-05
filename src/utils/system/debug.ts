import createDebug from 'debug';
import messages from '../constants/messages';

const baseDebug = createDebug('parlante-xion');

/**
 * Checks if debug logging is enabled.
 * Uses Bun's native environment variable access and the debug library's built-in checks.
 */
const isDebugEnabled = (): boolean => {
  const debugEnv = process.env.DEBUG;
  if (!debugEnv) {
    return false;
  }

  // Check for simple boolean values
  const normalized = debugEnv.toLowerCase().trim();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
    return true;
  }

  // Check if the namespace pattern matches our debug namespace
  // Support wildcards: *, parlante-xion:*, or any pattern that includes our namespace
  if (
    debugEnv.includes('parlante-xion') ||
    debugEnv === '*' ||
    debugEnv.startsWith('*') ||
    debugEnv.endsWith(':*')
  ) {
    return true;
  }

  // Use debug library's native check (this respects the DEBUG env var format)
  // The debug library will check if 'parlante-xion' matches the pattern
  return baseDebug.enabled;
};

/**
 * Conditional debug logger that respects the DEBUG environment variable.
 * Only logs when DEBUG is enabled, preventing log noise in production.
 */
const debugLog = (message: string, ...args: unknown[]): void => {
  if (!isDebugEnabled()) {
    return;
  }

  // Use Bun's native JSON.stringify for better performance
  if (
    args.length === 1 &&
    typeof args[0] === 'object' &&
    args[0] !== null &&
    !Array.isArray(args[0])
  ) {
    baseDebug('%s %O', message, args[0]);
  } else if (args.length > 0) {
    baseDebug(message, ...args);
  } else {
    baseDebug(message);
  }
};

type LogLevel = 'log' | 'error' | 'warn' | 'info';

const formatMessage = (level: LogLevel, messageKey?: string, ...args: unknown[]): string => {
  const timestamp = new Date().toISOString();
  const levelEmoji = {
    log: '📝',
    error: '❌',
    warn: '⚠️',
    info: 'ℹ️',
  }[level];

  const levelColor = {
    log: '\x1b[36m',
    error: '\x1b[31m',
    warn: '\x1b[33m',
    info: '\x1b[34m',
  }[level];

  const resetColor = '\x1b[0m';
  const prefix = `${levelEmoji} ${levelColor}[${level.toUpperCase()}]${resetColor} [${timestamp}]`;

  if (messageKey && messages.debug[messageKey as keyof typeof messages.debug]) {
    const localizedMessage = messages.debug[messageKey as keyof typeof messages.debug];
    if (args.length > 0) {
      return `${prefix} ${localizedMessage} ${args
        .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
        .join(' ')}`;
    }
    return `${prefix} ${localizedMessage}`;
  }

  const message = messageKey || args[0];
  const restArgs = messageKey ? args : args.slice(1);
  const formattedMessage =
    typeof message === 'object' ? JSON.stringify(message, null, 2) : String(message);

  if (restArgs.length > 0) {
    return `${prefix} ${formattedMessage} ${restArgs
      .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
      .join(' ')}`;
  }

  return `${prefix} ${formattedMessage}`;
};

const createLogger = (level: LogLevel) => {
  return (messageKey?: string, ...args: unknown[]): void => {
    if (level !== 'error' && level !== 'warn' && !isDebugEnabled()) {
      return;
    }

    const formatted = formatMessage(level, messageKey, ...args);

    switch (level) {
      case 'error':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'info':
        console.info(formatted);
        break;
      default:
        console.log(formatted);
    }
  };
};

export const log = createLogger('log');
export const error = createLogger('error');
export const warn = createLogger('warn');
export const info = createLogger('info');

// Export debug as both named and default export for compatibility
export const debug = debugLog;
export default debugLog;

// Export isDebugEnabled for checking debug status
export { isDebugEnabled };
