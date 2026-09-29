import { signedImageUrl } from './deliveryMedia.service.js';
import { contrastRatio, V3_DEFAULT_PALETTE, V3_FONT_CHOICES, V3_FORMATS } from '../constants/deliveryV3.js';

const MODEL = 'deepseek-v4.1-flash';
const TRANSIENT = new Set([429, 500, 502, 503, 504]);

function provider() {
  const apiKey = String(process.env.ALIBABA_MODEL_STUDIO_API_KEY || '').trim();
  const workspace = String(process.env.ALIBABA_WORKSPACE_ID || '').trim();
  const base = String(process.env.ALIBABA_BASE_URL || (workspace ? `https://${workspace}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` : '')).replace(/\/$/, '');
  let url;
  try { url = new URL(base); } catch { throw Object.assign(new Error('Model Studio is not configured.'), { code: 'V3_AI_UNAVAILABLE' }); }
  if (!apiKey || url.protocol !== 'https:' || !/\.(?:aliyuncs\.com|alibabacloud\.com)$/.test(url.hostname)) {
    throw Object.assign(new Error('Model Studio is not configured.'), { code: 'V3_AI_UNAVAILABLE' });
  }
  return { apiKey, endpoint: `${url.toString().replace(/\/$/, '')}/chat/completions` };
}

function parseJson(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(raw); } catch {
    const start = raw.indexOf('{'); const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw Object.assign(new Error('The model returned an unreadable response. Please retry.'), { code: 'V3_INVALID_AI_RESPONSE' });
  }
}

async function request(system, user, { images = [], maxTokens = 4000 } = {}) {
  const { apiKey, endpoint } = provider();
  const content = [{ type: 'text', text: user }, ...images.map(image => ({ type: 'image_url', image_url: { url: signedImageUrl(image.publicId, { width: 960 }) } }))];
  const body = { model: MODEL, enable_thinking: false, temperature: 0.45, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content }] };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
    if (!response.ok) {
      try { await response.body?.cancel?.(); } catch { /* The retry can proceed even if the error body cannot be cancelled. */ }
      if (response.status === 429 && attempt < 5) {
        const retryAfter = response.headers?.get?.('retry-after');
        const seconds = retryAfter == null ? NaN : Number(retryAfter);
        const providerDelay = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
        const fallbackDelay = Math.min(60_000, 2_000 * 2 ** attempt);
        const waitMs = Math.min(60_000, Math.max(1_000, Number.isFinite(providerDelay) ? providerDelay : fallbackDelay));
        await new Promise(resolve => setTimeout(resolve, waitMs + Math.floor(Math.random() * 500)));
        continue;
      }
      if (TRANSIENT.has(response.status) && attempt < 2) { await new Promise(resolve => setTimeout(resolve, 900 * (attempt + 1))); continue; }
      const code = [400, 413].includes(response.status) && images.length > 1 ? 'V3_IMAGE_BATCH_TOO_LARGE' : 'V3_AI_REQUEST_FAILED';
      throw Object.assign(new Error(`Model Studio could not complete this request (${response.status}). Retry from this step.`), { code });
    }
    const payload = await response.json();
    const answer = payload?.choices?.[0]?.message?.content;
    return parseJson(typeof answer === 'string' ? answer : Array.isArray(answer) ? answer.filter(part => part.type === 'text').map(part => part.text).join('') : '');
  }
}

