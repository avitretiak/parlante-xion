export default (width: number, progress: number): string => {
  const clamped = Math.max(0, Math.min(1, progress));
  const dot = Math.max(0, Math.min(width - 1, Math.round(clamped * (width - 1))));
  let res = '';
  for (let i = 0; i < width; i++) res += i === dot ? '🔘' : '▬';
  return res;
};
