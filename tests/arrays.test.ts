import { describe, expect, test } from 'bun:test';
import { shuffle } from '../src/utils/general/arrays';

describe('shuffle', () => {
  test('returns a new array (does not mutate original)', () => {
    const original = [1, 2, 3, 4, 5];
    const originalCopy = [...original];
    const result = shuffle(original);

    expect(original).toEqual(originalCopy);
    expect(result).not.toBe(original);
  });

  test('returns an array with the same length', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = shuffle(input);
    expect(result.length).toBe(input.length);
  });

  test('contains all original elements', () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input);
    expect(result.sort((a, b) => a - b)).toEqual(input.sort((a, b) => a - b));
  });

  test('handles empty array', () => {
    const result = shuffle([]);
    expect(result).toEqual([]);
  });

  test('handles single element array', () => {
    const result = shuffle([42]);
    expect(result).toEqual([42]);
  });

  test('handles two element array', () => {
    const result = shuffle([1, 2]);
    expect(result.sort()).toEqual([1, 2]);
  });

  test('produces different orderings over many runs (statistical)', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    let differentOrderCount = 0;
    const runs = 20;

    for (let i = 0; i < runs; i++) {
      const result = shuffle(input);
      const isSameOrder = result.every((val, idx) => val === input[idx]);
      if (!isSameOrder) {
        differentOrderCount++;
      }
    }

    expect(differentOrderCount).toBeGreaterThan(0);
  });

  test('works with string arrays', () => {
    const input = ['a', 'b', 'c', 'd', 'e'];
    const result = shuffle(input);
    expect(result.sort()).toEqual([...input].sort());
  });

  test('works with object arrays', () => {
    const input = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const result = shuffle(input);
    for (const item of input) {
      expect(result).toContain(item);
    }
  });
});
