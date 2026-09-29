const DEFAULT_PALETTE = { background: '#13110f', surface: '#211b18', text: '#fff6ec', accent: '#efa57c' };

function colorProfile(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return null;
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  let hue = 0;
  if (delta) hue = 60 * (max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4);
  return { hue: (hue + 360) % 360, saturation, lightness };
}

function hsl(hue, saturation, lightness) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const [r, g, b] = hue < 60 ? [chroma, secondary, 0] : hue < 120 ? [secondary, chroma, 0] : hue < 180 ? [0, chroma, secondary] : hue < 240 ? [0, secondary, chroma] : hue < 300 ? [secondary, 0, chroma] : [chroma, 0, secondary];
  const offset = lightness - chroma / 2;
  return '#' + [r, g, b].map(value => Math.round((value + offset) * 255).toString(16).padStart(2, '0')).join('');
}

export function photoLedPalette(assets = []) {
  const buckets = Array.from({ length: 18 }, () => ({ weight: 0, hue: 0, saturation: 0 }));
  let brightness = 0, brightnessWeight = 0;
  for (const asset of assets) {
    const colors = asset.photoColors?.length ? asset.photoColors : asset.dominantColor ? [asset.dominantColor] : asset.analysis?.colors || [];
    colors.slice(0, 3).forEach((hex, index) => {
      const color = colorProfile(hex);
      if (!color) return;
      const weight = [3, 1.5, 1][index];
      brightness += color.lightness * weight;
      brightnessWeight += weight;
      if (color.saturation < .11 || color.lightness < .08 || color.lightness > .92) return;
      const bucket = buckets[Math.floor(color.hue / 20) % buckets.length];
      const influence = weight * Math.max(.2, color.saturation);
      bucket.weight += influence;
      bucket.hue += color.hue * influence;
      bucket.saturation += color.saturation * influence;
    });
  }
  const leading = buckets.reduce((best, bucket) => bucket.weight > best.weight ? bucket : best, buckets[0]);
  if (!leading.weight) return DEFAULT_PALETTE;
  const hue = leading.hue / leading.weight;
  const saturation = leading.saturation / leading.weight;
  const base = Math.max(.24, Math.min(.46, .2 + saturation * .34));
  const accent = Math.max(.38, Math.min(.58, .34 + saturation * .3));
  return brightnessWeight && brightness / brightnessWeight > .64
    ? { background: hsl(hue, base * .78, .945), surface: hsl(hue, base * .52, .985), text: hsl(hue, .2, .12), accent: hsl(hue, accent, .32) }
    : { background: hsl(hue, base, .095), surface: hsl(hue, base * .85, .155), text: hsl(hue, .18, .94), accent: hsl(hue, accent, .7) };
}

export function resolvedGridboardPalette(palette, assets = []) {
  const isDefault = !palette || Object.keys(DEFAULT_PALETTE).every(key => String(palette[key] || '').toLowerCase() === DEFAULT_PALETTE[key]);
  return isDefault ? photoLedPalette(assets) : palette;
}
