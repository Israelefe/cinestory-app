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
  const result = await request(
    'You are lightly editing the photographer\'s purpose of a finished shoot. Return JSON {"improved":"..."} containing ONLY the edited purpose, with no field labels, shoot type, explanation, caption instructions, or extra lines. Fix spelling, grammar and punctuation only where needed. Keep the photographer\'s wording and every supplied fact; do not add any scene, emotion, relationship or detail. A short purpose should stay short. Example: "Lora 25th Birthday Celebration" becomes "Lora\'s 25th birthday celebration." If the original is already clear, return it unchanged.',
    JSON.stringify({ shootType, purpose }),
    { maxTokens: 250 }
  );
  const raw = String(result.improved || '').trim();
  const purposeLine = raw.match(/(?:^|\n)\s*(?:photographer['\u2019]s\s+)?purpose\s*:\s*(.+)/i)?.[1];
  const improved = String(purposeLine || raw).replace(/^\s*(?:improved\s+)?(?:photographer['\u2019]s\s+)?purpose\s*:\s*/i, '').trim().slice(0, 3000);
  if (!improved || /\n|(?:^|\b)shoot\s+type\s*:/i.test(improved)) throw Object.assign(new Error('The wording suggestion was not usable. Your original purpose is unchanged. Please try again.'), { code: 'V3_INVALID_AI_RESPONSE' });
  return improved;
}

export async function recommendV3Format(shootType) {
  const result = await request(`Return JSON {"format":"one-of-these","reason":"one practical sentence"}. Choose based ONLY on shoot type. Available formats: ${Object.keys(V3_FORMATS).join(', ')}. Photo Story suits one person or a close group; Event Coverage suits a whole gathering; Campaign suits commercial assets.`, `Shoot type: ${shootType}`, { maxTokens: 250 });
  if (!V3_FORMATS[result.format]) throw Object.assign(new Error('The format recommendation could not be read. Retry.'), { code: 'V3_INVALID_AI_RESPONSE' });
  return { format: result.format, reason: String(result.reason || '').slice(0, 160) };
}

async function analyzeBatch(batch, context) {
  const descriptors = batch.map((asset, index) => ({ index, assetId: asset.assetId }));
  const result = await request('Return JSON {"images":[{"index":0,"summary":"visible facts only","score":1,"colors":["#hex"]}]}. Describe each supplied image by its numeric index. Include every index exactly once. Score visual showcase suitability 1-10 based on image quality, variety and clear subject. Do not infer names, age, relationships, emotion or event facts from pixels. If an image cannot be seen, say so and score 1.', `Shoot type: ${context.shootType}. Purpose: ${context.brief}. Images in order: ${JSON.stringify(descriptors)}`, { images: batch, maxTokens: Math.min(25000, 250 * batch.length) });
  const rows = Array.isArray(result.images) ? result.images : [];
  if (rows.length !== batch.length) throw Object.assign(new Error('Some photographs were not analysed. Retry this step.'), { code: 'V3_INCOMPLETE_ANALYSIS' });
  const byIndex = new Map(rows.map(row => [Number(row.index), row]));
  if (byIndex.size !== batch.length || batch.some((_, index) => !byIndex.has(index))) throw Object.assign(new Error('Some photographs were not analysed. Retry this step.'), { code: 'V3_INCOMPLETE_ANALYSIS' });
  return batch.map((asset, index) => ({ assetId: asset.assetId, summary: String(byIndex.get(index).summary || '').slice(0, 220), score: Math.max(1, Math.min(10, Number(byIndex.get(index).score) || 1)), colors: (Array.isArray(byIndex.get(index).colors) ? byIndex.get(index).colors : []).filter(color => /^#[0-9a-f]{6}$/i.test(color)).slice(0, 4) }));
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
  const captionLimit = delivery.format === 'photo-story' ? 60 : 180;
  const narrative = await request('Return JSON {"title":"...","openingLine":"...","closingLine":"...","frames":[{"assetId":"...","caption":"..."}]}. Write the opening, closing and one distinct caption for every selected asset ID from the photographer\'s stated purpose. There are no image observations in this request. Do not describe an imagined photograph, invent a person or event, or use generic visual filler. The shoot type supplies only light context. Use plain, meaningful language a photographer might send to this client. Photo Story captions must be no more than 44 characters so a small visual cue can fit later; other captions must be no more than 140 characters. Keep the opening and closing distinct.', `Client: ${delivery.clientName}\nPhotographer's purpose: ${delivery.brief}\nShoot type (light context only): ${delivery.shootType}\nFormat: ${delivery.format}\nSelected asset IDs in order: ${JSON.stringify(selected)}`, { maxTokens: Math.min(8000, 700 + selected.length * 110) });
  const frameMap = new Map((Array.isArray(narrative.frames) ? narrative.frames : []).map(frame => [String(frame.assetId), frame]));
  if (selected.some(id => !frameMap.get(id)?.caption)) throw Object.assign(new Error('Some captions were missing. Retry this step.'), { code: 'V3_INCOMPLETE_CAPTIONS' });
  const purposeFrames = selected.map(id => ({ assetId: id, caption: String(frameMap.get(id).caption).trim().slice(0, captionLimit) }));
  const visual = await request('Return JSON {"frames":[{"assetId":"...","caption":"..."}],"palette":{"background":"#hex","surface":"#hex","text":"#hex","accent":"#hex"},"typography":{"display":"Playfair Display","body":"Outfit"}}. The supplied captions already contain the photographer\'s intended message. Preserve each caption verbatim. You may only append a short, accurate visual cue from its matching image summary when it reads naturally and fits the character limit; otherwise repeat the original caption exactly. Never turn a caption into a description of the photo. Never infer relationships, feelings, names or events from an image. Photo Story captions: at most 60 characters total and three lines. Other captions: at most 180 characters. Use image colours to choose a readable palette. Typography must use Playfair Display, Outfit, Plus Jakarta Sans, Cormorant Garamond, DM Sans, Libre Baskerville, or Manrope.', `Purpose-led captions: ${JSON.stringify(purposeFrames)}\nVisible image observations: ${JSON.stringify(rows.map(({ assetId, summary, colors }) => ({ assetId, summary, colors })))}\nFormat: ${delivery.format}`, { maxTokens: Math.min(8000, 500 + rows.length * 125) });
  const visualMap = new Map((Array.isArray(visual.frames) ? visual.frames : []).map(frame => [String(frame.assetId), String(frame.caption || '').trim()]));
  const captions = purposeFrames.map(frame => {
    const suggested = visualMap.get(frame.assetId) || '';
    const preservesPurpose = suggested.toLocaleLowerCase().includes(frame.caption.toLocaleLowerCase());
    const caption = preservesPurpose && suggested.length <= captionLimit ? suggested : frame.caption;
    return { assetId: frame.assetId, headline: '', caption, textAnimation: delivery.format === 'photo-story' ? 'typewriter' : 'word_fade_up' };
  });
  const result = { ...narrative, palette: visual.palette, typography: visual.typography };
  const palette = Object.fromEntries(Object.keys(V3_DEFAULT_PALETTE).map(key => [key, /^#[0-9a-f]{6}$/i.test(result.palette?.[key]) ? result.palette[key] : V3_DEFAULT_PALETTE[key]]));
  if (contrastRatio(palette.background, palette.text) < 4.5 || contrastRatio(palette.surface, palette.text) < 4.5) {
    const readable = ['#ffffff', '#101010'].find(color => contrastRatio(palette.background, color) >= 4.5 && contrastRatio(palette.surface, color) >= 4.5);
    if (readable) palette.text = readable;
    else { palette.background = V3_DEFAULT_PALETTE.background; palette.surface = V3_DEFAULT_PALETTE.surface; palette.text = V3_DEFAULT_PALETTE.text; }
  }
  if (String(result.openingLine || '').trim().length < 5 || String(result.closingLine || '').trim().length < 5) throw Object.assign(new Error('The opening or closing message was missing. Retry this step.'), { code: 'V3_INCOMPLETE_BOOKENDS' });
  const sections = await groupV3Sections(delivery, rows, selected);
  return { selected, openingAssetId, closingAssetId, direction: { title: String(result.title || delivery.clientName + "'s photographs").slice(0, 80), openingLine: String(result.openingLine).slice(0, 140), closingLine: String(result.closingLine).slice(0, 160), palette, typography: { display: V3_FONT_CHOICES.has(result.typography?.display) ? result.typography.display : 'Playfair Display', body: V3_FONT_CHOICES.has(result.typography?.body) ? result.typography.body : 'Outfit' }, frames: captions, assetOrder: selected, sections } };
}

export async function regenerateV3Caption(delivery, insight, instruction = '') {
  const limit = delivery.format === 'photo-story' ? 60 : 180;
  const purpose = await request('Return JSON {"caption":"..."}. Write one meaningful caption based on the photographer\'s purpose and any photographer instruction. Do not describe or imagine a photograph. The shoot type is light context only. Use plain human language. For Photo Story use at most 44 characters, otherwise at most 140 characters.', `Photographer's purpose: ${delivery.brief}\nPhotographer instruction: ${instruction}\nShoot type (light context only): ${delivery.shootType}\nFormat: ${delivery.format}`, { maxTokens: 200 });
  const base = String(purpose.caption || '').trim().slice(0, limit);
  if (base.length < 5) throw Object.assign(new Error('The caption could not be written. Retry.'), { code: 'V3_INVALID_AI_RESPONSE' });
  const visual = await request('Return JSON {"caption":"..."}. Keep the purpose-led caption verbatim. Optionally append a brief visible cue from the image observation if it fits naturally and the total stays within the limit. Never replace the purpose message with a photo description, and never infer personal facts from the image. If there is no suitable cue, repeat the caption exactly.', `Purpose-led caption: ${base}\nVisible observation only: ${insight.summary}\nCharacter limit: ${limit}`, { maxTokens: 200 });
  const suggestion = String(visual.caption || '').trim();
  return suggestion.length <= limit && suggestion.toLocaleLowerCase().includes(base.toLocaleLowerCase()) ? suggestion : base;
}
