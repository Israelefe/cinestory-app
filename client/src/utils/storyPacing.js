export function storyFrameDurationSeconds(photo, pace = 'warm') {
  const scale = pace === 'measured' ? 1.08 : pace === 'energetic' ? 0.9 : 1;
  const requested = Number(photo?.duration);
  const base = Number.isFinite(requested) && requested > 0 ? requested : 4.5;
  const words = String(photo?.caption || '').trim().split(/\s+/).filter(Boolean).length;
  const readingTime = Math.min(5.8, 2.3 + words * 0.18);
  return Math.min(6.2, Math.max(3.4, base * scale, readingTime));
}
