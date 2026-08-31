export default (width: number, progress: number): string => {
  if (width <= 0) return '';
  const clamped = Math.max(0, Math.min(1, progress));
  const dot = Math.max(0, Math.min(width - 1, Math.round(clamped * (width - 1))));
  return '▬'.repeat(dot) + '🔘' + '▬'.repeat(width - dot - 1);
};
