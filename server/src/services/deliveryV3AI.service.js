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
  const result = await request('Return JSON {"images":[{"index":0,"summary":"visible facts only","score":1,"colors":["#hex"],"momentTags":["portraits"]}]}. Describe each supplied image by its numeric index. Include every index exactly once. Score visual showcase suitability 1-10 based on image quality, variety and clear subject. Return up to three short, reusable visual tags for practical client navigation, such as portraits, people together, ceremony, dancing, clothing, or details. Describe visible scenes only. Do not identify people or infer names, ages, relationships, emotions, or event facts from pixels. Never use face recognition. If an image cannot be seen, say so and score 1.', `Shoot type: ${context.shootType}. Purpose: ${context.brief}. Images in order: ${JSON.stringify(descriptors)}`, { images: batch, maxTokens: Math.min(25000, 280 * batch.length) });
  const rows = Array.isArray(result.images) ? result.images : [];
  if (rows.length !== batch.length) throw Object.assign(new Error('Some photographs were not analysed. Retry this step.'), { code: 'V3_INCOMPLETE_ANALYSIS' });
  const byIndex = new Map(rows.map(row => [Number(row.index), row]));
  if (byIndex.size !== batch.length || batch.some((_, index) => !byIndex.has(index))) throw Object.assign(new Error('Some photographs were not analysed. Retry this step.'), { code: 'V3_INCOMPLETE_ANALYSIS' });
  return batch.map((asset, index) => ({ assetId: asset.assetId, summary: String(byIndex.get(index).summary || '').slice(0, 220), score: Math.max(1, Math.min(10, Number(byIndex.get(index).score) || 1)), colors: (Array.isArray(byIndex.get(index).colors) ? byIndex.get(index).colors : []).filter(color => /^#[0-9a-f]{6}$/i.test(color)).slice(0, 4), momentTags: (Array.isArray(byIndex.get(index).momentTags) ? byIndex.get(index).momentTags : []).map(value => String(value).toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().slice(0, 32)).filter(Boolean).slice(0, 3) }));
}

export async function analyzeAllV3(delivery, onProgress = async () => {}) {
  const assets = [...delivery.assets].sort((a, b) => a.sortOrder - b.sortOrder);
  const known = new Set(assets.map(asset => asset.assetId));
  const byId = new Map((delivery.collectionAnalysis?.images || []).filter(item => known.has(item.assetId)).map(item => [item.assetId, item]));
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
  return assets.map(asset => byId.get(asset.assetId));
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

function buildPinboardLayouts(assets, moments, suggestions) {
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
    balanced: ['A balanced flow', 'Portrait and landscape frames take turns where the set allows it.'],
    moments: ['Moments together', 'Photos from the same scenes sit near one another.'],
    'colour-flow': ['Follow the colour', 'A gentle colour sequence gives the board its own rhythm.']
  };
  return [
    { id: 'balanced', title: suggestions.balanced?.title || names.balanced[0], description: suggestions.balanced?.description || names.balanced[1], assetOrder: balanced.map(asset => asset.assetId) },
    { id: 'moments', title: suggestions.moments?.title || names.moments[0], description: suggestions.moments?.description || names.moments[1], assetOrder: momentOrder.map(asset => asset.assetId) },
    { id: 'colour-flow', title: suggestions['colour-flow']?.title || names['colour-flow'][0], description: suggestions['colour-flow']?.description || names['colour-flow'][1], assetOrder: colorOrder.map(asset => asset.assetId) }
  ];
}

export async function directV3Pinboard(delivery, insights) {
  const assets = [...delivery.assets].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  const insightById = new Map(insights.map(row => [row.assetId, row]));
  const rows = assets.map(asset => {
    const insight = insightById.get(asset.assetId) || {};
    asset.analysis = insight;
    return { assetId: asset.assetId, shape: Number(asset.width || 0) && Number(asset.height || 0) ? Number(asset.width) >= Number(asset.height) ? 'landscape' : 'portrait' : 'unknown', summary: insight.summary || '', colors: (insight.colors || []).slice(0, 3), momentTags: (insight.momentTags || []).slice(0, 3) };
  });
  const fallbackGroups = new Map();
  for (const row of rows) for (const tag of row.momentTags) {
    if (!fallbackGroups.has(tag)) fallbackGroups.set(tag, []);
    fallbackGroups.get(tag).push(row.assetId);
  }
  const compact = rows.map(({ assetId, shape, summary, colors, momentTags }) => ({ assetId, shape, summary, colors, momentTags }));
  let generated = {};
  try {
    generated = await request(
      'Return JSON {"moments":[{"title":"...","assetIds":["known-id"]}],"layouts":[{"id":"balanced","title":"...","description":"..."}],"palette":{"background":"#hex","surface":"#hex","text":"#hex","accent":"#hex"},"typography":{"display":"Playfair Display","body":"Outfit"}}. Create up to six useful groups of photographs based on visible subjects, activity, setting, or details. Use only supplied asset IDs and include at least two IDs in each group. A photograph may appear in more than one group. Do not identify people, infer family or other relationships, names, ages, or private traits. Do not use face recognition. Create exactly three board suggestions, one each for balanced, moments, and colour-flow. The names and short descriptions should reflect this collection without inventing facts. Choose a readable palette based on the supplied colours. Typography must use Playfair Display, Outfit, Plus Jakarta Sans, Cormorant Garamond, DM Sans, Libre Baskerville, or Manrope. Keep every supplied photograph in the board; these suggestions only affect presentation.',
      ['Photographer context: ' + String(delivery.brief || '').slice(0, 600), 'Shoot type: ' + String(delivery.shootType || '').slice(0, 100), 'Photographs: ' + JSON.stringify(compact)].join('\n'),
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
  const layoutSuggestions = {};
  for (const row of Array.isArray(generated.layouts) ? generated.layouts : []) {
    if (!['balanced', 'moments', 'colour-flow'].includes(row.id)) continue;
    const title = String(row.title || '').replace(/[<>]/g, '').trim().slice(0, 36);
    const description = String(row.description || '').replace(/[<>]/g, '').trim().slice(0, 120);
    if (title && description) layoutSuggestions[row.id] = { title, description };
  }
  const layouts = buildPinboardLayouts(assets, moments, layoutSuggestions);
  const rawPalette = generated.palette || {};
  const palette = Object.fromEntries(Object.keys(V3_DEFAULT_PALETTE).map(key => [key, /^#[0-9a-f]{6}$/i.test(rawPalette[key] || '') ? rawPalette[key] : V3_DEFAULT_PALETTE[key]]));
  if (contrastRatio(palette.background, palette.text) < 4.5 || contrastRatio(palette.surface, palette.text) < 4.5) {
    const readable = ['#fffaf6', '#ffffff', '#101010', '#000000'].find(color => contrastRatio(palette.background, color) >= 4.5 && contrastRatio(palette.surface, color) >= 4.5);
    if (readable) palette.text = readable;
    else { palette.background = V3_DEFAULT_PALETTE.background; palette.surface = V3_DEFAULT_PALETTE.surface; palette.text = V3_DEFAULT_PALETTE.text; }
  }
  const current = delivery.pinboard || {};
  const typography = {
    display: V3_FONT_CHOICES.has(generated.typography?.display) ? generated.typography.display : current.typography?.display || 'Playfair Display',
    body: V3_FONT_CHOICES.has(generated.typography?.body) ? generated.typography.body : current.typography?.body || 'Outfit'
  };
  return {
    ...current,
    title: String(current.title || delivery.title || `${delivery.clientName || 'Client'}'s photographs`).slice(0, 120),
    layouts,
    selectedLayoutId: layouts.some(layout => layout.id === current.selectedLayoutId) ? current.selectedLayoutId : 'balanced',
    moments,
    palette: current.palette || palette,
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

export async function repickV3Palette({ format, brief, shootType, imageColors, currentPalette }) {
  const current = Object.fromEntries(Object.keys(V3_DEFAULT_PALETTE).map(key => [key, String(currentPalette?.[key] || V3_DEFAULT_PALETTE[key]).toLowerCase()]));
  const system = 'Return JSON {"palette":{"background":"#hex","surface":"#hex","text":"#hex","accent":"#hex"}}. Choose a readable visual palette for the opening and showcase surfaces from the supplied image colour analysis. Keep the photographer’s original photographs unchanged. Make the new background, panels, or accent visibly different from the current palette. Text must have at least 4.5:1 contrast against both background and panels. Do not write captions or change delivery content.';
  const prompt = [
    'Format: ' + format,
    'Shoot type: ' + shootType,
    'Photographer purpose: ' + brief,
    'Image colour analysis: ' + JSON.stringify(imageColors),
    'Current palette to move away from: ' + JSON.stringify(current)
  ].join('\n');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await request(system + (attempt ? ' The previous answer repeated the current palette. Return a clearly different palette this time.' : ''), prompt, { maxTokens: 250 });
    const palette = Object.fromEntries(Object.keys(V3_DEFAULT_PALETTE).map(key => [key, String(result.palette?.[key] || '').trim()]));
    if (Object.values(palette).some(color => !/^#[0-9a-f]{6}$/i.test(color))) continue;

    if (contrastRatio(palette.background, palette.text) < 4.5 || contrastRatio(palette.surface, palette.text) < 4.5) {
      const readable = ['#fffaf6', '#ffffff', '#101010', '#000000'].find(color => contrastRatio(palette.background, color) >= 4.5 && contrastRatio(palette.surface, color) >= 4.5);
      if (readable) palette.text = readable;
      else {
        palette.background = V3_DEFAULT_PALETTE.background;
        palette.surface = V3_DEFAULT_PALETTE.surface;
        palette.text = V3_DEFAULT_PALETTE.text;
      }
    }

    const changed = ['background', 'surface', 'accent'].some(key => palette[key].toLowerCase() !== current[key]);
    if (changed) return palette;
  }

  throw Object.assign(new Error('The colour picker returned the same palette. Choose another palette and try again.'), { code: 'V3_PALETTE_UNCHANGED', status: 422 });
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
