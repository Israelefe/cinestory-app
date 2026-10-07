import { signedDeliveryImageUrl } from './deliveryMedia.service.js';
import { contrastRatio, V3_DEFAULT_PALETTE, V3_FONT_CHOICES, V3_FORMATS } from '../constants/deliveryV3.js';
import { purposeWordingIssues } from '../utils/purposeWording.js';
import { writeEditorialDirection, rewriteEditorialCaption, rewriteEditorialBlock } from './editorialDirection.service.js';
import { deliveryWritingContext, deliveryWritingPolicy, requiresDirectAddress, supportsVisualWriting, shootWritingIssues, writingFallback } from '../constants/deliveryWriting.js';
import { writingBlockLimit } from '../constants/deliveryWritingBlocks.js';
import { anyModelProviderConfigured, DEFAULT_ALIBABA_FALLBACK_MODEL, MAX_CONCURRENT_MODEL_REQUESTS, requestModelCompletion } from './modelProvider.service.js';

const MODEL = DEFAULT_ALIBABA_FALLBACK_MODEL;
const TRANSIENT = new Set([429, 500, 502, 503, 504]);

function parseJson(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  let result;
  try { result = JSON.parse(raw); } catch {
    const start = raw.indexOf('{'); const end = raw.lastIndexOf('}');
    try { if (start >= 0 && end > start) result = JSON.parse(raw.slice(start, end + 1)); } catch { /* Retry malformed provider output below. */ }
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw Object.assign(new Error('Veylo could not read the response. Please retry this step.'), { code: 'V3_INVALID_AI_RESPONSE' });
  return result;
}

function captionTimeout() {
  return Object.assign(new Error('The caption service is taking too long. Your current words are unchanged. Please try again.'), { code: 'V3_CAPTION_TIMEOUT', status: 504 });
}

async function request(system, user, { images = [], maxTokens = 4000, deadline = Infinity, timeoutError = captionTimeout } = {}) {
  if (!anyModelProviderConfigured()) throw Object.assign(new Error('Veylo AI is not configured.'), { code: 'V3_AI_UNAVAILABLE' });
  const content = [{ type: 'text', text: user }, ...images.map(image => ({ type: 'image_url', image_url: { url: signedDeliveryImageUrl(image.publicId, { width: 960 }) } }))];
  const body = { model: MODEL, enable_thinking: false, temperature: 0.45, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content }] };
  let malformedResponses = 0;
  const retryWait = async delay => {
    if (Date.now() + delay >= deadline) throw timeoutError();
    await new Promise(resolve => setTimeout(resolve, delay));
  };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const remaining = Math.min(120000, deadline - Date.now());
    if (remaining <= 0) throw timeoutError();
    let response;
    try {
      response = (await requestModelCompletion(body, { fallbackModel: process.env.ALIBABA_FALLBACK_MODEL || MODEL, timeoutMs: Math.ceil(remaining) })).response;
    } catch (error) {
      if (Number.isFinite(deadline) && (Date.now() >= deadline || error.name === 'TimeoutError')) throw timeoutError();
      throw error;
    }
    if (!response.ok) {
      try { await response.body?.cancel?.(); } catch { /* The retry can proceed even if the error body cannot be cancelled. */ }
      if (response.status === 429 && attempt < 5) {
        const retryAfter = response.headers?.get?.('retry-after');
        const seconds = retryAfter == null ? NaN : Number(retryAfter);
        const providerDelay = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
        const fallbackDelay = Math.min(60_000, 2_000 * 2 ** attempt);
        const waitMs = Math.min(60_000, Math.max(1_000, Number.isFinite(providerDelay) ? providerDelay : fallbackDelay));
        await retryWait(waitMs + Math.floor(Math.random() * 500));
        continue;
      }
      if (TRANSIENT.has(response.status) && attempt < 2) { await retryWait(900 * (attempt + 1)); continue; }
      const code = [400, 413].includes(response.status) && images.length > 1 ? 'V3_IMAGE_BATCH_TOO_LARGE' : 'V3_AI_REQUEST_FAILED';
      throw Object.assign(new Error(`The AI providers could not complete this request (${response.status}). Retry from this step.`), { code });
    }
    try {
      const payload = await response.json();
      const answer = payload?.choices?.[0]?.message?.content;
      return parseJson(typeof answer === 'string' ? answer : Array.isArray(answer) ? answer.filter(part => part.type === 'text').map(part => part.text).join('') : '');
    } catch (error) {
      if (Number.isFinite(deadline) && Date.now() >= deadline) throw timeoutError();
      if (error.code !== 'V3_INVALID_AI_RESPONSE' && !(error instanceof SyntaxError)) throw error;
      malformedResponses += 1;
      if (malformedResponses < 3 && attempt < 5) continue;
      throw Object.assign(new Error('Veylo could not prepare a usable response. Please retry this step.'), { code: 'V3_INVALID_AI_RESPONSE' });
    }
  }
}

