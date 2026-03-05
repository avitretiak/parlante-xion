import { ValidationError } from '../error/errors';

/**
 * Format seconds as HH:MM:SS or MM:SS
 */
export const prettyTime = (seconds: number): string => {
  const nSeconds = Math.round(seconds % 60);
  let nMinutes = Math.floor(seconds / 60);
  const nHours = Math.floor(nMinutes / 60);

  if (nHours > 0) {
    nMinutes -= nHours * 60;
    return `${String(nHours).padStart(2, '0')}:${String(nMinutes).padStart(2, '0')}:${String(nSeconds).padStart(2, '0')}`;
  }

  return `${String(nMinutes).padStart(2, '0')}:${String(nSeconds).padStart(2, '0')}`;
};

/**
 * Parse time string in format HH:MM:SS or MM:SS to seconds
 */
export const parseTime = (str: string): number =>
  str.split(':').reduce((acc, time) => 60 * acc + Number.parseInt(time, 10), 0);

/**
 * Parse duration strings to seconds.
 * Supports formats like "1h 30m", "1hr 30min", "2h 15m 30s", or plain numbers (assumed seconds).
 */
export const durationStringToSeconds = (str: string): number => {
  // If it's a plain number, assume seconds
  if (/^\d+$/.test(str.trim())) {
    return Number.parseInt(str, 10);
  }

  // Parse duration strings like "1h 30m", "1hr 30min", "2h 15m 30s", etc.
  const durationRegex =
    /(?:(\d+)\s*(?:hours?|hrs?|h))?\s*(?:(\d+)\s*(?:minutes?|mins?|m))?\s*(?:(\d+)\s*(?:seconds?|secs?|s))?/i;
  const match = str.trim().match(durationRegex);

  if (!match) {
    throw new ValidationError(`Invalid duration format: ${str}`, 'INVALID_DURATION_FORMAT');
  }

  const hours = match[1] ? Number.parseInt(match[1], 10) : 0;
  const minutes = match[2] ? Number.parseInt(match[2], 10) : 0;
  const seconds = match[3] ? Number.parseInt(match[3], 10) : 0;

  return hours * 3600 + minutes * 60 + seconds;
};
