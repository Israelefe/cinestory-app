export const qualityLabel = value => {
  const height = typeof value === 'string' ? Number(value.replace(/^q/, '')) : Number(value);
  return height === 2160 ? '4K' : height === 1440 ? '2K' : Number.isFinite(height) && height > 0 ? `${height}p` : 'Original';
};
export const playbackReady = asset => Boolean(asset?.playbackReady ?? asset?.hasAdaptive);
export const previewReady = asset => Boolean(asset?.previewReady ?? asset?.hasAdaptive);
