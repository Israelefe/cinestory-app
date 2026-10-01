import { gridboardAccentInk, gridboardPaletteContrast } from './gridboardPalette.js';

export function photoStoryChrome(background, text, accent) {
  const normalize = (color, fallback) => /^#[0-9a-f]{6}$/i.test(color || '') ? color : /^#[0-9a-f]{3}$/i.test(color || '') ? '#' + [...color.slice(1)].map(c => c + c).join('') : fallback;
  const bg = normalize(background, '#070709');
  const contrast = color => gridboardPaletteContrast({ background: bg, surface: bg, text: color, accent: color }).background;
  const light = contrast('#17171c') > contrast('#fffaf6');
  const preferredInk = light ? '#17171c' : '#fffaf6';
  const ink = contrast(preferredInk) >= 4.5 ? preferredInk : contrast('#000000') >= contrast('#ffffff') ? '#000000' : '#ffffff';
  const muted = light ? '#53535d' : '#b9b7bd';
  const requestedText = normalize(text, ink);
  const requestedAccent = normalize(accent, '#ff5a47');
  return {
    '--story-text': contrast(requestedText) >= 4.5 ? requestedText : ink,
    '--story-chrome-text': ink,
    '--story-chrome-muted': contrast(muted) >= 4.5 ? muted : ink,
    '--story-chrome-border': light ? '#17171c33' : '#ffffff24',
    '--story-chrome-surface': light ? '#fffaf6' : '#0c0c10',
    '--story-chrome-track': light ? '#17171c40' : '#ffffff26',
    '--story-chrome-accent': contrast(requestedAccent) >= 4.5 ? requestedAccent : ink,
    '--story-chrome-primary': light ? '#17171c' : '#fffaf6',
    '--story-chrome-primary-text': light ? '#fffaf6' : '#0b0b0d',
    '--story-accent-ink': gridboardAccentInk(requestedAccent)
  };
}
