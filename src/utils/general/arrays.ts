/**
 * Shuffle an array using Fisher-Yates algorithm for uniform distribution.
 * @param array The array to shuffle
 * @returns A new shuffled array (original array is not modified)
 */
export function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
