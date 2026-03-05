import { debug, error as logError } from '../system/logger';
import messages from '../constants/messages';

/**
 * Base class for all custom errors in the application
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly recoverable: boolean;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    options?: {
      recoverable?: boolean;
      context?: Record<string, unknown>;
      cause?: Error;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = this.constructor.name;
    this.code = code;
    this.recoverable = options?.recoverable ?? true;
    this.context = options?.context;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Player-related errors (playback, queue, etc.)
 */
export class PlayerError extends AppError {
  constructor(
    message: string,
    code: string,
    options?: {
      recoverable?: boolean;
      context?: Record<string, unknown>;
      cause?: Error;
    },
  ) {
    super(message, code, options);
    this.name = 'PlayerError';
  }
}

/**
 * Validation errors (invalid input, out of range, etc.)
 */
export class ValidationError extends AppError {
  constructor(
    message: string,
    code: string,
    options?: {
      context?: Record<string, unknown>;
      cause?: Error;
    },
  ) {
    super(message, code, { ...options, recoverable: true });
    this.name = 'ValidationError';
  }
}

/**
 * Configuration errors (missing env vars, invalid config, etc.)
 */
export class ConfigurationError extends AppError {
  constructor(
    message: string,
    code: string,
    options?: {
      context?: Record<string, unknown>;
      cause?: Error;
    },
  ) {
    super(message, code, { ...options, recoverable: false });
    this.name = 'ConfigurationError';
  }
}

/**
 * Service errors (NodeLink, API errors, etc.)
 */
export class ServiceError extends AppError {
  constructor(
    message: string,
    code: string,
    options?: {
      recoverable?: boolean;
      context?: Record<string, unknown>;
      cause?: Error;
    },
  ) {
    super(message, code, options);
    this.name = 'ServiceError';
  }
}

/**
 * Network/connection errors
 */
export class NetworkError extends ServiceError {
  constructor(
    message: string,
    code: string,
    options?: {
      recoverable?: boolean;
      context?: Record<string, unknown>;
      cause?: Error;
    },
  ) {
    super(message, code, { ...options, recoverable: true });
    this.name = 'NetworkError';
  }
}

/**
 * Error recovery strategies
 */

/**
 * Attempts to recover from an error with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    onRetry?: (attempt: number, error: Error) => void;
  },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const initialDelay = options?.initialDelay ?? 1000;
  const maxDelay = options?.maxDelay ?? 10000;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry if error is not recoverable
      if (err instanceof AppError && !err.recoverable) {
        throw err;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(initialDelay * 2 ** attempt, maxDelay);

      if (options?.onRetry) {
        options.onRetry(attempt + 1, lastError);
      } else {
        debug(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms:`, lastError);
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Safely executes an operation and logs errors
 */
export async function safely<T>(
  operation: () => Promise<T>,
  options?: {
    onError?: (error: Error) => void;
    defaultValue?: T;
    logError?: boolean;
  },
): Promise<T | undefined> {
  try {
    return await operation();
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));

    if (options?.logError !== false) {
      logError('operationFailed', error);
    }

    if (options?.onError) {
      options.onError(error);
    }

    return options?.defaultValue;
  }
}

/**
 * Standardized error logging
 */
export function logErrorWithContext(error: Error, context?: Record<string, unknown>): void {
  const errorContext = {
    name: error.name,
    message: error.message,
    ...(error instanceof AppError && {
      code: error.code,
      recoverable: error.recoverable,
      ...error.context,
    }),
    ...context,
  };

  if (error instanceof AppError && !error.recoverable) {
    logError('unrecoverableError', errorContext);
  } else {
    debug(messages.debug.errorOccurred, errorContext);
  }

  // Log stack trace for debugging if available
  if (error.stack && process.env.DEBUG) {
    debug(messages.debug.stackTrace, error.stack);
  }
}