export async function improvePurpose({ purpose }) {
  const original = String(purpose || '').trim();
  const deadline = Date.now() + 45000;
  const timeoutError = () => Object.assign(new Error('The wording service is taking too long. Your original text is unchanged. Please try again.'), { code: 'V3_PURPOSE_TIMEOUT', status: 504 });
  const readSuggestion = result => {
    if (typeof result?.improved !== 'string') return '';
    const raw = result.improved.trim();
    const purposeLine = raw.match(/(?:^|\n)\s*(?:photographer['\u2019]s\s+)?purpose\s*:\s*(.+)/i)?.[1];
    return String(purposeLine || raw).replace(/^\s*(?:improved\s+)?(?:photographer['\u2019]s\s+)?purpose\s*:\s*/i, '').trim();
  };
  const system = 'Edit only the photographer’s purpose below. Return JSON {"improved":"..."}. Improve grammar, punctuation, word order and awkward phrasing so it reads naturally; do not merely change capitalization. Turn an occasion title or awkward fragment into a clear purpose phrase or sentence. For a birthday or anniversary title, express the purpose using celebrating or marking the stated occasion. If a name is followed by an age or occasion without the necessary possessive, add that possessive; adding an apostrophe does not change the name. Preserve all supplied names exactly as written, including unusual spellings, and keep every age, number, date, occasion, relationship and other detail. Do not guess a name or a purpose when it is not supplied. Do not expand a name, add descriptions, invent attendees, feelings, locations, achievements, or turn the text into a caption. Do not infer any missing details. Use the source words where possible; add only the grammar needed to express the same purpose clearly. Keep the meaning and approximate length. Only return unchanged text if it is already a natural purpose phrase or complete sentence, or there is too little content to improve without guessing.';
  const result = await request(system, JSON.stringify({ purpose: original }), { maxTokens: 1000, deadline, timeoutError });
  let improved = readSuggestion(result);
  const issues = purposeWordingIssues(original, improved);
  if (issues.length || improved.toLocaleLowerCase() === original.toLocaleLowerCase()) {
    const retry = await request(
      system + ' The previous attempt was not a usable improvement. Correct missing possessives and express an occasion title as a purpose rather than copying it. Do not borrow any word or name from that attempt. A complete, already clear purpose sentence may stay unchanged.',
      JSON.stringify({ purpose: original, corrections: issues.length ? issues : ['Improve phrasing when needed rather than just repeating a fragment.'] }),
      { maxTokens: 1000, deadline, timeoutError }
    );
    improved = readSuggestion(retry);
  }
  if (purposeWordingIssues(original, improved).length) throw Object.assign(new Error('Veylo could not improve the wording without changing your details. Your original text has been kept. Please try again.'), { code: 'V3_INVALID_AI_RESPONSE', status: 502 });
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
  const imagesPerRequest = 3;
  const parallelRequests = MAX_CONCURRENT_MODEL_REQUESTS;
  const recoverableBatchErrors = new Set(['V3_IMAGE_BATCH_TOO_LARGE', 'V3_INVALID_AI_RESPONSE', 'V3_INCOMPLETE_ANALYSIS']);
  const analyzeBatchWithRecovery = async batch => {
    try {
      return await analyzeBatch(batch, delivery);
    } catch (error) {
      const canSplit = recoverableBatchErrors.has(error.code) || ['TimeoutError', 'AbortError'].includes(error.name);
      if (!canSplit || batch.length <= 1) throw error;
      const midpoint = Math.ceil(batch.length / 2);
      const first = await analyzeBatchWithRecovery(batch.slice(0, midpoint));
      const second = await analyzeBatchWithRecovery(batch.slice(midpoint));
      return [...first, ...second];
    }
  };

  for (let offset = 0; offset < pending.length; offset += imagesPerRequest * parallelRequests) {
    const batches = [];
    const groupEnd = Math.min(offset + imagesPerRequest * parallelRequests, pending.length);
    for (let cursor = offset; cursor < groupEnd; cursor += imagesPerRequest) {
      batches.push(pending.slice(cursor, cursor + imagesPerRequest));
    }

    const results = await Promise.allSettled(batches.map(analyzeBatchWithRecovery));
    let firstError = null;
    for (const result of results) {
      if (result.status === 'rejected') {
        firstError ||= result.reason;
        continue;
      }
      for (const item of result.value) byId.set(item.assetId, item);
    }
    await onProgress(byId.size, assets.length, assets.map(asset => byId.get(asset.assetId)).filter(Boolean));
    if (firstError) throw firstError;
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

export async function groupV3Sections(delivery, rows, selected) {
  if (delivery.format === 'canvas') {
    const system = 'Return JSON {"sections":[{"title":"...","subtitle":"...","assetIds":["..."]}]}. Suggest zero to five useful photo groups for a connected scrolling Canvas. Each group needs at least two related photographs. Leave photographs that do not belong together OUT of sections: they will have individual checkpoints. Use only supplied asset IDs, once at most. Group by visible people together, location, activity or photographic relationship supported by observations. Do not invent a chronology, chapter narrative, personal feelings or event details. The shoot purpose comes first; outfit descriptions should not dominate personal milestone copy. Titles: 2 to 60 characters. Optional notes: up to 120 characters. An empty sections array is valid when individual photos work better. ' + deliveryWritingPolicy(delivery);
    const prompt = 'Authoritative context: ' + narrativeContext(delivery) + '\nPhoto observations: ' + JSON.stringify(rows);
    const deadline = Date.now() + 45000;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await request(system, prompt + (attempt ? '\nRepair invalid memberships or wording. Do not force unrelated photographs into groups.' : ''), { maxTokens: 1500, deadline });
        const sections = result?.sections;
        if (!Array.isArray(sections) || sections.length > 5) continue;
        const grouped = sections.flatMap(section => Array.isArray(section?.assetIds) ? section.assetIds : []);
        if (new Set(grouped).size !== grouped.length || grouped.some(id => !selected.includes(id))) continue;
        if (sections.some(section => !Array.isArray(section.assetIds) || section.assetIds.length < 2 || typeof section.title !== 'string' || section.title.trim().length < 2 || section.title.trim().length > 60 || section.subtitle !== undefined && typeof section.subtitle !== 'string' || String(section.subtitle || '').trim().length > 120 || hasUnsupportedAddress(section.title + '. ' + (section.subtitle || ''), delivery) || hasUnsupportedNumbers(section.title + '. ' + (section.subtitle || ''), delivery) || shootWritingIssues(section.title + '. ' + (section.subtitle || ''), delivery).length)) continue;
        return sections.map((section, index) => ({ id: 'section-' + (index + 1), title: section.title.trim(), subtitle: String(section.subtitle || '').trim(), layout: 'cluster', assetIds: section.assetIds }));
      } catch (error) {
        if (attempt === 2 || Date.now() >= deadline) break;
      }
    }
    // Grouping is optional. All photographs still receive individual checkpoints.
    return [];
  }
  if (!['chapters', 'event-coverage', 'campaign'].includes(delivery.format)) return [{ id: 'showcase', title: 'The photographs', subtitle: '', layout: 'grid', assetIds: selected }];
  const system = 'Return JSON {"sections":[{"title":"...","subtitle":"...","assetIds":["..."]}]}. Group every supplied asset ID into 2 to 5 useful sections. Include each ID exactly once. Section titles maximum 60 characters; subtitles maximum 120. Event Coverage sections should describe real scenes, people or shifts visible in the supplied summaries. Campaign sections should group assets by clear use or visual role. Chapters should mark real changes in outfit, place or activity. Never invent event details or usage rights. ' + deliveryWritingPolicy(delivery);
  const prompt = 'Authoritative context: ' + narrativeContext(delivery) + '\nPhoto observations: ' + JSON.stringify(rows);
  const deadline = Date.now() + 45000;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await request(system, prompt + (attempt ? '\nRepair the incomplete groups or invalid wording. Return every supplied photo exactly once and keep complete text within each section limit.' : ''), { maxTokens: 1800, deadline });
    const sections = Array.isArray(result?.sections) ? result.sections : [];
    const grouped = sections.flatMap(section => Array.isArray(section?.assetIds) ? section.assetIds : []);
    if (sections.length < 2 || sections.length > 5 || grouped.length !== selected.length || new Set(grouped).size !== grouped.length || grouped.some(id => !selected.includes(id))) continue;
    if (sections.some(section => !section?.assetIds?.length || typeof section.title !== 'string' || section.title.trim().length < 2 || section.title.trim().length > 60 || section.subtitle !== undefined && typeof section.subtitle !== 'string' || String(section.subtitle || '').trim().length > 120 || hasUnsupportedAddress(section.title + '. ' + (section.subtitle || ''), delivery) || hasUnsupportedNumbers(section.title + '. ' + (section.subtitle || ''), delivery) || shootWritingIssues(section.title + '. ' + (section.subtitle || ''), delivery).length)) continue;
    return sections.map((section, index) => ({ id: 'section-' + (index + 1), title: section.title.trim(), subtitle: String(section.subtitle || '').trim(), layout: 'grid', assetIds: section.assetIds }));
  }
  throw Object.assign(new Error('The photo groups or their wording need another pass. Retry this step.'), { code: 'V3_INCOMPLETE_SECTIONS', status: 502 });
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
  const clipped = text.slice(0, limit - 1);
  const boundary = clipped.lastIndexOf(' ');
  return (boundary > 0 ? clipped.slice(0, boundary) : clipped).replace(/[\s,;:]+$/, '').replace(/[.!?]+$/, '') + '.';
}

const BIRTHDAY_FALLBACKS = [
  ['A Birthday on Your Terms', 'may the year ahead bring you more time for what you love and more reasons to smile.'],
  ['One for Your Album', 'these portraits are yours to keep and revisit whenever you want to remember this birthday.'],
  ['A Birthday Worth Keeping', 'you have a collection to return to, long after this birthday has passed.'],
  ['Just for You', 'take your time with these portraits. You do not need another occasion to enjoy them.'],
  ['Your Birthday Collection', 'these photographs mark this birthday, with a full gallery for you to explore in your own time.'],
  ['Celebrate Your Own Way', 'take this day for yourself, with space to do what you enjoy and mark it your own way.'],
  ['Keep What Matters Close', 'may you keep close to what matters, try something you want, and give yourself room to enjoy it.'],
  ['A Pace of Your Own', 'may you find a pace that suits you, with time to grow and time to enjoy being here.'],
  ['Wishing You a Good Year', 'here is a wish for good health, good company, and a year you can make your own.'],
  ['More Reasons to Laugh', 'may the year ahead bring laughter, room to rest, and good things for you to look forward to.']
];

function purposeHeadline(delivery, index = 0) {
  if (deliveryWritingContext(delivery).shoot !== 'birthday' || deliveryWritingContext(delivery).separateSubject) return writingFallback(delivery, index).headline;
  const purpose = String(delivery.brief || '').replace(/\s+/g, ' ').trim();
  if (index > 0) {
    const heading = BIRTHDAY_FALLBACKS[index % BIRTHDAY_FALLBACKS.length][0];
    return (index >= 20 ? 'Your Birthday: ' : index >= 10 ? 'For You: ' : '') + heading;
  }
  const fallback = purpose && wordCount(purpose) === 1 && delivery.clientName
    ? String(delivery.clientName).trim() + "'s " + purpose
    : purpose || [delivery.clientName, delivery.shootType, 'Photographs'].filter(Boolean).join(' ');
  const bounded = fallback.split(/\s+/).slice(0, 7).join(' ');
  return fitText(bounded.charAt(0).toLocaleUpperCase() + bounded.slice(1), 70);
}

function purposeCaption(delivery, limit, index = 0) {
  if (deliveryWritingContext(delivery).shoot !== 'birthday' || deliveryWritingContext(delivery).separateSubject) return writingFallback(delivery, index, limit).caption;
  const purpose = String(delivery.brief || '').replace(/\s+/g, ' ').trim();
  if (deliveryWritingContext(delivery).shoot === 'birthday') {
    const normalized = normalizeOccasionNumbers(purpose);
    const age = Number(normalized.match(/\b(\d{1,3})(?:st|nd|rd|th)?\s+birthday\b/)?.[1] || normalized.match(/\b(?:turning|turns|turned)\s+(\d{1,3})\b/)?.[1] || 0);
    const suffix = age % 100 >= 11 && age % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[age % 10] || 'th');
    const birthday = 'your ' + (age ? age + suffix + ' ' : '') + 'birthday';
    const prefix = limit === 150 && index >= 10
      ? (index >= 20 ? 'To mark ' : 'For ') + birthday + ', '
      : index >= 20 ? 'For the year ' + birthday + ' begins, ' : index >= 10 ? 'As you celebrate ' + birthday + ', ' : 'On ' + birthday + ', ';
    return prefix + BIRTHDAY_FALLBACKS[index % BIRTHDAY_FALLBACKS.length][1];
  }
  if (!purpose) return fitText('Your finished photographs are ready to revisit whenever you want, with the full collection gathered here for you to view and share.', limit);
  const suffix = ', giving you finished photographs to revisit whenever you want to remember the occasion.';
  return 'This collection marks ' + fitText(purpose, Math.max(16, limit - 22 - suffix.length)).replace(/[.!?]+$/, '') + suffix;
}

function bookendMessage(value, delivery, limit, opening) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length >= 5 && text.length <= limit && !hasUnsupportedAddress(text, delivery) && !hasUnsupportedNumbers(text, delivery) && !hasUnsupportedGathering(text, delivery) && !describesPhoto(text, delivery) && !shootWritingIssues(text, delivery).length) return text;
  // Return a complete sentence instead of clipping a longer AI thought halfway.
  if (deliveryWritingContext(delivery).shoot === 'birthday' && !deliveryWritingContext(delivery).separateSubject) return opening
    ? 'Your birthday is worth taking a moment for. These photographs are here for you to enjoy, in your own time.'
    : 'May the year ahead bring you more of what matters to you. Your full birthday gallery is ready whenever you are.';
  return opening
    ? 'Your photographs are ready. Take your time with this collection, then open the full gallery whenever you want.'
    : 'Your full gallery is ready. Keep the photographs you love and come back to them whenever you want.';
}

function headlineNeedsRepair(value) {
  const headline = String(value || '').trim();
  return wordCount(headline) < 2 || wordCount(headline) > 7 || headline.length > 70
    || /^(?:the\s+(?:photograph|photo|image|moment|year ahead|next chapter)|a\s+(?:photograph|photo|moment|day to remember)|photo\s*#?\s*\d+|a beautiful memory|special moments?|new beginnings?)\b/i.test(headline);
}

function purposeTokens(delivery) {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'you', 'our', 'their', 'was', 'were', 'are', 'into', 'over', 'under', 'through', 'about', 'photograph', 'photographs', 'photo', 'photos', 'image', 'images', 'gallery', 'collection', 'delivery', 'shoot', 'session']);
  const normalize = value => normalizeOccasionNumbers(value)
    .replace(/\b(\d+)(?:st|nd|rd|th)\b/g, '$1')
    .replace(/[’']s\b/gi, '')
    .replace(/[’']/g, '')
    .match(/[a-z0-9]+/g) || [];
  const clientTokens = normalize(delivery.clientName);
  const briefTokens = normalize(`${delivery.brief || ''} ${delivery.shootType || ''}`);
  return new Set([...clientTokens, ...briefTokens].filter(token => clientTokens.includes(token) || (/^\d+$/.test(token) || token.length > 2) && !stopWords.has(token)));
}

function headlineHasPurposeAnchor(value, delivery, caption = '') {
  // The headline and caption form one message. Requiring a name or birthday in
  // both fields discards natural direct addresses and repeats the same heading.
  return textHasPurposeAnchor(value + ' ' + caption, delivery);
}

function textHasPurposeAnchor(value, delivery) {
  if (supportsVisualWriting(delivery)) return true;
  const anchors = purposeTokens(delivery);
  if (!anchors.size) return true;
  const tokens = normalizeOccasionNumbers(value)
    .replace(/\b(\d+)(?:st|nd|rd|th)\b/g, '$1')
    .replace(/[’']s\b/gi, '')
    .replace(/[’']/g, '')
    .match(/[a-z0-9]+/g) || [];
  return tokens.some(token => anchors.has(token));
}

function normalizeOccasionNumbers(value) {
  const units = { one: 1, first: 1, two: 2, second: 2, three: 3, third: 3, four: 4, fourth: 4, five: 5, fifth: 5, six: 6, sixth: 6, seven: 7, seventh: 7, eight: 8, eighth: 8, nine: 9, ninth: 9 };
  const tens = { twenty: 20, twentieth: 20, thirty: 30, thirtieth: 30, forty: 40, fortieth: 40, fifty: 50, fiftieth: 50, sixty: 60, sixtieth: 60, seventy: 70, seventieth: 70, eighty: 80, eightieth: 80, ninety: 90, ninetieth: 90 };
  const teens = { ten: 10, tenth: 10, eleven: 11, eleventh: 11, twelve: 12, twelfth: 12, thirteen: 13, thirteenth: 13, fourteen: 14, fourteenth: 14, fifteen: 15, fifteenth: 15, sixteen: 16, sixteenth: 16, seventeen: 17, seventeenth: 17, eighteen: 18, eighteenth: 18, nineteen: 19, nineteenth: 19 };
  const pattern = new RegExp('\\b(' + Object.keys(tens).join('|') + ')(?:[-\\s]+(' + Object.keys(units).join('|') + '))?\\b|\\b(' + Object.keys(teens).join('|') + ')\\b', 'g');
  return String(value || '').toLocaleLowerCase().replace(pattern, (_match, ten, unit, teen) => String(teen ? teens[teen] : tens[ten] + (units[unit] || 0)));
}

function hasUnsupportedNumbers(value, delivery) {
  const known = new Set(normalizeOccasionNumbers(`${delivery.brief || ''} ${delivery.shootType || ''}`).match(/\b\d+(?:st|nd|rd|th)?\b/g)?.map(number => parseInt(number, 10)) || []);
  const numbers = normalizeOccasionNumbers(value).match(/\b\d+(?:st|nd|rd|th)?\b/g) || [];
  return numbers.some(number => !known.has(parseInt(number, 10)));
}

function substantialCaption(value, delivery, limit, headline = '', index = 0) {
  const caption = String(value || '').trim();
  return caption.length < 5 || caption.length > limit || !textHasPurposeAnchor(headline + ' ' + caption, delivery) || hasUnsupportedAddress(caption, delivery) || hasUnsupportedNumbers(caption, delivery) || describesPhoto(caption, delivery) || shootWritingIssues(caption, delivery, { caption: true }).length || hasUnsupportedGathering(headline + '. ' + caption, delivery) || !addressesRecipient(caption, delivery) ? purposeCaption(delivery, limit, index) : caption;
}

function addressesRecipient(value, delivery) {
  return !requiresDirectAddress(delivery) || /\b(?:you|your|yours|yourself|yourselves)\b/i.test(String(value || ''));
}

function hasUnsupportedGathering(value, delivery) {
  const purpose = String(delivery.brief || '');
  if (/\b(?:family|friends|guests|party|people|loved ones|gathering|gathered|together)\b/i.test(purpose)) return false;
  return String(value || '').split(/[.!?]+/).some(sentence => {
    if (deliveryWritingContext(delivery).style === 'documentary' && !/\b(?:family|friends|loved ones)\b/i.test(sentence)) return false;
    if (!/\b(?:everyone|everybody|guests?|family|friends|loved ones|people|surrounded|gathered|came together|we all|us all)\b/i.test(sentence)) return false;
    // Future wishes can mention company; supplied occasion facts are still
    // required for claims about people being present at this shoot.
    const wish = /\b(?:may|hope|wish|will|coming year|year ahead)\b/i.test(sentence);
    const assertion = /\b(?:here|came|joined|did|were|was|have been|celebrated|surrounded|gathered)\b/i.test(sentence);
    return !wish || assertion;
  });
}

// Full vision summaries belong to selection and grouping. Caption writing only
// needs a small visible cue; passing the summary makes props and clothes the story.
function captionCue(insight, delivery) {
  const summary = String(insight?.summary || '');
  if (delivery && supportsVisualWriting(delivery)) return summary.slice(0, 600);
  const sentences = summary.split(/[.!?\n]+/).filter(sentence => !/\b(?:not|no|without|unclear|cannot|can't|unable)\b/i.test(sentence));
  if (sentences.some(sentence => /\b(?:laughs?|laughing|laughter)\b/i.test(sentence))) return 'visible laughter';
  if (sentences.some(sentence => /\b(?:smiles?|smiling)\b/i.test(sentence))) return 'visible smile';
  return '';
}

function describesPhoto(value, delivery) {
  if (supportsVisualWriting(delivery)) return false;
  // These are descriptions of a shot, not a message about why it was made.
  // A product or outfit explicitly named in a commercial brief remains usable.
  const normalizeDetail = text => String(text || '').toLocaleLowerCase().replace(/-/g, ' ').replace(/\b([a-z]+)s\b/g, '$1').replace(/\s+/g, ' ').trim();
  const supplied = ' ' + normalizeDetail(delivery.brief) + ' ';
  const text = String(value || '').replace(/\bsuits?\s+(?:you|your|them|their|me|my|us|our)\b/gi, '').replace(/\bholding\s+(?:on(?:to)?|to)\b/gi, '');
  const details = text.match(/\b(?:backdrops?|backgrounds?|foreground|lighting|composition|bokeh|lens|camera|close[- ]up|full[- ]length|soft focus|black[- ]and[- ]white|outfits?|wardrobe|dresses?|gowns?|suits?|blazers?|earrings?|pearls?|sunglasses|velvet|linen|jumpsuits?|sleeveless|telephone|newspaper|polaroid|miniature figure|candles?|cakes?|balloons?|confetti|champagne)\b/gi) || [];
  return details.some(detail => !supplied.includes(' ' + normalizeDetail(detail) + ' '))
    || /\b(?:wearing|posing|posed|seated|holding|lying back|in hand|looking at the camera|looks at the camera)\b/i.test(text)
    || /\b(?:smile|laughter)(?:\s+(?:today|here))?\s+(?:shows?|says?|proves?|reveals?|means?)\b/i.test(text);
}

// Detect explicit personal addresses, without requiring every caption to repeat a name.
// A purpose can name someone other than the paying client; both are authoritative.
function hasUnsupportedAddress(value, delivery) {
  const known = new Set(String([delivery.clientName, delivery.brief].filter(Boolean).join(' ')).toLocaleLowerCase().match(/[\p{L}\p{M}]+/gu) || []);
  const ordinaryWords = new Set(['it', 'that', 'what', 'here', 'there', 'let', 'life', 'today', 'tomorrow', 'yesterday', 'everyone', 'someone', 'anyone', 'nobody', 'nothing', 'everything', 'something', 'now', 'together', 'still', 'finally', 'first', 'next', 'sometimes', 'often']);
  const text = String(value || '');
  const addresses = [...text.matchAll(/(?:^|[.!?]\s+)([\p{Lu}][\p{L}\p{M}-]+),\s+(?:you|your|this|turning|may|take|here|today|on)\b/gu), ...text.matchAll(/\b([\p{Lu}][\p{L}\p{M}-]+)['’]s\b/gu)];
  return addresses.some(match => {
    const address = match[1].toLocaleLowerCase();
    const parts = address.match(/[\p{L}\p{M}]+/gu) || [];
    return !ordinaryWords.has(address) && !parts.every(part => known.has(part));
  });
}

function narrativeContext(delivery) {
  return JSON.stringify(deliveryWritingContext(delivery));
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
  return headlineNeedsRepair(headline) || !headlineHasPurposeAnchor(headline, delivery, caption)
    || describesPhoto(headline + '. ' + caption, delivery)
    || hasUnsupportedGathering(headline + '. ' + caption, delivery)
    || hasUnsupportedNumbers(headline + '. ' + caption, delivery)
    || !addressesRecipient(caption, delivery)
    || hasUnsupportedAddress(headline + '. ' + caption, delivery)
    || shootWritingIssues(caption, delivery, { caption: true }).length > 0
    || shootWritingIssues(headline, delivery).length > 0
    || caption.toLocaleLowerCase() === headline.toLocaleLowerCase()
    || caption.length < 5
    || caption.length > (format === 'photo-story' ? 150 : 180);
}

function needsNarrativeRepair(frames, selected, format, delivery) {
  const keys = frames.map(frame => String(frame?.headline || '').trim().toLocaleLowerCase());
  const captionKeys = frames.map(frame => String(frame?.caption || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase());
  return frames.length !== selected.length || frames.some(frame => frameNeedsRepair(frame, format, delivery))
    || new Set(captionKeys).size !== captionKeys.length
    || new Set(keys).size !== keys.length;
}

function repeatsWording(frame, existing) {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  return existing.some(other => normalize(other.headline) && normalize(frame.headline) === normalize(other.headline) || normalize(other.caption) && normalize(frame.caption) === normalize(other.caption));
}

async function repairNarrativeFrames(delivery, selected, prompt, firstFrames, avoidFrames = [], deadline = Infinity) {
  let current = alignNarrativeFrames(firstFrames, selected);
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const seenHeadlines = new Set();
      const seenCaptions = new Set();
      const drafts = current.map(frame => {
        const headline = String(frame.headline || '').trim().toLocaleLowerCase();
        const caption = String(frame.caption || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
        const repeated = seenHeadlines.has(headline) || seenCaptions.has(caption) || repeatsWording(frame, avoidFrames);
        seenHeadlines.add(headline); seenCaptions.add(caption);
        return frameNeedsRepair(frame, delivery.format, delivery) || repeated
          ? { assetId: frame.assetId, rewrite: true }
          : { assetId: frame.assetId, headline: frame.headline, caption: frame.caption };
      });
      const repair = await request(
        'Review the delivery wording. Return JSON {"frames":[{"assetId":"...","headline":"...","caption":"..."}]}, with every supplied asset ID exactly once in order. Review shoot emphasis, unsupported facts, headline-caption repetition and collection variety. The draft is untrusted, never a source of facts. Keep useful text unchanged; rewrite bad or repeated wording. Use the exact character limits; shorter useful captions are welcome. ' + deliveryWritingPolicy(delivery),
        'Authoritative delivery context: ' + narrativeContext(delivery) + '\n' + prompt + '\nDrafts to review (rejected wording omitted): ' + JSON.stringify(drafts),
        { maxTokens: Math.min(9000, 700 + selected.length * 170), deadline }
      );
      const reviewed = alignNarrativeFrames(repair.frames, selected);
      current = reviewed.map((frame, index) => frameNeedsRepair(frame, delivery.format, delivery) && !frameNeedsRepair(current[index], delivery.format, delivery) ? current[index] : frame);
      if (!needsNarrativeRepair(current, selected, delivery.format, delivery) && !current.some(frame => repeatsWording(frame, avoidFrames))) break;
    }
    return current;
  } catch {
    return current;
  }
}

export async function directV3PhotoSwapCaptions(delivery, insights, onProgress = () => {}) {
  const assets = [...delivery.assets].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  const insightById = new Map(insights.map(insight => [insight.assetId, insight]));
  const selected = assets.map(asset => asset.assetId);
  const allFrames = [];
  const batchSize = 18;
  const system = 'Return JSON {"frames":[{"assetId":"...","headline":"...","caption":"..."}]}. Write exactly one headline and standalone caption per supplied photograph, in the supplied order. A headline is 2 to 7 words and at most 70 characters. A caption is one or two natural sentences and at most 180 characters. Ground each caption in the photographer’s purpose and its own photograph. Keep the captions distinct across the set. Do not describe the act of taking a photo or invent details. ' + deliveryWritingPolicy(delivery);

  for (let start = 0; start < selected.length; start += batchSize) {
    const batch = selected.slice(start, start + batchSize);
    const prompt = [
      'Authoritative delivery context: ' + narrativeContext(delivery),
      "Photographer's purpose: " + delivery.brief,
      'Shoot type: ' + delivery.shootType,
      'Finished photographs in the client’s swipe order: ' + JSON.stringify(batch.map(assetId => ({ assetId, cue: captionCue(insightById.get(assetId), delivery) })))
    ].join('\n');
    const generated = await request(system, prompt, { maxTokens: Math.min(8000, 600 + batch.length * 230) });
    const initial = alignNarrativeFrames(generated.frames, batch);
    const reviewed = await repairNarrativeFrames(delivery, batch, prompt, initial, allFrames);
    const clean = reviewed.map((frame, index) => {
      const rawHeadline = String(frame?.headline || '').replace(/^\s*headline\s*:\s*/i, '').trim();
      const rawCaption = String(frame?.caption || '').replace(/^\s*caption\s*:\s*/i, '').trim();
      const headline = fitText(
        shootWritingIssues(rawHeadline, delivery).length || headlineNeedsRepair(rawHeadline)
          || !headlineHasPurposeAnchor(rawHeadline, delivery, rawCaption)
          || hasUnsupportedAddress(rawHeadline + '. ' + rawCaption, delivery)
          || hasUnsupportedNumbers(rawHeadline + '. ' + rawCaption, delivery)
          || describesPhoto(rawHeadline, delivery)
          || hasUnsupportedGathering(rawHeadline + '. ' + rawCaption, delivery)
          ? purposeHeadline(delivery, start + index) : rawHeadline,
        70
      );
      const caption = substantialCaption(rawCaption, delivery, 180, headline, start + index);
      return { assetId: batch[index], headline, caption };
    });
    for (const frame of clean) {
      if (repeatsWording(frame, allFrames)) {
        const fallback = writingFallback(delivery, allFrames.length, 180);
        frame.headline = fitText(fallback.headline, 70);
        frame.caption = fallback.caption;
      }
      allFrames.push(frame);
    }
    await onProgress(Math.min(start + batch.length, selected.length), selected.length);
  }
  return allFrames;
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
  if (delivery.format === 'editorial') {
    const direction = await writeEditorialDirection(request, delivery, rows, selected, text => hasUnsupportedAddress(text, delivery) || hasUnsupportedNumbers(text, delivery) || hasUnsupportedGathering(text, delivery));
    const visual = await request('Return JSON {"palette":{"background":"#hex","surface":"#hex","text":"#hex","accent":"#hex"},"typography":{"display":"Playfair Display","body":"Outfit"}}. Choose a readable magazine palette from the photograph colours; do not recolour photographs. Fonts: Playfair Display, Outfit, Plus Jakarta Sans, Cormorant Garamond, DM Sans, Libre Baskerville, Manrope.', JSON.stringify(rows.map(row => ({ colors: row.colors }))), { maxTokens: 450 });
    const palette = Object.fromEntries(Object.keys(V3_DEFAULT_PALETTE).map(key => [key, /^#[0-9a-f]{6}$/i.test(visual?.palette?.[key]) ? visual.palette[key] : V3_DEFAULT_PALETTE[key]]));
    if (contrastRatio(palette.background, palette.text) < 4.5 || contrastRatio(palette.surface, palette.text) < 4.5) {
      const readable = ['#ffffff', '#101010'].find(color => contrastRatio(palette.background, color) >= 4.5 && contrastRatio(palette.surface, color) >= 4.5);
      if (readable) palette.text = readable;
      else Object.assign(palette, V3_DEFAULT_PALETTE);
    }
    return { selected, openingAssetId, closingAssetId, direction: { ...direction, assetOrder: selected, palette, typography: { display: V3_FONT_CHOICES.has(visual?.typography?.display) ? visual.typography.display : 'Playfair Display', body: V3_FONT_CHOICES.has(visual?.typography?.body) ? visual.typography.body : 'Outfit' } } };
  }
  const captionLimit = delivery.format === 'photo-story' ? 150 : 180;
  const narrativeSystem = 'Return JSON {"title":"...","openingLine":"...","closingLine":"...","frames":[{"assetId":"...","headline":"...","caption":"..."}]}. Include exactly one frame per supplied asset ID in the same order. The title is at most 80 characters, the opening at most 140 characters, and the closing at most 160 characters. Opening and closing must be distinct, complete messages that fit these limits without cutting off a thought. ' + deliveryWritingPolicy(delivery);
  const narrativePrompt = [
    'Authoritative delivery context: ' + narrativeContext(delivery),
    "Photographer's purpose: " + delivery.brief,
    'Shoot type (guides the writing focus): ' + delivery.shootType,
    'Format: ' + delivery.format,
    'Selected photographs in order (supporting observations appropriate to this shoot): ' + JSON.stringify(selected.map(assetId => ({ assetId, cue: captionCue(rows.find(row => row.assetId === assetId), delivery) })))
  ].join('\n');
  let narrative = await request(narrativeSystem, narrativePrompt, { maxTokens: Math.min(12000, 1200 + selected.length * 220) });
  let responseFrames = alignNarrativeFrames(narrative.frames, selected);
  const reviewedFrames = alignNarrativeFrames(await repairNarrativeFrames(delivery, selected, narrativePrompt, responseFrames), selected);
  responseFrames = reviewedFrames.map((frame, index) => frameNeedsRepair(frame, delivery.format, delivery) && !frameNeedsRepair(responseFrames[index], delivery.format, delivery) ? responseFrames[index] : frame);
  const captions = responseFrames.map((frame, index) => {
    const rawHeadline = String(frame?.headline || '').replace(/^\s*headline\s*:\s*/i, '').trim();
    const rawCaption = String(frame?.caption || '').replace(/^\s*caption\s*:\s*/i, '').trim();
    const headline = fitText(shootWritingIssues(rawHeadline, delivery).length || headlineNeedsRepair(rawHeadline) || !headlineHasPurposeAnchor(rawHeadline, delivery, rawCaption) || hasUnsupportedAddress(rawHeadline + '. ' + rawCaption, delivery) || hasUnsupportedNumbers(rawHeadline, delivery) || describesPhoto(rawHeadline, delivery) || hasUnsupportedGathering(rawHeadline, delivery) ? purposeHeadline(delivery, index) : rawHeadline, 70);
    const caption = substantialCaption(rawCaption, delivery, captionLimit, headline, index);
    return { assetId: selected[index], headline, caption, textAnimation: delivery.format === 'photo-story' ? 'typewriter' : 'word_fade_up' };
  });
  {
    const accepted = [];
    for (const frame of captions) {
      if (repeatsWording(frame, accepted)) {
        for (let index = 0; index < V3_FORMATS['event-coverage'][1]; index += 1) {
          const fallback = { headline: purposeHeadline(delivery, index), caption: purposeCaption(delivery, captionLimit, index) };
          if (!repeatsWording(fallback, accepted)) { Object.assign(frame, fallback); break; }
        }
      }
      accepted.push(frame);
    }
  }
  const visual = await request('Return JSON {"palette":{"background":"#hex","surface":"#hex","text":"#hex","accent":"#hex"},"typography":{"display":"Playfair Display","body":"Outfit"}}. Choose a readable palette from the supplied image colours. Do not write or change the title, opening, closing, headlines, or captions. Typography must use Playfair Display, Outfit, Plus Jakarta Sans, Cormorant Garamond, DM Sans, Libre Baskerville, or Manrope.', 'Image colours: ' + JSON.stringify(rows.map(({ assetId, colors }) => ({ assetId, colors }))) + '\nFormat: ' + delivery.format, { maxTokens: 450 });
  const result = { ...narrative, palette: visual.palette, typography: visual.typography };
  const palette = Object.fromEntries(Object.keys(V3_DEFAULT_PALETTE).map(key => [key, /^#[0-9a-f]{6}$/i.test(result.palette?.[key]) ? result.palette[key] : V3_DEFAULT_PALETTE[key]]));
  if (contrastRatio(palette.background, palette.text) < 4.5 || contrastRatio(palette.surface, palette.text) < 4.5) {
    const readable = ['#ffffff', '#101010'].find(color => contrastRatio(palette.background, color) >= 4.5 && contrastRatio(palette.surface, color) >= 4.5);
    if (readable) palette.text = readable;
    else { palette.background = V3_DEFAULT_PALETTE.background; palette.surface = V3_DEFAULT_PALETTE.surface; palette.text = V3_DEFAULT_PALETTE.text; }
  }
  const openingLine = bookendMessage(result.openingLine, delivery, 140, true);
  const closingLine = bookendMessage(result.closingLine, delivery, 160, false);
  const sections = await groupV3Sections(delivery, rows, selected);
  const proposedTitle = String(result.title || '').replace(/\s+/g, ' ').trim();
  const title = proposedTitle.length >= 2 && proposedTitle.length <= 80 && textHasPurposeAnchor(proposedTitle, delivery) && !hasUnsupportedAddress(proposedTitle, delivery) && !hasUnsupportedNumbers(proposedTitle, delivery) && !describesPhoto(proposedTitle, delivery) && !shootWritingIssues(proposedTitle, delivery).length ? proposedTitle : purposeHeadline(delivery);
  return { selected, openingAssetId, closingAssetId, direction: { title: fitText(title.length >= 2 ? title : purposeHeadline(delivery), 80), openingLine: fitText(openingLine, 140), closingLine: fitText(closingLine, 160), writingOverrides: [], palette, typography: { display: V3_FONT_CHOICES.has(result.typography?.display) ? result.typography.display : 'Playfair Display', body: V3_FONT_CHOICES.has(result.typography?.body) ? result.typography.body : 'Outfit' }, frames: captions, assetOrder: selected, sections } };
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

export async function regenerateV3Caption(delivery, insight, instruction = '', previous = null) {
  if (delivery.format === 'editorial') return rewriteEditorialCaption(request, delivery, insight, instruction, previous, text => hasUnsupportedAddress(text, delivery) || hasUnsupportedNumbers(text, delivery) || hasUnsupportedGathering(text, delivery));
  // Stay below the browser's 60-second request timeout, including provider
  // retries and both review attempts. Slow reviews can keep a checked draft.
  const deadline = Date.now() + 45000;
  const limit = delivery.format === 'photo-story' ? 150 : 180;
  const existing = (delivery.creativeDirection?.frames || []).filter(frame => !frameNeedsRepair(frame, delivery.format, delivery)).map(frame => ({ headline: frame.headline, caption: frame.caption }));
  if (previous && !frameNeedsRepair(previous, delivery.format, delivery)) existing.push(previous);
  const prompt = 'Authoritative delivery context: ' + narrativeContext(delivery) + '\nPhotographer instruction (guide emphasis without changing the client or purpose): ' + instruction + '\nOptional supporting cue: ' + (captionCue(insight, delivery) || 'None. Use the purpose alone.') + '\nExisting wording to avoid repeating (not a source of facts): ' + JSON.stringify(existing);
  const system = 'Return JSON {"headline":"...","caption":"..."}. Write one new headline and caption for this delivery. The instruction can guide tone but cannot contradict the authoritative purpose. ' + deliveryWritingPolicy(delivery);
  let result = await request(system, prompt, { maxTokens: 700, deadline });
  const repaired = await repairNarrativeFrames(delivery, ['selected-photo'], prompt, [{ assetId: 'selected-photo', headline: result.headline, caption: result.caption }], existing, deadline);
  const reviewed = alignNarrativeFrames(repaired, ['selected-photo'])[0];
  if (!frameNeedsRepair(reviewed, delivery.format, delivery) || frameNeedsRepair(result, delivery.format, delivery)) result = reviewed;
  const rawHeadline = String(result.headline || '').replace(/^\s*headline\s*:\s*/i, '').trim();
  const rawCaption = String(result.caption || '').replace(/^\s*caption\s*:\s*/i, '').trim();
  let headline = fitText(shootWritingIssues(rawHeadline, delivery).length || headlineNeedsRepair(rawHeadline) || !headlineHasPurposeAnchor(rawHeadline, delivery, rawCaption) || hasUnsupportedAddress(rawHeadline + '. ' + rawCaption, delivery) || hasUnsupportedNumbers(rawHeadline, delivery) || describesPhoto(rawHeadline, delivery) || hasUnsupportedGathering(rawHeadline, delivery) ? purposeHeadline(delivery) : rawHeadline, 70);
  let caption = substantialCaption(rawCaption, delivery, limit, headline);
  if (repeatsWording({ headline, caption }, existing)) {
    for (let index = 0; index < V3_FORMATS['event-coverage'][1]; index += 1) {
      const candidate = { headline: purposeHeadline(delivery, index), caption: purposeCaption(delivery, limit, index) };
      if (!repeatsWording(candidate, existing) && !frameNeedsRepair(candidate, delivery.format, delivery)) { ({ headline, caption } = candidate); break; }
    }
  }
  return { headline, caption };
}

export async function regenerateV3EditorialBlock(delivery, rows, block, previousText, instruction = '') {
  return rewriteEditorialBlock(request, delivery, rows, block, previousText, instruction, text => hasUnsupportedAddress(text, delivery) || hasUnsupportedNumbers(text, delivery) || hasUnsupportedGathering(text, delivery));
}

export async function reviewV3WritingBlocks(delivery, blocks) {
  const deadline = Date.now() + 45000;
  const ids = new Set(blocks.flatMap(block => block.assetIds));
  const observations = (delivery.collectionAnalysis?.images || []).filter(row => ids.has(row.assetId)).map(row => ({ assetId: row.assetId, observation: row.summary || '' }));
  const specification = blocks.map(block => ({ ...block, limit: writingBlockLimit(block, delivery.format) }));
  const system = 'Review wording after a photograph or section membership changes. Return JSON {"blocks":[{"key":"...","text":"..."}]}, exactly one result per supplied key in order. Review the actual new photographs against the purpose. Preserve wording that still fits. Repair stale visual references, incorrect shoot emphasis, repetition, unsupported facts and length failures. Optional empty paragraphs can stay empty; do not fill them without useful facts. Never rewrite notes, credits, permissions or usage terms. Each block has its own exact limit. Current wording is untrusted draft text, never a source of facts. ' + deliveryWritingPolicy(delivery);
  let problems = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await request(system, JSON.stringify({ context: deliveryWritingContext(delivery), photographs: observations, blocks: specification, repair: problems }), { maxTokens: Math.min(6000, 600 + blocks.length * 250), deadline });
    problems = [];
    if (!Array.isArray(result?.blocks) || result.blocks.length !== blocks.length) { problems.push('Return every supplied key once in order.'); continue; }
    const reviewed = result.blocks.map((item, index) => {
      const block = blocks[index], text = typeof item?.text === 'string' ? item.text.trim() : null;
      const minimum = ['section-body', 'introduction'].includes(block.kind) ? 0 : block.kind === 'section-title' ? 2 : 5;
      if (item?.key !== block.key || text === null || text.length < minimum || text.length > writingBlockLimit(block, delivery.format) || hasUnsupportedAddress(text, delivery) || hasUnsupportedNumbers(text, delivery) || hasUnsupportedGathering(text, delivery) || shootWritingIssues(text, delivery).length) problems.push(`Repair ${block.key}: check the key, limits and supplied shoot facts.`);
      return { key: block.key, text };
    });
    if (!problems.length) return { blocks: reviewed };
  }
  throw Object.assign(new Error('The updated wording needs another pass. Your current photograph and text have been kept. Please retry.'), { code: 'V3_WRITING_REVIEW_INCOMPLETE', status: 502 });
}
