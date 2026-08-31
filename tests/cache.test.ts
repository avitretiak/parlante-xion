import { describe, expect, setSystemTime, test } from 'bun:test';
import { BoundedTtlCache } from '../src/utils/general/cache';

describe('BoundedTtlCache', () => {
  test('evicts the oldest entry when at capacity', () => {
    const cache = new BoundedTtlCache<string, number>(3, 60_000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4);

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
    expect(cache.size).toBe(3);
  });

  test('refreshing an existing key does not count as a new entry', () => {
    const cache = new BoundedTtlCache<string, number>(2, 60_000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10); // refresh: no eviction, still at capacity

    expect(cache.size).toBe(2);
    expect(cache.get('a')).toBe(10);
    expect(cache.get('b')).toBe(2);
  });

  test('expired entries are dropped on read and do not block insertion', () => {
    setSystemTime(new Date(1_700_000_000_000));
    const cache = new BoundedTtlCache<string, number>(1, 1_000);
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);

    setSystemTime(new Date(1_700_000_001_000));
    expect(cache.get('a')).toBeUndefined();
    cache.set('b', 2);
    expect(cache.get('b')).toBe(2);

    setSystemTime();
  });

  test('never exceeds the configured capacity', () => {
    const cache = new BoundedTtlCache<string, number>(5, 60_000);
    for (let index = 0; index < 50; index += 1) {
      cache.set(`key-${index}`, index);
    }
    expect(cache.size).toBe(5);
    expect(cache.get('key-45')).toBe(45);
    expect(cache.get('key-0')).toBeUndefined();
  });
});
