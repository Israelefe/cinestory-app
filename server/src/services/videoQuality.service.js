export const VIDEO_QUALITY_VERSION = 3;
export const AUTOMATIC_QUALITY_MIN_VERSION = 2;
export const PLAYBACK_SEGMENT_SECONDS = 2;
const ladder = [[720, 2_800_000], [1080, 5_500_000], [1440, 10_000_000], [2160, 20_000_000]];

export function encodingVariants({ width, height, frameRate = 30 }) {
  if (![width, height].every(value => Number.isInteger(value) && value >= 16 && value <= 8192)) throw new Error('Invalid video dimensions.');
  const short = Math.min(width, height);
  const levels = ladder.filter(([size]) => size <= short);
  // Retain native dimensions for older, smaller uploads; never enlarge a file.
  if (!levels.length) levels.push([short, 2_000_000]);
  else if (short < 2160 && !levels.some(([size]) => size === short)) levels.push([short, levels.at(-1)[1]]);
  return levels.map(([size, bitrate]) => {
    const scale = Math.min(size / short, 1);
    const frameMultiplier = Math.max(1, Math.min(frameRate, 120) / 30);
    // The lowest quality must leave room for request latency on mobile data,
    // including 60 fps sources. Keep every frame without doubling its bitrate.
    return { name: `q${size}`, width: Math.max(2, Math.floor(width * scale / 2) * 2), height: Math.max(2, Math.floor(height * scale / 2) * 2),
      bitrate: Math.ceil(bitrate * (size === 720 ? Math.min(frameMultiplier, 1.25) : frameMultiplier)), frameRate,
      source: size === short };
  });
}

export const playbackQualities = asset => (asset.hls?.variants || []).map(variant => ({
  name: variant.name, height: Math.min(variant.width, variant.height), width: variant.width,
  displayHeight: variant.height, frameRate: variant.frameRate || asset.frameRate || 30,
  original: Boolean(variant.source),
}));
