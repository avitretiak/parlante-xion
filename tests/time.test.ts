import { describe, expect, test } from 'bun:test';
import { formatMs, parseTimeToMs } from '../src/utils/general/time';

describe('parseTimeToMs', () => {
  test('plain seconds with optional decimals', () => {
    expect(parseTimeToMs('90')).toBe(90_000);
    expect(parseTimeToMs('5.5')).toBe(5_500);
    expect(parseTimeToMs('0')).toBe(0);
  });

  test('unit expression syntax', () => {
    expect(parseTimeToMs('1h2m3s')).toBe(3_723_000);
    expect(parseTimeToMs('1m30s')).toBe(90_000);
    expect(parseTimeToMs('30s')).toBe(30_000);
    expect(parseTimeToMs('1h')).toBe(3_600_000);
    expect(parseTimeToMs('1m')).toBe(60_000);
    expect(parseTimeToMs('1.5s')).toBe(1_500);
  });

  test('colon formats MM:SS and HH:MM:SS', () => {
    expect(parseTimeToMs('1:30')).toBe(90_000);
    expect(parseTimeToMs('1:02:03')).toBe(3_723_000);
    expect(parseTimeToMs('90:00')).toBe(5_400_000);
    expect(parseTimeToMs('12:34')).toBe(754_000);
  });

  test('rejects colon seconds >= 60 and three-part minutes >= 60', () => {
    // MM:SS seconds boundary: 59 valid, 60 rejected.
    expect(parseTimeToMs('1:59')).toBe(119_000);
    expect(parseTimeToMs('1:60')).toBeNull();
    expect(parseTimeToMs('0:59')).toBe(59_000);
    expect(parseTimeToMs('0:60')).toBeNull();
    expect(parseTimeToMs('59:59')).toBe(3_599_000);
    expect(parseTimeToMs('59:60')).toBeNull();
    // Two-part MM may exceed 59; it is total minutes.
    expect(parseTimeToMs('60:00')).toBe(3_600_000);
    expect(parseTimeToMs('90:59')).toBe(5_459_000);
    // HH:MM:SS minutes and seconds boundaries.
    expect(parseTimeToMs('1:59:59')).toBe(7_199_000);
    expect(parseTimeToMs('1:60:00')).toBeNull();
    expect(parseTimeToMs('1:00:59')).toBe(3_659_000);
    expect(parseTimeToMs('1:00:60')).toBeNull();
    // Bounds apply to signed forms too.
    expect(parseTimeToMs('-1:60')).toBeNull();
    expect(parseTimeToMs('+0:60')).toBeNull();
  });

  test('signed values for relative seeks', () => {
    expect(parseTimeToMs('-30s')).toBe(-30_000);
    expect(parseTimeToMs('+1m30s')).toBe(90_000);
    expect(parseTimeToMs('-1:30')).toBe(-90_000);
    expect(parseTimeToMs('-5.5')).toBe(-5_500);
  });

  test('rejects empty, whitespace, sign-only, and malformed input', () => {
    expect(parseTimeToMs('')).toBeNull();
    expect(parseTimeToMs('   ')).toBeNull();
    expect(parseTimeToMs('+')).toBeNull();
    expect(parseTimeToMs('-')).toBeNull();
    expect(parseTimeToMs('1h:30')).toBeNull();
    expect(parseTimeToMs('abc')).toBeNull();
    expect(parseTimeToMs('1h 30s')).toBeNull();
    expect(parseTimeToMs('1:2:3:4')).toBeNull();
  });

  test('trims surrounding whitespace', () => {
    expect(parseTimeToMs(' 1m30s ')).toBe(90_000);
  });
});

describe('formatMs', () => {
  test('formats minutes and seconds without hours', () => {
    expect(formatMs(90_000)).toBe('1:30');
    expect(formatMs(5_000)).toBe('0:05');
    expect(formatMs(0)).toBe('0:00');
  });

  test('includes hours once the position reaches an hour', () => {
    expect(formatMs(3_600_000)).toBe('1:00:00');
    expect(formatMs(3_723_000)).toBe('1:02:03');
    expect(formatMs(36_000_000)).toBe('10:00:00');
  });
});
