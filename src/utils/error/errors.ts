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
