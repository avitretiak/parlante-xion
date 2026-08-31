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

const PLAIN_SECONDS = /^[+-]?\d+(\.\d+)?$/;
const UNIT_EXPRESSION = /^[+-]?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s?)?$/i;
const COLON_EXPRESSION = /^([+-]?)(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/;

/**
 * Parse a seek input into milliseconds. Accepted forms:
 * - plain seconds with optional decimals: `90`, `5.5`
 * - unit expression: `1h2m3s`, `1m30s`, `30s`, `1h`
 * - colon form: `MM:SS` (`1:30`) or `HH:MM:SS` (`1:02:03`); seconds must be
 *   below 60, and the minutes component of the three-part form below 60
 * - a leading `+`/`-` sign is allowed; `-30s` means seek 30 seconds backward
 * Returns null for empty, malformed, or sign-only input.
 */
export const parseTimeToMs = (input: string): number | null => {
  const value = input.trim();
  if (value === '') return null;

  if (PLAIN_SECONDS.test(value)) {
    return Math.trunc(parseFloat(value) * 1000);
  }

  const colon = value.match(COLON_EXPRESSION);
  if (colon) {
    const sign = colon[1] === '-' ? -1 : 1;
    const first = parseInt(colon[2]!, 10);
    const second = parseInt(colon[3]!, 10);
    const third = colon[4] === undefined ? undefined : parseInt(colon[4]!, 10);
    // The last component is seconds and must stay below 60 in both forms;
    // in the three-part form the middle component is minutes and must also
    // stay below 60. The two-part form's first component is total minutes
    // and may exceed 59 (`90:00`).
    if (second >= 60) return null;
    if (third !== undefined && third >= 60) return null;
    const seconds = third === undefined ? first * 60 + second : first * 3600 + second * 60 + third;
    return sign * seconds * 1000;
  }

  const units = value.match(UNIT_EXPRESSION);
  if (!units || (!units[1] && !units[2] && !units[3])) return null;

  const sign = value.startsWith('-') ? -1 : 1;
  const hours = parseInt(units[1] ?? '0', 10);
  const minutes = parseInt(units[2] ?? '0', 10);
  const seconds = parseFloat(units[3] ?? '0');
  return sign * Math.trunc((hours * 3600 + minutes * 60 + seconds) * 1000);
};

/**
 * Format milliseconds as `M:SS` or `H:MM:SS` once the position reaches an hour.
 */
export const formatMs = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};
