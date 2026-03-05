export default (width: number, progress: number): string => {
  const clamped = Math.max(0, Math.min(1, progress));
  if (clamped === 0) return '▬'.repeat(width);
  if (clamped === 1) return `${'▬'.repeat(width - 1)}🔘`;
  const dot = Math.max(0, Math.min(width - 1, Math.floor(width * clamped)));
  let res = '';
  for (let i = 0; i < width; i++) res += i === dot ? '🔘' : '▬';
  return res;
};