export async function improvePurpose({ purpose, shootType }) {
  const readSuggestion = result => {
    const raw = String(result?.improved || '').trim();
    const purposeLine = raw.match(/(?:^|\n)\s*(?:photographer['\u2019]s\s+)?purpose\s*:\s*(.+)/i)?.[1];
    return String(purposeLine || raw).replace(/^\s*(?:improved\s+)?(?:photographer['\u2019]s\s+)?purpose\s*:\s*/i, '').trim().slice(0, 3000);
  };
  const system = 'You are improving the photographer’s short description of why a finished shoot was taken. Return JSON {"improved":"..."} with only the improved purpose. Make a clear, natural improvement to grammar and wording, not just capitalization. Keep close to the original meaning and length, and preserve every name, age, event, date, and supplied fact. A fragment can become one natural sentence. Do not add a location, relationship, emotion, scene detail, or caption. Example: "Lora 25th Birthday Celebration" becomes "Celebrating Lora’s 25th birthday." If the original is already a clear natural sentence, return it unchanged.';
  const result = await request(system, JSON.stringify({ shootType, purpose }), { maxTokens: 250 });
  let improved = readSuggestion(result);
  if (improved.toLocaleLowerCase() === String(purpose || '').trim().toLocaleLowerCase()) {
    const retry = await request(
      'Return JSON {"improved":"..."}. The previous wording was identical to the source. If the source is a phrase or title rather than a complete sentence, turn it into one natural sentence without adding any fact. Preserve the same purpose, names, ages, occasion, and meaning. Do not merely change capitalization.',
      JSON.stringify({ shootType, purpose, previousSuggestion: improved }),
      { maxTokens: 250 }
    );
    improved = readSuggestion(retry);
  }
  if (!improved || /\n|(?:^|\b)shoot\s+type\s*:/i.test(improved)) throw Object.assign(new Error('The wording suggestion was not usable. Your original purpose is unchanged. Please try again.'), { code: 'V3_INVALID_AI_RESPONSE' });
  return improved;
}

export async function recommendV3Format(shootType, purpose = '') {
  const type = String(shootType || '').trim().toLocaleLowerCase();
  const brief = String(purpose || '').trim().toLocaleLowerCase();
  const commercial = /\b(campaign|lookbook|product|commercial|brand assets|product launch|catalogue|catalog)\b/.test(brief);
  let format = 'photo-story';
  let reason = 'Photo Story gives a personal shoot a clear opening, a considered sequence, and a finish.';

  if (commercial || ['fashion', 'personal branding'].includes(type)) {
    format = commercial ? 'campaign' : 'editorial';
    reason = format === 'campaign'
      ? 'Campaign Delivery presents commercial work first, then gives the client a clear handoff for the final assets.'
      : 'Editorial Page gives a portrait or brand session room for strong images, varied scale, and a clear visual direction.';
  } else if (['event', 'conference', 'concert', 'church service', 'owambe', 'corporate event'].includes(type) || type === 'other' && /\b(conference|church service|concert|owambe|gala|company event|event coverage)\b/.test(brief)) {
    format = 'event-coverage';
    reason = 'Event Coverage is made for a gathering with multiple people, scenes, and changes through the day.';
  } else if (['wedding', 'traditional wedding'].includes(type)) {
    format = 'chapters';
    reason = 'Chapters lets clients move through the distinct parts of a wedding while keeping the whole day together.';
  } else if (['birthday', 'engagement', 'pre-wedding', 'graduation', 'maternity', 'newborn', 'anniversary', 'memorial', 'portrait'].includes(type)) {
    format = 'photo-story';
    reason = type === 'birthday'
      ? 'Photo Story keeps the focus on the person being celebrated and gives their birthday portraits a clear beginning and close.'
      : 'Photo Story keeps a personal session focused on its subject and gives the finished photographs a clear beginning and close.';
  } else if (type === 'corporate') {
    format = 'editorial';
    reason = 'Editorial Page suits corporate portraits and studio work when the brief is not a commercial asset handoff.';
  } else if (type === 'other') {
    if (/\b(birthday|graduation|anniversary|maternity|newborn|portrait|memorial|engagement|pre-wedding)\b/.test(brief)) {
      format = 'photo-story';
      reason = 'Photo Story gives this personal occasion a clear beginning, a meaningful sequence, and a finish.';
    } else {
      reason = 'Photo Story is a flexible starting point for a personal shoot. You can choose another format if the work calls for it.';
    }
  }

  return { format, reason };
}

async function analyzeBatch(batch, context) {
  const descriptors = batch.map((asset, index) => ({ index, assetId: asset.assetId }));
  const similarityFields = context.kind === 'pinboard' ? ',"similarityTags":["seated half-length pose","dark studio backdrop"]' : '';
  const similarityInstructions = context.kind === 'pinboard'
    ? ' Return up to six specific similarityTags used only to find photographs that look alike, such as a close profile, seated half-length pose, full-length framing, floral arch, or dark studio backdrop. Reuse the same concise phrase across images whenever that visible detail matches. Do not use broad moment labels such as portrait, wedding, birthday, or dancing as similarity tags; those belong in momentTags. Similarity tags describe visible composition and details, not who a person is.'
    : '';
  const result = await request(`Return JSON {"images":[{"index":0,"summary":"visible facts only","score":1,"colors":["#hex"],"momentTags":["ceremony"],"colorGroups":[{"area":"outfit","color":"green"}]${similarityFields}}]}. Describe each supplied image by its numeric index. Include every index exactly once. List up to four visible photo colours as #RRGGBB in order of how much of the photograph they occupy. Score visual showcase suitability 1-10 based on image quality, variety and clear subject. Return up to three momentTags for useful groups based on the scene or activity, such as portraits, ceremony, dancing, or details; do not use colour alone as a moment. When clearly visible, describe specific outfit or backdrop colours rather than generic tags like clothing. Also return up to two colorGroups for each image, using only area outfit or backdrop and a plain common color name. Add an outfit group only when clothing and its colour are clearly visible. Add a backdrop group only when the background or studio setting and its colour are clearly visible. Never infer a colour from the overall photo palette; never guess hidden or unclear details. These groups let clients find photos with the same outfit or backdrop.${similarityInstructions} Describe visible scenes only. Do not identify people or infer names, ages, relationships, emotions, or event facts from pixels. Never use face recognition. If an image cannot be seen, say so and score 1.`, `Shoot type: ${context.shootType}. Purpose: ${context.brief}. Images in order: ${JSON.stringify(descriptors)}`, { images: batch, maxTokens: Math.min(25000, (context.kind === 'pinboard' ? 430 : 330) * batch.length) });
  const rows = Array.isArray(result.images) ? result.images : [];
  if (rows.length !== batch.length) throw Object.assign(new Error('Some photographs were not analysed. Retry this step.'), { code: 'V3_INCOMPLETE_ANALYSIS' });
  const byIndex = new Map(rows.map(row => [Number(row.index), row]));
  if (byIndex.size !== batch.length || batch.some((_, index) => !byIndex.has(index))) throw Object.assign(new Error('Some photographs were not analysed. Retry this step.'), { code: 'V3_INCOMPLETE_ANALYSIS' });
  return batch.map((asset, index) => {
    const row = byIndex.get(index);
    const colorGroups = (Array.isArray(row.colorGroups) ? row.colorGroups : []).map(item => {
      const rawArea = String(item?.area || '').toLowerCase();
      const area = rawArea === 'outfit' || rawArea === 'clothing' ? 'outfit' : ['backdrop', 'background'].includes(rawArea) ? 'backdrop' : '';
      const color = String(item?.color || '').toLowerCase().replace(/[^a-z -]/g, '').trim().slice(0, 20);
      return area && color ? { area, color } : null;
    }).filter(Boolean).slice(0, 2);
    return {
      assetId: asset.assetId,
      summary: String(row.summary || '').slice(0, 220),
      score: Math.max(1, Math.min(10, Number(row.score) || 1)),
      colors: (Array.isArray(row.colors) ? row.colors : []).filter(color => /^#[0-9a-f]{6}$/i.test(color)).slice(0, 4),
      momentTags: (Array.isArray(row.momentTags) ? row.momentTags : []).map(value => String(value).toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().slice(0, 32)).filter(Boolean).slice(0, 3),
      colorGroups,
      similarityTags: (Array.isArray(row.similarityTags) ? row.similarityTags : []).map(value => String(value).toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().slice(0, 48)).filter(Boolean).slice(0, 6)
    };
  });
}

const BROAD_SIMILARITY_TAGS = new Set(['portrait', 'portraits', 'studio', 'wedding', 'birthday', 'event', 'family', 'fashion', 'editorial', 'details', 'clothing', 'people']);
function linkSimilarShots(assets, analyses) {
  const byId = new Map(analyses.map(row => [String(row.assetId), row]));
  const tagsFor = row => new Set((row?.similarityTags || []).map(tag => String(tag).toLowerCase().trim()).filter(tag => tag && !BROAD_SIMILARITY_TAGS.has(tag)));
  const groupsFor = row => new Set((Array.isArray(row?.colorGroups) ? row.colorGroups : [])
    .filter(group => group && ['outfit', 'backdrop'].includes(group.area) && String(group.color || '').trim())
    .map(group => `${group.area}:${String(group.color).toLowerCase().trim()}`));
  const rows = assets.map(asset => ({ asset, analysis: byId.get(String(asset.assetId)) })).filter(row => row.analysis);
  for (const source of rows) {
    const tags = tagsFor(source.analysis);
    const groups = groupsFor(source.analysis);
    source.analysis.similarAssetIds = rows.filter(candidate => candidate.asset.assetId !== source.asset.assetId).map(candidate => {
      const sharedTags = [...tags].filter(tag => tagsFor(candidate.analysis).has(tag)).length;
      const sharedGroups = [...groups].filter(group => groupsFor(candidate.analysis).has(group)).length;
      return { assetId: candidate.asset.assetId, score: sharedTags * 6 + sharedGroups * 2, sharedTags, sortOrder: Number(candidate.asset.sortOrder || 0) };
    }).filter(candidate => candidate.sharedTags > 0).sort((a, b) => b.score - a.score || a.sortOrder - b.sortOrder).slice(0, 5).map(candidate => candidate.assetId);
  }
  return analyses;
}

export async function analyzeAllV3(delivery, onProgress = async () => {}) {
  const assets = [...delivery.assets].sort((a, b) => a.sortOrder - b.sortOrder);
  const known = new Set(assets.map(asset => asset.assetId));
  const byId = new Map((delivery.collectionAnalysis?.images || []).filter(item => known.has(item.assetId) && (delivery.kind !== 'pinboard' || (Array.isArray(item.colorGroups) && Array.isArray(item.similarityTags)))).map(item => [item.assetId, item]));
  const pending = assets.filter(asset => !byId.has(asset.assetId));
  // Model Studio documents an input-token limit for this model, but no fixed image count.
  // Grow successful batches, then lower the ceiling if a batch exceeds the live limit.
  let ceiling = Math.min(100, pending.length);
  let size = Math.min(24, ceiling);
  for (let cursor = 0; cursor < pending.length;) {
    const batch = pending.slice(cursor, cursor + size);
    try {
      for (const item of await analyzeBatch(batch, delivery)) byId.set(item.assetId, item);
      cursor += batch.length;
      await onProgress(byId.size, assets.length, assets.map(asset => byId.get(asset.assetId)).filter(Boolean));
      if (size < ceiling) size = Math.min(ceiling, size + Math.max(8, Math.ceil(size / 2)));
    } catch (error) {
      if (['V3_IMAGE_BATCH_TOO_LARGE', 'V3_INVALID_AI_RESPONSE', 'V3_INCOMPLETE_ANALYSIS'].includes(error.code) || ['TimeoutError', 'AbortError'].includes(error.name)) {
        if (size > 1) { ceiling = Math.min(ceiling, size - 1); size = Math.max(1, Math.floor(size / 2)); continue; }
      }
      throw error;
    }
  }
  const analyses = assets.map(asset => byId.get(asset.assetId));
  return delivery.kind === 'pinboard' ? linkSimilarShots(assets, analyses) : analyses;
}

function pinboardSlug(value, fallback) {
  const slug = String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
  return slug || fallback;
}

function dominantHue(colors = []) {
  const hex = String(colors[0] || '').match(/^#([0-9a-f]{6})$/i)?.[1];
  if (!hex) return 0;
  const [r0, g0, b0] = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const max = Math.max(r0, g0, b0); const min = Math.min(r0, g0, b0); const delta = max - min;
  if (!delta) return 0;
  const hue = max === r0 ? ((g0 - b0) / delta) % 6 : max === g0 ? (b0 - r0) / delta + 2 : (r0 - g0) / delta + 4;
  return (hue * 60 + 360) % 360;
}

function photoColor(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(String(hex || ''))) return null;
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  return { hue: dominantHue([hex]), saturation, lightness };
}

function hexFromHsl(hue, saturation, lightness) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const [red, green, blue] = hue < 60 ? [chroma, secondary, 0] : hue < 120 ? [secondary, chroma, 0] : hue < 180 ? [0, chroma, secondary] : hue < 240 ? [0, secondary, chroma] : hue < 300 ? [secondary, 0, chroma] : [chroma, 0, secondary];
  const offset = lightness - chroma / 2;
  return '#' + [red, green, blue].map(value => Math.round((value + offset) * 255).toString(16).padStart(2, '0')).join('');
}

function photoColourProfile(imageColors = []) {
  const groups = Array.from({ length: 18 }, () => ({ weight: 0, hueTotal: 0, saturationTotal: 0 }));
  let brightnessTotal = 0; let brightnessWeight = 0;
  for (const image of imageColors) {
    for (const [index, color] of (image.colors || []).slice(0, 3).entries()) {
      const value = photoColor(color);
      if (!value) continue;
      const weight = index === 0 ? 3 : index === 1 ? 1.5 : 1;
      brightnessTotal += value.lightness * weight;
      brightnessWeight += weight;
      if (value.saturation < .11 || value.lightness < .08 || value.lightness > .92) continue;
      const group = groups[Math.floor(value.hue / 20) % groups.length];
      const influence = weight * Math.max(.2, value.saturation);
      group.weight += influence;
      group.hueTotal += value.hue * influence;
      group.saturationTotal += value.saturation * influence;
    }
  }
  const leading = groups.reduce((best, group) => group.weight > best.weight ? group : best, groups[0]);
  const tones = groups.filter(group => group.weight > 0 && group.weight >= leading.weight * .08).sort((a, b) => b.weight - a.weight).slice(0, 4)
    .map(group => ({ hue: group.hueTotal / group.weight, saturation: group.saturationTotal / group.weight }));
  return { hue: leading.weight ? leading.hueTotal / leading.weight : 210, saturation: leading.weight ? leading.saturationTotal / leading.weight : .3, light: brightnessWeight ? brightnessTotal / brightnessWeight > .64 : false, hasHue: leading.weight > 0, tones };
}

export function calmGridboardPalette(imageColors = [], mode = 'auto') {
  const { hue, saturation, light } = photoColourProfile(imageColors);
  const baseSaturation = Math.max(.24, Math.min(.46, .2 + saturation * .34));
  const accentSaturation = Math.max(.38, Math.min(.58, .34 + saturation * .3));
  return (mode === 'light' || mode === 'auto' && light)
    ? { background: hexFromHsl(hue, baseSaturation * .78, .945), surface: hexFromHsl(hue, baseSaturation * .52, .985), text: hexFromHsl(hue, .2, .12), accent: hexFromHsl(hue, accentSaturation, .32) }
    : { background: hexFromHsl(hue, baseSaturation, .095), surface: hexFromHsl(hue, baseSaturation * .85, .155), text: hexFromHsl(hue, .18, .94), accent: hexFromHsl(hue, accentSaturation, .7) };
}

function photoPaletteFamilies(imageColors) {
  const profile = photoColourProfile(imageColors);
  const tones = profile.tones.length ? profile.tones : [{ hue: profile.hue, saturation: .04 }];
  const families = [...tones];
  const main = hexFromHsl(tones[0].hue, tones[0].saturation, .5);
  for (const tone of tones.slice(1)) {
    const secondary = hexFromHsl(tone.hue, tone.saturation, .5);
    for (const share of [.35, .65]) {
      const mix = '#' + [1, 3, 5].map(index => Math.round(parseInt(main.slice(index, index + 2), 16) * (1 - share) + parseInt(secondary.slice(index, index + 2), 16) * share).toString(16).padStart(2, '0')).join('');
      families.push(photoColor(mix));
    }
  }
  return families;
}

function acceptableGridboardPalette(palette, imageColors, families = photoPaletteFamilies(imageColors)) {
  if (['background', 'surface', 'text', 'accent'].some(key => !photoColor(palette?.[key]))) return false;
  if (contrastRatio(palette.background, palette.text) < 4.5 || contrastRatio(palette.surface, palette.text) < 4.5) return false;
  const background = photoColor(palette.background);
  const surface = photoColor(palette.surface);
  const accent = photoColor(palette.accent);
  const related = families.some(tone => {
    const distance = Math.abs(accent.hue - tone.hue);
    return Math.min(distance, 360 - distance) <= 35;
  });
  return background.saturation <= .4 && surface.saturation <= .4 && accent.saturation <= .75 && (accent.saturation < .12 || related);
}

function paletteSignature(palette) {
  return ['background', 'surface', 'accent'].map(key => String(palette?.[key] || '').toLowerCase()).join('|');
}

export function nextGridboardPalette(imageColors, currentPalette, recentPalettes = []) {
  const families = photoPaletteFamilies(imageColors);
  const variants = [
    { light: false, offset: 0, depth: .085, accent: .71 },
    { light: true, offset: 0, depth: .95, accent: .28 },
    { light: false, offset: -14, depth: .125, accent: .66 },
    { light: true, offset: 14, depth: .91, accent: .32 },
    { light: false, offset: 14, depth: .07, accent: .75 },
    { light: true, offset: -14, depth: .97, accent: .25 },
    { light: false, offset: -28, depth: .16, accent: .72 },
    { light: true, offset: 28, depth: .88, accent: .29 },
    { light: false, offset: 28, depth: .11, accent: .78 },
    { light: true, offset: -28, depth: .94, accent: .29 },
    { light: false, offset: 0, depth: .15, accent: .77 },
    { light: true, offset: 0, depth: .87, accent: .27 }
  ];
  const palettes = variants.flatMap(item => families.map(family => {
    const tone = (family.hue + item.offset + 360) % 360;
    const baseSaturation = Math.min(.36, .06 + family.saturation * .3);
    const background = hexFromHsl(tone, baseSaturation * (item.light ? .6 : 1), item.depth);
    const surface = hexFromHsl(tone, baseSaturation * .7, item.light ? Math.min(.99, item.depth + .035) : Math.min(.25, item.depth + .058));
    return { background, surface, text: item.light ? '#17191b' : '#fffaf5', accent: hexFromHsl(tone, Math.min(.6, baseSaturation + family.saturation * .16), item.accent) };
  })).filter(palette => acceptableGridboardPalette(palette, imageColors, families) && contrastRatio(palette.accent, palette.background) >= 3 && contrastRatio(palette.accent, palette.surface) >= 3);
  if (!palettes.length) return calmGridboardPalette(imageColors, photoColor(currentPalette?.background)?.lightness > .5 ? 'dark' : 'light');
  const difference = (first, second) => ['background', 'surface', 'accent'].reduce((sum, key) => sum + [1, 3, 5].reduce((channelSum, index) => channelSum + Math.abs(parseInt(first[key].slice(index, index + 2), 16) - parseInt(String(second?.[key] || '#000000').slice(index, index + 2), 16)), 0), 0);
  const closest = palettes.reduce((best, palette, index) => difference(palette, currentPalette) < difference(palettes[best], currentPalette) ? index : best, 0);
  const recent = new Set(recentPalettes.map(paletteSignature));
  recent.add(paletteSignature(currentPalette));
  for (let offset = 1; offset <= palettes.length; offset += 1) {
    const palette = palettes[(closest + offset) % palettes.length];
    if (!recent.has(paletteSignature(palette))) return palette;
  }
  return palettes[(closest + 1) % palettes.length];
}

function buildPinboardLayouts(assets, moments) {
  const ordered = [...assets].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  const portrait = ordered.filter(asset => Number(asset.height || 0) >= Number(asset.width || 0));
  const landscape = ordered.filter(asset => Number(asset.width || 0) > Number(asset.height || 0));
  const balanced = [];
  let takePortrait = portrait.length >= landscape.length;
  while (portrait.length || landscape.length) {
    const preferred = takePortrait ? portrait : landscape;
    const other = takePortrait ? landscape : portrait;
    if (preferred.length) balanced.push(preferred.shift());
    else if (other.length) balanced.push(other.shift());
    takePortrait = !takePortrait;
  }
  const byId = new Map(ordered.map(asset => [asset.assetId, asset]));
  const momentOrder = [];
  const seen = new Set();
  for (const moment of moments) for (const id of moment.assetIds) if (byId.has(id) && !seen.has(id)) { seen.add(id); momentOrder.push(byId.get(id)); }
  for (const asset of ordered) if (!seen.has(asset.assetId)) momentOrder.push(asset);
  const colorOrder = [...ordered].sort((a, b) => dominantHue(a.analysis?.colors) - dominantHue(b.analysis?.colors) || Number(b.analysis?.score || 0) - Number(a.analysis?.score || 0) || Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  const names = {
    balanced: ['Balanced arrangement', 'Alternates portrait and landscape photos where the set allows it.'],
    moments: ['Scenes together', 'Places photos with the same visible subject or setting near each other.'],
    'colour-flow': ['Colour-led order', 'Arranges photos by their dominant colours. Every photo stays in the gallery.']
  };
  return [
    { id: 'balanced', title: names.balanced[0], description: names.balanced[1], assetOrder: balanced.map(asset => asset.assetId) },
    { id: 'moments', title: names.moments[0], description: names.moments[1], assetOrder: momentOrder.map(asset => asset.assetId) },
    { id: 'colour-flow', title: names['colour-flow'][0], description: names['colour-flow'][1], assetOrder: colorOrder.map(asset => asset.assetId) }
  ];
}

export async function directV3Pinboard(delivery, insights) {
  const gridboardPalette = { background: '#13110f', surface: '#211b18', text: '#fff6ec', accent: '#efa57c' };
  const assets = [...delivery.assets].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  const insightById = new Map(insights.map(row => [row.assetId, row]));
  const rows = assets.map(asset => {
    const insight = insightById.get(asset.assetId) || {};
    asset.analysis = insight;
    return { assetId: asset.assetId, shape: Number(asset.width || 0) && Number(asset.height || 0) ? Number(asset.width) >= Number(asset.height) ? 'landscape' : 'portrait' : 'unknown', summary: insight.summary || '', colors: (insight.colors || []).slice(0, 3), momentTags: (insight.momentTags || []).slice(0, 3), colorGroups: Array.isArray(insight.colorGroups) ? insight.colorGroups.slice(0, 2) : [] };
  });
  const photoPalette = rows.some(row => row.colors.length) ? calmGridboardPalette(rows) : gridboardPalette;
  const photoProfile = photoColourProfile(rows);
  const fallbackGroups = new Map();
  for (const row of rows) for (const tag of row.momentTags) {
    if (!fallbackGroups.has(tag)) fallbackGroups.set(tag, []);
    fallbackGroups.get(tag).push(row.assetId);
  }
  const compact = rows.map(({ assetId, shape, summary, colors, momentTags, colorGroups }) => ({ assetId, shape, summary, colors, momentTags, colorGroups }));
  let generated = {};
  try {
    generated = await request(
      'Return JSON {"moments":[{"title":"...","assetIds":["known-id"]}],"typography":{"display":"Cormorant Garamond","body":"Outfit"}}. Create up to six useful Find a Moment groups based on the visible activity, event scene, setting, or people together. Examples include portraits, ceremony, or dancing. Do not create a moment group solely because photos share an outfit or backdrop colour; those have separate filters. Similar Shot uses the separate similarityTags to match a selected photo with visually similar photos. Use only supplied asset IDs and include at least two IDs in each moment group. A photograph may appear in more than one group. Do not identify people, infer family or other relationships, names, ages, or private traits. Do not use face recognition. The board arrangements and readable photo-led palette are calculated from the image analysis. Typography must use Playfair Display, Outfit, Plus Jakarta Sans, Cormorant Garamond, DM Sans, Libre Baskerville, or Manrope. Keep every supplied photograph in the board; these suggestions only affect presentation.',
      ['Photographer context: ' + String(delivery.brief || '').slice(0, 600), 'Shoot type: ' + String(delivery.shootType || '').slice(0, 100), 'Dominant photo hue in degrees: ' + Math.round(photoProfile.hue), 'Calm palette derived from dominant photo colours: ' + JSON.stringify(photoPalette), 'Photographs: ' + JSON.stringify(compact)].join('\n'),
      { maxTokens: Math.min(22000, 2200 + rows.length * 24) }
    );
  } catch (error) {
    if (!['V3_AI_REQUEST_FAILED', 'V3_INVALID_AI_RESPONSE', 'V3_IMAGE_BATCH_TOO_LARGE'].includes(error.code) && !['TimeoutError', 'AbortError'].includes(error.name)) throw error;
  }
  const known = new Set(assets.map(asset => asset.assetId));
  const usedSlugs = new Set();
  const moments = (Array.isArray(generated.moments) ? generated.moments : []).slice(0, 6).map((moment, index) => {
    const title = String(moment.title || '').replace(/[<>]/g, '').trim().slice(0, 40);
    const assetIds = [...new Set((Array.isArray(moment.assetIds) ? moment.assetIds : []).filter(id => known.has(id)))];
    if (title.length < 2 || assetIds.length < 2) return null;
    let id = pinboardSlug(title, `moment-${index + 1}`);
    if (usedSlugs.has(id)) id = `${id}-${index + 1}`;
    usedSlugs.add(id);
    return { id, title, assetIds, hidden: false };
  }).filter(Boolean);
  if (!moments.length) {
    for (const [tag, assetIds] of fallbackGroups) {
      if (assetIds.length < 2 || moments.length >= 6) continue;
      let id = pinboardSlug(tag, `moment-${moments.length + 1}`);
      if (usedSlugs.has(id)) continue;
      usedSlugs.add(id);
      moments.push({ id, title: tag.split(/\s+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '), assetIds: [...new Set(assetIds)], hidden: false });
    }
  }
  const layouts = buildPinboardLayouts(assets, moments);
  const current = delivery.pinboard || {};
  const currentPaletteIsDefault = current.palette && Object.keys(gridboardPalette).every(key => String(current.palette[key] || '').toLowerCase() === gridboardPalette[key]);
  const typography = {
    display: V3_FONT_CHOICES.has(generated.typography?.display) ? generated.typography.display : current.typography?.display || 'Cormorant Garamond',
    body: V3_FONT_CHOICES.has(generated.typography?.body) ? generated.typography.body : current.typography?.body || 'Outfit'
  };
  return {
    ...current,
    title: String(current.title || delivery.title || `${delivery.clientName || 'Client'}'s photographs`).slice(0, 120),
    layouts,
    selectedLayoutId: layouts.some(layout => layout.id === current.selectedLayoutId) ? current.selectedLayoutId : 'balanced',
    moments,
    palette: current.palette && current.analysisStatus === 'ready' && !currentPaletteIsDefault ? current.palette : photoPalette,
    typography: current.typography || typography,
    grid: current.grid || { mobileColumns: 2, tabletColumns: 3, desktopColumns: 4, gap: 'regular' },
    animation: current.animation || 'soft-fade',
    analysisStatus: 'ready'
  };
}

async function groupV3Sections(delivery, rows, selected) {
  if (!['chapters', 'event-coverage', 'campaign'].includes(delivery.format)) return [{ id: 'showcase', title: 'The photographs', subtitle: '', layout: 'grid', assetIds: selected }];
  const result = await request('Return JSON {"sections":[{"title":"...","subtitle":"...","assetIds":["..."]}]}. Group every supplied asset ID into 2 to 5 useful sections. Include each ID exactly once. Event Coverage sections should describe real scenes, people or shifts visible in the supplied summaries. Campaign sections should group assets by clear use or visual role. Chapters should mark real changes in outfit, place or activity. Never invent event details or usage rights.', 'Format: ' + delivery.format + '\nPhoto observations: ' + JSON.stringify(rows), { maxTokens: 1800 });
  const known = new Set(selected);
  const seen = new Set();
  const sections = (Array.isArray(result.sections) ? result.sections : []).slice(0, 5).map((section, index) => ({
    id: 'section-' + (index + 1),
    title: String(section.title || 'Photographs').slice(0, 60),
    subtitle: String(section.subtitle || '').slice(0, 120),
    layout: 'grid',
    assetIds: (Array.isArray(section.assetIds) ? section.assetIds : []).filter(id => {
      if (!known.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
  })).filter(section => section.assetIds.length);
  if (sections.length < 2) throw Object.assign(new Error('The photo groups were incomplete. Retry this step.'), { code: 'V3_INCOMPLETE_SECTIONS' });
  const missing = selected.filter(id => !seen.has(id));
  if (missing.length) sections[0].assetIds.push(...missing);
  return sections;
}

async function chooseV3Showcase(delivery, insights, maximum) {
  if (insights.length <= maximum) return insights.map(row => row.assetId);
  const ranked = [...insights].sort((a, b) => b.score - a.score);
  const shortlist = ranked.slice(0, Math.min(insights.length, maximum * 3));
  const bucketSize = Math.max(1, Math.floor(insights.length / maximum));
  for (let start = 0; start < insights.length; start += bucketSize) {
    const best = [...insights.slice(start, start + bucketSize)].sort((a, b) => b.score - a.score)[0];
    if (best && !shortlist.some(item => item.assetId === best.assetId)) shortlist.push(best);
  }
  const result = await request('Return JSON {"assetIds":["..."]}. Select exactly ' + maximum + ' unique photo asset IDs in a strong viewing order. Use only the candidate IDs supplied. The shoot purpose is the main context. Prefer clear, varied finished photographs; avoid near-duplicates. These are showcase choices, not a judgment about which originals belong in the full gallery.', 'Purpose: ' + delivery.brief + '\nFormat: ' + delivery.format + '\nCandidates: ' + JSON.stringify(shortlist.map(item => ({ assetId: item.assetId, summary: item.summary, score: item.score }))), { maxTokens: 1700 });
  const chosen = result.assetIds;
  const known = new Set(shortlist.map(item => item.assetId));
  if (!Array.isArray(chosen) || chosen.length !== maximum || new Set(chosen).size !== maximum || chosen.some(id => !known.has(id))) throw Object.assign(new Error('The showcase selection was incomplete. Retry this step.'), { code: 'V3_INVALID_SELECTION' });
  return chosen;
}

function wordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function fitText(value, limit) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit + 1);
  const boundary = clipped.lastIndexOf(' ');
  return (boundary > 0 ? clipped.slice(0, boundary) : clipped.slice(0, limit)).replace(/[\s,;:]+$/, '').replace(/[.!?]+$/, '') + '.';
}

function purposeHeadline(delivery) {
  const purpose = String(delivery.brief || '').replace(/\s+/g, ' ').trim();
  const fallback = purpose || [delivery.clientName, delivery.shootType, 'Photographs'].filter(Boolean).join(' ');
  return fitText(fallback.charAt(0).toLocaleUpperCase() + fallback.slice(1), 70);
}

function purposeCaption(delivery, limit) {
  const purpose = String(delivery.brief || '').replace(/\s+/g, ' ').trim();
  if (!purpose) return fitText('Your finished photographs are ready to revisit whenever you want, with the full collection gathered here for you to view and share.', limit);
  return fitText('This collection marks ' + purpose.replace(/[.!?]+$/, '') + ', giving you finished photographs to revisit whenever you want to remember the occasion.', limit);
}

function headlineNeedsRepair(value) {
  const headline = String(value || '').trim();
  return wordCount(headline) < 2 || wordCount(headline) > 7 || headline.length > 70
    || /^(?:the\s+(?:photograph|photo|image|moment|year ahead|next chapter)|a\s+(?:photograph|photo|moment|day to remember)|photo\s*#?\s*\d+|a beautiful memory|special moments?|new beginnings?)\b/i.test(headline);
}

function purposeTokens(delivery) {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'you', 'our', 'their', 'was', 'were', 'are', 'into', 'over', 'under', 'through', 'about', 'photograph', 'photographs', 'photo', 'photos', 'image', 'images', 'gallery', 'collection', 'delivery', 'shoot', 'session']);
  const normalize = value => String(value || '').toLocaleLowerCase()
    .replace(/\btwenty[-\s]+five\b/g, '25')
    .replace(/\b(\d+)(?:st|nd|rd|th)\b/g, '$1')
    .replace(/[’']s\b/gi, '')
    .replace(/[’']/g, '')
    .match(/[a-z0-9]+/g) || [];
  const clientTokens = normalize(delivery.clientName);
  const briefTokens = normalize(delivery.brief);
  return new Set([...clientTokens, ...briefTokens].filter(token => clientTokens.includes(token) || (/^\d+$/.test(token) || token.length > 2) && !stopWords.has(token)));
}

function headlineHasPurposeAnchor(value, delivery) {
  return textHasPurposeAnchor(value, delivery);
}

function textHasPurposeAnchor(value, delivery) {
  const anchors = purposeTokens(delivery);
  if (!anchors.size) return true;
  const tokens = String(value || '').toLocaleLowerCase()
    .replace(/\btwenty[-\s]+five\b/g, '25')
    .replace(/\b(\d+)(?:st|nd|rd|th)\b/g, '$1')
    .replace(/[’']s\b/gi, '')
    .replace(/[’']/g, '')
    .match(/[a-z0-9]+/g) || [];
  return tokens.some(token => anchors.has(token));
}

function substantialCaption(value, delivery, limit) {
  const caption = String(value || '').trim();
  return fitText(wordCount(caption) < 18 ? purposeCaption(delivery, limit) : caption, limit);
}

function alignNarrativeFrames(value, selected) {
  const rows = Array.isArray(value) ? value.filter(frame => frame && typeof frame === 'object') : [];
  const used = new Set();
  return selected.map((assetId, index) => {
    const match = rows.find(frame => String(frame.assetId || '') === assetId && !used.has(frame));
    const frame = match || rows[index] || {};
    used.add(frame);
    return { ...frame, assetId };
  });
}

function frameNeedsRepair(frame, format, delivery) {
  const headline = String(frame?.headline || '').trim();
  const caption = String(frame?.caption || '').trim();
  const minimumCaptionWords = 18;
  const maximumCaptionWords = format === 'photo-story' ? 24 : 30;
  return headlineNeedsRepair(headline) || !headlineHasPurposeAnchor(headline, delivery)
    || !textHasPurposeAnchor(caption, delivery)
    || wordCount(caption) < minimumCaptionWords || wordCount(caption) > maximumCaptionWords
    || caption.length > (format === 'photo-story' ? 150 : 180);
}

function needsNarrativeRepair(frames, selected, format, delivery) {
  const keys = frames.map(frame => String(frame?.headline || '').trim().toLocaleLowerCase());
  const captionKeys = frames.map(frame => String(frame?.caption || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase());
  return frames.length !== selected.length || frames.some(frame => frameNeedsRepair(frame, format, delivery))
    || new Set(captionKeys).size !== captionKeys.length
    || new Set(keys).size !== keys.length;
}

async function repairNarrativeFrames(delivery, selected, prompt, firstFrames) {
  try {
    const repair = await request(
      'Return JSON {"frames":[{"assetId":"...","headline":"...","caption":"..."}]}. Repair the supplied draft for every asset ID, in the supplied order. Give each photograph a distinct, specific headline of 2-7 words that expresses the idea behind its caption and connects to the photographer’s purpose. Do not use generic titles. Write captions as complete, useful thoughts in plain, natural language a person would say aloud. For Photo Story use 18-24 words and no more than 150 characters. For other formats use 18-30 words and no more than 180 characters. The photographer’s purpose provides the meaning; image observations may add one subtle cue only. Do not invent facts, names, relationships, emotions, or event details. Avoid dashes, semicolons, fragments, stock praise, and decorative metaphors.',
      prompt + '\nWriting standard: Let the photographer’s purpose supply nearly all the meaning. Use a visual observation only as one small, accurate cue. Every caption must be a thoughtful message about the reason this work was made, with at least one clear detail from the purpose. Every headline must name or clearly point to a detail from that purpose. For “Lora’s 25th birthday celebration,” “Lora at Twenty-Five” is specific; “The Year Ahead” alone is too broad. Do not turn the caption into an image description. Give every photograph a different thought.\nDraft text to repair: ' + JSON.stringify(firstFrames) + '\nPhotographer purpose: ' + delivery.brief,
      { maxTokens: Math.min(9000, 700 + selected.length * 170) }
    );
    return Array.isArray(repair.frames) ? repair.frames : firstFrames;
  } catch {
    return firstFrames;
  }
}

export async function directV3(delivery, insights) {
  const [minimum, maximum] = V3_FORMATS[delivery.format];
  const candidates = [...insights].sort((a, b) => b.score - a.score);
  const selected = await chooseV3Showcase(delivery, insights, Math.min(maximum, candidates.length));
  if (selected.length < minimum) throw Object.assign(new Error(`This format needs at least ${minimum} photos.`), { code: 'V3_TOO_FEW_PHOTOS' });
  const selectedSet = new Set(selected);
  const extras = candidates.filter(row => !selectedSet.has(row.assetId));
  const openingAssetId = extras[0]?.assetId || selected[0];
  const closingAssetId = extras[1]?.assetId || extras[0]?.assetId || selected.at(-1);
  const rows = insights.filter(row => selectedSet.has(row.assetId));
  const captionLimit = delivery.format === 'photo-story' ? 150 : 180;
  const narrativeSystem = "Return JSON {\"title\":\"...\",\"openingLine\":\"...\",\"closingLine\":\"...\",\"frames\":[{\"assetId\":\"...\",\"headline\":\"...\",\"caption\":\"...\"}]}. Include exactly one frame per supplied asset ID, in the same order. Write a distinct, specific headline and a substantial, useful caption for every photograph. The photographer's stated purpose determines the caption's meaning; the matching image observation can add one subtle cue only when it helps ground the thought. Do not describe the photograph or let visual analysis take over. Do not invent names, relationships, ages, feelings, or event facts. Keep the client and occasion present across the sequence, but make each headline and caption add a different thought rather than repeating the same sentence. Headlines should be concise (2-7 words), meaningful, and clearly tied to the purpose or idea of their caption. Never use generic labels such as The photograph, The moment, Photo 01, or A beautiful memory. Photo Story captions should be complete, thoughtful ideas in 18-24 words and no more than 150 characters. Other formats should use 18-30 words and no more than 180 characters. Use plain, warm language that sounds natural when spoken aloud. Avoid fragments, dashes, semicolons, stock phrases, decorative metaphors, and empty praise. Keep the opening and closing distinct.";
  const narrativeGuidance = ' Make every caption sound like a thoughtful message from the photographer to this client, tied to the actual occasion or reason they supplied. The purpose provides almost all the meaning. Use shoot type only as light context and any image observation as one small, accurate cue. For example, with purpose “Lora’s 25th birthday celebration,” a useful caption could be: “Lora, turning 25 is a chance to celebrate how far you have come and choose what you want from the year ahead.” A caption that only describes Lora smiling is not useful. Each headline must point to a real detail from the purpose, such as the person, occasion, age, or campaign. “The Year Ahead” is too broad by itself; “Lora at Twenty-Five” is tied to the brief. Make ideas and wording distinct across the set.';
  const narrativePrompt = [
    'Client: ' + delivery.clientName,
    "Photographer's purpose: " + delivery.brief,
    'Shoot type (light context only): ' + delivery.shootType,
    'Format: ' + delivery.format,
    'Selected photographs in order: ' + JSON.stringify(selected.map(assetId => ({ assetId, observation: rows.find(row => row.assetId === assetId)?.summary || '' })))
  ].join('\n');
  let narrative = await request(narrativeSystem + narrativeGuidance, narrativePrompt, { maxTokens: Math.min(12000, 1200 + selected.length * 220) });
  let responseFrames = alignNarrativeFrames(narrative.frames, selected);
  if (needsNarrativeRepair(responseFrames, selected, delivery.format, delivery)) {
    const repairedFrames = await repairNarrativeFrames(delivery, selected, narrativePrompt, narrative.frames);
    responseFrames = alignNarrativeFrames(repairedFrames, selected);
  }
  const captions = responseFrames.map((frame, index) => {
    const rawHeadline = String(frame?.headline || '').replace(/^\s*headline\s*:\s*/i, '').trim();
    const rawCaption = String(frame?.caption || '').replace(/^\s*caption\s*:\s*/i, '').trim();
    const headline = fitText(headlineNeedsRepair(rawHeadline) || !headlineHasPurposeAnchor(rawHeadline, delivery) ? purposeHeadline(delivery) : rawHeadline, 70);
    const caption = substantialCaption(rawCaption, delivery, captionLimit);
    return { assetId: selected[index], headline, caption, textAnimation: delivery.format === 'photo-story' ? 'typewriter' : 'word_fade_up' };
  });
  const visual = await request('Return JSON {"palette":{"background":"#hex","surface":"#hex","text":"#hex","accent":"#hex"},"typography":{"display":"Playfair Display","body":"Outfit"}}. Choose a readable palette from the supplied image colours. Do not write or change the title, opening, closing, headlines, or captions. Typography must use Playfair Display, Outfit, Plus Jakarta Sans, Cormorant Garamond, DM Sans, Libre Baskerville, or Manrope.', 'Image colours: ' + JSON.stringify(rows.map(({ assetId, colors }) => ({ assetId, colors }))) + '\nFormat: ' + delivery.format, { maxTokens: 450 });
  const result = { ...narrative, palette: visual.palette, typography: visual.typography };
  const palette = Object.fromEntries(Object.keys(V3_DEFAULT_PALETTE).map(key => [key, /^#[0-9a-f]{6}$/i.test(result.palette?.[key]) ? result.palette[key] : V3_DEFAULT_PALETTE[key]]));
  if (contrastRatio(palette.background, palette.text) < 4.5 || contrastRatio(palette.surface, palette.text) < 4.5) {
    const readable = ['#ffffff', '#101010'].find(color => contrastRatio(palette.background, color) >= 4.5 && contrastRatio(palette.surface, color) >= 4.5);
    if (readable) palette.text = readable;
    else { palette.background = V3_DEFAULT_PALETTE.background; palette.surface = V3_DEFAULT_PALETTE.surface; palette.text = V3_DEFAULT_PALETTE.text; }
  }
  const openingLine = String(result.openingLine || '').trim().length >= 5 ? String(result.openingLine).trim() : 'These photographs were made for ' + String(delivery.brief || delivery.shootType || 'this occasion').trim() + '.';
  const closingLine = String(result.closingLine || '').trim().length >= 5 ? String(result.closingLine).trim() : 'Your full gallery is ready.';
  const sections = await groupV3Sections(delivery, rows, selected);
  return { selected, openingAssetId, closingAssetId, direction: { title: String(result.title || (delivery.clientName || 'Your') + "'s photographs").slice(0, 80), openingLine: openingLine.slice(0, 140), closingLine: closingLine.slice(0, 160), palette, typography: { display: V3_FONT_CHOICES.has(result.typography?.display) ? result.typography.display : 'Playfair Display', body: V3_FONT_CHOICES.has(result.typography?.body) ? result.typography.body : 'Outfit' }, frames: captions, assetOrder: selected, sections } };
}

export async function repickV3Palette({ format, brief, shootType, imageColors, currentPalette, recentPalettes = [] }) {
  const current = Object.fromEntries(Object.keys(V3_DEFAULT_PALETTE).map(key => [key, String(currentPalette?.[key] || V3_DEFAULT_PALETTE[key]).toLowerCase()]));
  if (format === 'pinboard') return nextGridboardPalette(imageColors, current, recentPalettes);
  const system = 'Return JSON {"palette":{"background":"#hex","surface":"#hex","text":"#hex","accent":"#hex"}}. Choose a readable visual palette for the opening and showcase surfaces from the supplied image colour analysis. Explore the main and secondary photograph colours, their mixtures, related hues, tints and shades; do not repeatedly return the same few combinations. Pair calm backgrounds and panels with a suitable accent. Keep the photographer’s original photographs unchanged. Make the new background, panels, or accent visibly different from the current palette. Text must have at least 4.5:1 contrast against both background and panels. Do not write captions or change delivery content.';
  const prompt = [
    'Format: ' + format,
    'Shoot type: ' + shootType,
    'Photographer purpose: ' + brief,
    'Photo colours and mixtures to explore (hue and saturation): ' + JSON.stringify(photoPaletteFamilies(imageColors)),
    'Image colour analysis: ' + JSON.stringify(imageColors),
    'Current palette to move away from: ' + JSON.stringify(current),
    'Recent palettes not to repeat: ' + JSON.stringify(recentPalettes.slice(-12))
  ].join('\n');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await request(system + (attempt ? ' The previous answer was invalid or repeated a palette. Return a clearly different, readable combination this time.' : ''), prompt, { maxTokens: 250 });
    const palette = Object.fromEntries(Object.keys(V3_DEFAULT_PALETTE).map(key => [key, String(result.palette?.[key] || '').trim()]));
    if (Object.values(palette).some(color => !/^#[0-9a-f]{6}$/i.test(color))) continue;

    if (contrastRatio(palette.background, palette.text) < 4.5 || contrastRatio(palette.surface, palette.text) < 4.5) {
      const readable = ['#fffaf6', '#ffffff', '#101010', '#000000'].find(color => contrastRatio(palette.background, color) >= 4.5 && contrastRatio(palette.surface, color) >= 4.5);
      if (readable) palette.text = readable;
      else continue;
    }
    if (contrastRatio(palette.accent, palette.background) < 3 || contrastRatio(palette.accent, palette.surface) < 3) continue;

    const changed = ['background', 'surface', 'accent'].some(key => palette[key].toLowerCase() !== current[key]);
    if (changed && !recentPalettes.some(previous => paletteSignature(previous) === paletteSignature(palette))) return palette;
  }

  // Keep a repeated model suggestion from trapping the photographer on this step.
  return nextGridboardPalette(imageColors, current, recentPalettes);
}

export async function regenerateV3Caption(delivery, insight, instruction = '') {
  const limit = delivery.format === 'photo-story' ? 150 : 180;
  const prompt = "Photographer's purpose: " + delivery.brief + '\nPhotographer instruction: ' + instruction + '\nShoot type (light context only): ' + delivery.shootType + '\nFormat: ' + delivery.format + '\nImage observation (light context only): ' + (insight.summary || 'No clear visual detail available.');
  const system = 'Return JSON {"headline":"...","caption":"..."}. Write a meaningful 2-7 word headline tied to the photographer’s purpose and the caption’s idea. Do not use generic labels such as The photograph, The moment, or a photo number. Write a complete, useful caption in plain, natural language that sounds human when spoken aloud. The purpose determines its meaning; the image observation can add one subtle cue only. Do not describe the image or invent facts, names, relationships, ages, or feelings. For Photo Story, use 18-24 words and no more than 150 characters. Other formats use 18-30 words and no more than 180 characters. The instruction can guide tone but cannot contradict the purpose. Avoid fragments, dashes, semicolons, stock phrases, decorative metaphors, and empty praise.';
  const meaningfulWritingGuidance = ' The caption should read like a thoughtful message from the photographer to the client, grounded in the actual occasion or reason they supplied. That purpose determines nearly all its meaning; image analysis may add one small, accurate cue. A birthday caption can speak to what turning that age means and the year ahead instead of merely saying someone is smiling. The headline must point to a real detail in the purpose, such as the person, occasion, age, or campaign; broad labels like “The Year Ahead” are not specific enough.';
  let result = await request(system + meaningfulWritingGuidance, prompt, { maxTokens: 700 });
  if (frameNeedsRepair(result, delivery.format, delivery)) {
    const repaired = await repairNarrativeFrames(delivery, ['selected-photo'], prompt, [{ assetId: 'selected-photo', headline: result.headline, caption: result.caption }]);
    result = repaired[0] || result;
  }
  const rawHeadline = String(result.headline || '').replace(/^\s*headline\s*:\s*/i, '').trim();
  const rawCaption = String(result.caption || '').replace(/^\s*caption\s*:\s*/i, '').trim();
  const headline = fitText(headlineNeedsRepair(rawHeadline) || !headlineHasPurposeAnchor(rawHeadline, delivery) ? purposeHeadline(delivery) : rawHeadline, 70);
  return { headline, caption: substantialCaption(rawCaption, delivery, limit) };
}
