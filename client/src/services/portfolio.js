import { API_BASE_URL } from '../config/env.js';
export const directionDefaults = {
  background: 'ink',
  accent: '#ff9b8e',
  typeStyle: 'editorial',
  rhythm: 'measured',
  layout: 'editorial',
  motion: 'subtle',
  showBio: true,
  showLocation: true,
  showCategories: true,
  showPhotoTitles: true,
  showContact: true
};
export const textFields = ['handle', 'studioName', 'bio', 'headline', 'introLine', 'location', 'contactLabel', 'instagram', 'whatsapp', 'heroPublicId'];
export function mediaUrl(url) {
  return url?.startsWith('/api/') ? `${API_BASE_URL.replace(/\/$/, '')}${url.slice(4)}` : url || '';
}
export function normalizePortfolio(value = {}) {
  return {
    ...Object.fromEntries(textFields.map(key => [key, value[key] || (key === 'contactLabel' ? 'Ask about a shoot' : '')])),
    items: (value.items || []).map(item => ({
      ...item,
      id: item.id || item.publicId,
      title: item.title || '',
      category: item.category || 'Selected work',
      alt: item.alt || '',
      featured: item.featured ?? true,
      crop: item.crop || 'fit',
      focalX: item.focalX ?? 50,
      focalY: item.focalY ?? 50,
      url: mediaUrl(item.url),
      thumbnailUrl: mediaUrl(item.thumbnailUrl),
      srcSet: item.srcSet?.replace(/\/api\//g, `${API_BASE_URL.replace(/\/$/, '')}/`)
    })),
    projects: (value.projects || []).map(project => ({
      ...project,
      description: project.description || '',
      category: project.category || 'Selected work',
      photoIds: [...(project.photoIds || [])]
    })),
    direction: {
      ...directionDefaults,
      ...(value.direction || {})
    },
    heroId: value.heroId || ''
  };
}
export function editablePortfolio(value) {
  return {
    ...Object.fromEntries(textFields.map(key => [key, value[key] || ''])),
    items: value.items.map(item => Object.fromEntries(['id', 'publicId', 'title', 'category', 'alt', 'featured', 'crop', 'focalX', 'focalY'].map(key => [key, item[key]]))),
    projects: value.projects.map(project => Object.fromEntries(['id', 'title', 'description', 'category', 'coverId', 'photoIds'].map(key => [key, project[key]]))),
    direction: value.direction
  };
}
export function whatsappNumber(value) {
  let digits = String(value || '').replace(/[\s()+-]/g, '');
  if (/^0\d{10}$/.test(digits)) digits = `234${digits.slice(1)}`;
  return digits.replace(/^00/, '');
}
export function instagramName(value) {
  const text = String(value || '').trim();
  if (/^https?:\/\/(?:www\.)?instagram\.com\//i.test(text)) {
    try {
      return decodeURIComponent(new URL(text).pathname.split('/').filter(Boolean)[0] || '');
    } catch {}
  }
  return text.replace(/^@/, '');
}
export function contactErrors(form) {
  const errors = {};
  if (form.whatsapp && !/^[1-9]\d{7,14}$/.test(whatsappNumber(form.whatsapp))) errors.whatsapp = 'Use a valid number, such as 08012345678 or +2348012345678.';
  if (form.instagram && !/^[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?$/.test(instagramName(form.instagram))) errors.instagram = 'Use an Instagram username or profile link.';
  return errors;
}
function luminance(hex) {
  const rgb = hex.match(/[0-9a-f]{2}/gi).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
export function readableColors(direction) {
  const accent = /^#[0-9a-f]{6}$/i.test(direction.accent) ? direction.accent : '#ff9b8e';
  const background = direction.background === 'ivory' ? '#eee8de' : direction.background === 'warm-black' ? '#120e0c' : '#08080b';
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
  return {
    accent,
    accentText: contrast(accent, background) >= 4.5 ? accent : direction.background === 'ivory' ? '#763b31' : '#f4eee8',
    buttonText: contrast(accent, '#110d0b') >= contrast(accent, '#ffffff') ? '#110d0b' : '#ffffff'
  };
}
