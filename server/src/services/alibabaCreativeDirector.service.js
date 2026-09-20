import { z } from 'zod';
import { DELIVERY_SOUNDTRACKS, recommendSoundtracks } from '../constants/deliverySoundtracks.js';

const FORMATS = ['photo-story', 'editorial', 'photo-reveal', 'canvas', 'chapters', 'album', 'event-coverage', 'campaign'];
const MOTIONS = ['slow-push', 'slow-pull', 'pan-left', 'pan-right', 'float', 'still'];
const TRANSITIONS = ['fade', 'crossfade', 'wipe', 'slide', 'reveal', 'cut'];
const LAYOUTS = ['hero', 'single', 'pair', 'triptych', 'grid', 'strip', 'spread', 'cluster', 'chapter-cover'];

const COLOR_NAMES = {
  black: '#111111', white: '#ffffff', gray: '#888888', grey: '#888888',
  red: '#d32f2f', blue: '#1976d2', green: '#388e3c', yellow: '#fbc02d',
  gold: '#d4af37', silver: '#c0c0c0', bronze: '#cd7f32', navy: '#0a192f',
  cream: '#fdfbf7', ivory: '#fffff0', beige: '#f5f5dc', brown: '#5d4037',
  coral: '#ff5a47', orange: '#f57c00', purple: '#7b1fa2', pink: '#e91e63'
};

function normalizeHexColor(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const str = raw.trim().toLowerCase();
  if (COLOR_NAMES[str]) return COLOR_NAMES[str];
  const cleaned = str.replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(cleaned)) return `#${cleaned}`;
  if (/^[0-9a-f]{3}$/i.test(cleaned)) {
    return `#${cleaned[0]}${cleaned[0]}${cleaned[1]}${cleaned[1]}${cleaned[2]}${cleaned[2]}`;
  }
  return null;
}

function sanitizeColors(val) {
  const list = Array.isArray(val) ? val : (typeof val === 'string' ? val.split(/[,\s]+/) : []);
  const normalized = list.map(normalizeHexColor).filter(Boolean);
  if (!normalized.length) return ['#111111'];
  return [...new Set(normalized)].slice(0, 5);
}

function sanitizeOrientation(val) {
  const str = String(val || '').trim().toLowerCase();
  if (['portrait', 'vertical', 'tall', 'standing'].includes(str)) return 'portrait';
  if (['landscape', 'horizontal', 'wide'].includes(str)) return 'landscape';
  if (['square', '1:1'].includes(str)) return 'square';
  return 'portrait';
}

function sanitizeVisualWeight(val) {
  const num = Number(val);
  if (Number.isFinite(num)) {
    return Math.min(10, Math.max(1, Math.round(num)));
  }
  return 5;
}

function sanitizeSubjects(val) {
  if (Array.isArray(val)) {
    const list = val.map(item => String(item || '').trim().slice(0, 60)).filter(Boolean);
    return list.length ? list.slice(0, 8) : ['subject'];
  }
  if (typeof val === 'string') {
    const list = val.split(',').map(item => item.trim().slice(0, 60)).filter(Boolean);
    return list.length ? list.slice(0, 8) : ['subject'];
  }
  return ['subject'];
}

const imageInsightSchema = z.object({
  assetId: z.string().min(1).max(500),
  summary: z.preprocess(
    val => String(val || '').trim().slice(0, 240) || 'Photograph from the shoot',
    z.string().min(1).max(240)
  ),
  subjects: z.preprocess(sanitizeSubjects, z.array(z.string().min(1).max(60)).min(1).max(8)),
  expression: z.preprocess(val => String(val || '').trim().slice(0, 100), z.string().max(100)),
  setting: z.preprocess(val => String(val || '').trim().slice(0, 120), z.string().max(120)),
  clothing: z.preprocess(val => String(val || '').trim().slice(0, 140), z.string().max(140)),
  dominantColors: z.preprocess(sanitizeColors, z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).min(1).max(5)),
  orientation: z.preprocess(sanitizeOrientation, z.enum(['portrait', 'landscape', 'square'])),
  visualWeight: z.preprocess(sanitizeVisualWeight, z.number().int().min(1).max(10)),
  moment: z.preprocess(val => String(val || '').trim().slice(0, 120), z.string().max(120))
});

const visionBatchSchema = z.preprocess(val => {
  if (Array.isArray(val)) return { images: val };
  if (val && typeof val === 'object') {
    const arr = val.images || val.photographs || val.photos || val.items || val.results || val.data;
    if (Array.isArray(arr)) return { ...val, images: arr };
  }
  return val;
}, z.object({ images: z.array(imageInsightSchema).min(1).max(50) }));

const recommendationSchema = z.object({
  collectionSummary: z.preprocess(
    val => String(val || '').trim().slice(0, 500) || 'Finished photo collection ready for delivery.',
    z.string().min(10).max(500)
  ),
  clientThroughline: z.preprocess(
    val => String(val || '').trim().slice(0, 300) || 'A curated visual record of the shoot.',
    z.string().min(5).max(300)
  ),
  formatRecommendations: z.array(z.object({
    format: z.preprocess(val => String(val || '').trim().toLowerCase(), z.enum(FORMATS)),
    score: z.preprocess(val => Math.min(100, Math.max(1, Math.round(Number(val) || 50))), z.number().int().min(1).max(100)),
    reason: z.preprocess(val => String(val || '').trim().slice(0, 180) || 'Suits the pacing and scale of this shoot.', z.string().min(4).max(180))
  }))
}).superRefine((value) => {
  const returned = value.formatRecommendations.map(item => item.format);
  const existing = new Set(returned);
  for (const f of FORMATS) {
    if (!existing.has(f)) {
      value.formatRecommendations.push({ format: f, score: 50, reason: 'Alternative presentation format for this shoot.' });
    }
  }
});

const directionSchema = z.object({
  format: z.preprocess(val => String(val || '').trim().toLowerCase(), z.enum(FORMATS)),
  title: z.preprocess(val => String(val || '').trim().slice(0, 80) || 'Photo Story', z.string().min(2).max(80)),
  openingLine: z.preprocess(val => String(val || '').trim().slice(0, 140) || 'Photographs from today.', z.string().min(2).max(140)),
  closingLine: z.preprocess(val => String(val || '').trim().slice(0, 160) || 'Thank you for sharing these moments.', z.string().min(2).max(160)),
  designReason: z.preprocess(val => String(val || '').trim().slice(0, 240) || 'Art directed for this specific shoot.', z.string().min(4).max(240)),
  palette: z.object({
    background: z.preprocess(val => normalizeHexColor(val) || '#070709', z.string().regex(/^#[0-9a-f]{6}$/i)),
    surface: z.preprocess(val => normalizeHexColor(val) || '#121217', z.string().regex(/^#[0-9a-f]{6}$/i)),
    text: z.preprocess(val => normalizeHexColor(val) || '#ffffff', z.string().regex(/^#[0-9a-f]{6}$/i)),
    accent: z.preprocess(val => normalizeHexColor(val) || '#ff5a47', z.string().regex(/^#[0-9a-f]{6}$/i))
  }),
  typography: z.object({
    display: z.preprocess(val => ['editorial-serif', 'clean-sans', 'condensed-sans', 'soft-serif'].includes(val) ? val : 'editorial-serif', z.enum(['editorial-serif', 'clean-sans', 'condensed-sans', 'soft-serif'])),
    body: z.preprocess(val => ['editorial-serif', 'clean-sans'].includes(val) ? val : 'clean-sans', z.enum(['clean-sans', 'editorial-serif']))
  }),
  pace: z.preprocess(val => ['measured', 'warm', 'energetic'].includes(val) ? val : 'warm', z.enum(['measured', 'warm', 'energetic'])),
  variation: z.object({
    composition: z.preprocess(val => ['quiet', 'split', 'layered', 'grid', 'portrait-led', 'wide-led'].includes(val) ? val : 'quiet', z.enum(['quiet', 'split', 'layered', 'grid', 'portrait-led', 'wide-led'])),
    density: z.preprocess(val => ['spacious', 'balanced', 'layered'].includes(val) ? val : 'balanced', z.enum(['spacious', 'balanced', 'layered'])),
    imageTreatment: z.preprocess(val => ['natural', 'warm', 'contrast', 'monochrome'].includes(val) ? val : 'natural', z.enum(['natural', 'warm', 'contrast', 'monochrome'])),
    captionTreatment: z.preprocess(val => ['quiet', 'editorial', 'bold'].includes(val) ? val : 'editorial', z.enum(['quiet', 'editorial', 'bold'])),
    accentPlacement: z.preprocess(val => ['corners', 'rules', 'labels', 'type'].includes(val) ? val : 'rules', z.enum(['corners', 'rules', 'labels', 'type']))
  }).default({ composition: 'quiet', density: 'balanced', imageTreatment: 'natural', captionTreatment: 'editorial', accentPlacement: 'rules' }),
  music: z.object({
    trackId: z.preprocess(val => DELIVERY_SOUNDTRACKS.some(track => track.id === val) ? val : DELIVERY_SOUNDTRACKS[0].id, z.enum(DELIVERY_SOUNDTRACKS.map(track => track.id))),
    mood: z.preprocess(val => String(val || '').trim().slice(0, 80) || 'Cinematic Warmth', z.string().min(2).max(80)),
    genre: z.preprocess(val => String(val || '').trim().slice(0, 80) || 'Ambient Acoustic', z.string().min(2).max(80)),
    tempo: z.preprocess(val => ['slow', 'mid', 'upbeat'].includes(val) ? val : 'mid', z.enum(['slow', 'mid', 'upbeat']))
  }),
  narrationRecommended: z.preprocess(val => Boolean(val), z.boolean()),
  sections: z.array(z.object({
    id: z.preprocess(val => String(val || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'section-1', z.string().regex(/^[a-z0-9-]{1,32}$/)),
    title: z.preprocess(val => String(val || '').trim().slice(0, 60) || 'Chapter', z.string().min(1).max(60)),
    subtitle: z.preprocess(val => String(val || '').trim().slice(0, 120), z.string().max(120)),
    layout: z.preprocess(val => LAYOUTS.includes(val) ? val : 'single', z.enum(LAYOUTS))
  })).min(1).max(12)
}).superRefine((value) => {
  const seen = new Set();
  value.sections.forEach((section, idx) => {
    if (seen.has(section.id)) {
      section.id = `${section.id}-${idx + 1}`.slice(0, 32);
    }
    seen.add(section.id);
  });
});

const frameSchema = z.preprocess(raw => {
  if (!raw || typeof raw !== 'object') return {};
  const assetId = raw.assetId ?? raw.id ?? raw.asset_id ?? raw.photoId ?? raw.photo_id ?? raw.publicId ?? '';
  return {
    ...raw,
    assetId: String(assetId ?? '').trim().slice(0, 100),
    sectionId: raw.sectionId ?? raw.section ?? raw.section_id ?? '',
    role: raw.role,
    headline: typeof raw.headline === 'string' ? raw.headline : (raw.title ?? ''),
    caption: typeof raw.caption === 'string' ? raw.caption : (raw.text ?? raw.description ?? ''),
    motion: raw.motion,
    transition: raw.transition,
    duration: raw.duration,
    emphasis: raw.emphasis
  };
}, z.object({
  assetId: z.preprocess(val => String(val ?? '').trim().slice(0, 100), z.string()),
  sectionId: z.preprocess(val => String(val || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 32) || 'section-1', z.string()),
  role: z.preprocess(val => ['opening', 'hero', 'supporting', 'detail', 'pair', 'finale'].includes(val) ? val : 'supporting', z.enum(['opening', 'hero', 'supporting', 'detail', 'pair', 'finale'])),
  headline: z.preprocess(val => String(val || '').trim().slice(0, 70), z.string().max(70)),
  caption: z.preprocess(val => String(val || '').trim().slice(0, 180), z.string().min(18).max(180)),
  motion: z.preprocess(val => MOTIONS.includes(val) ? val : 'slow-push', z.enum(MOTIONS)),
  transition: z.preprocess(val => TRANSITIONS.includes(val) ? val : 'crossfade', z.enum(TRANSITIONS)),
  duration: z.preprocess(val => Math.min(12, Math.max(2, Number(val) || 4.5)), z.number().min(2).max(12)),
  emphasis: z.preprocess(val => Math.min(10, Math.max(1, Math.round(Number(val) || 5))), z.number().int().min(1).max(10))
}));

const frameBatchSchema = z.preprocess(val => {
  if (Array.isArray(val)) return { frames: val };
  if (val && typeof val === 'object') {
    if (Array.isArray(val.frames)) return val;
    if (Array.isArray(val.photographs)) return { frames: val.photographs };
    if (Array.isArray(val.photos)) return { frames: val.photos };
    if (Array.isArray(val.images)) return { frames: val.images };
    if (Array.isArray(val.data)) return { frames: val.data };
    if (Array.isArray(val.items)) return { frames: val.items };
    if (Array.isArray(val.directions)) return { frames: val.directions };
    const arr = Object.values(val).find(v => Array.isArray(v));
    if (arr) return { frames: arr };
  }
  return val;
}, z.object({ frames: z.array(frameSchema) }));

const portfolioDirectionSchema = z.object({
  headline: z.preprocess(val => String(val || '').trim().slice(0, 100) || 'Selected Works', z.string().min(4).max(100)),
  introLine: z.preprocess(val => String(val || '').trim().slice(0, 240) || 'Photographs and stories from recent sessions.', z.string().min(4).max(240)),
  background: z.preprocess(val => ['ink', 'warm-black', 'ivory'].includes(val) ? val : 'ink', z.enum(['ink', 'warm-black', 'ivory'])),
  accent: z.preprocess(val => normalizeHexColor(val) || '#ff5a47', z.string().regex(/^#[0-9a-f]{6}$/i)),
  typeStyle: z.preprocess(val => ['editorial', 'modern', 'classic'].includes(val) ? val : 'editorial', z.enum(['editorial', 'modern', 'classic'])),
  rhythm: z.preprocess(val => ['measured', 'bold', 'quiet'].includes(val) ? val : 'measured', z.enum(['measured', 'bold', 'quiet'])),
  heroPublicId: z.string().min(5).max(500),
  orderedPublicIds: z.array(z.string().min(5).max(500)).min(1).max(50),
  designReason: z.preprocess(val => String(val || '').trim().slice(0, 240) || 'Art directed for portfolio presentation.', z.string().min(4).max(240))
});

function config() {
  const apiKey = String(process.env.ALIBABA_MODEL_STUDIO_API_KEY || '').trim();
  const workspaceId = String(process.env.ALIBABA_WORKSPACE_ID || '').trim();
  const configured = String(process.env.ALIBABA_BASE_URL || '').trim();
  const baseUrl = configured || (workspaceId ? `https://${workspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` : '');
  if (!apiKey || !baseUrl) {
    const error = new Error('The AI Creative Director is not configured on the server.');
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }
  let parsed;
  try { parsed = new URL(baseUrl); } catch { throw new Error('ALIBABA_BASE_URL is not a valid URL.'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.aliyuncs.com')) throw new Error('ALIBABA_BASE_URL must use the Singapore Alibaba Model Studio HTTPS endpoint.');
  const creativeModel = process.env.ALIBABA_CREATIVE_MODEL || 'deepseek-v4.1-flash';
  const visionModel = process.env.ALIBABA_VISION_MODEL || creativeModel;
  return { apiKey, baseUrl: baseUrl.replace(/\/$/, ''), visionModel, creativeModel };
}

function repairTruncatedJson(raw) {
  let text = String(raw || '').trim();
  text = text.replace(/,\s*$/, '');
  const quoteMatches = text.match(/"/g);
  if (quoteMatches && quoteMatches.length % 2 !== 0) {
    text += '"';
  }
  let openBraces = (text.match(/\{/g) || []).length;
  let closeBraces = (text.match(/\}/g) || []).length;
  let openBrackets = (text.match(/\[/g) || []).length;
  let closeBrackets = (text.match(/\]/g) || []).length;

  while (closeBraces < openBraces || closeBrackets < openBrackets) {
    const lastOpenBrace = text.lastIndexOf('{');
    const lastOpenBracket = text.lastIndexOf('[');
    if (openBrackets > closeBrackets && (lastOpenBracket > lastOpenBrace || openBraces === closeBraces)) {
      text += ']';
      closeBrackets++;
    } else if (openBraces > closeBraces) {
      text += '}';
      closeBraces++;
    } else {
      break;
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    const lastCompleteObj = text.lastIndexOf('}');
    if (lastCompleteObj > 0) {
      let candidate = text.slice(0, lastCompleteObj + 1).replace(/,\s*$/, '');
      if (!candidate.endsWith(']}') && !candidate.endsWith('}')) {
        candidate += ']}';
      } else if (candidate.endsWith('}') && !candidate.endsWith(']}')) {
        candidate = candidate.slice(0, -1) + ']}';
      }
      try {
        return JSON.parse(candidate);
      } catch {}
    }
    throw new Error('Could not repair truncated JSON.');
  }
}

function jsonFromReply(reply) {
  let cleaned = String(reply || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .trim();

  if (cleaned.includes('<think>')) {
    cleaned = cleaned.replace(/<think>[\s\S]*$/gi, '').trim();
  }
  if (cleaned.includes('<thought>')) {
    cleaned = cleaned.replace(/<thought>[\s\S]*$/gi, '').trim();
  }

  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');

  let start = -1;
  let end = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    start = firstBrace;
    end = cleaned.lastIndexOf('}');
  } else if (firstBracket !== -1) {
    start = firstBracket;
    end = cleaned.lastIndexOf(']');
  }

  if (start < 0) throw new Error('The model did not return JSON.');
  if (end <= start) end = cleaned.length - 1;

  const raw = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(raw);
  } catch (initialError) {
    const sanitized = raw.replace(/,\s*([}\]])/g, '$1');
    try {
      return JSON.parse(sanitized);
    } catch {
      try {
        return repairTruncatedJson(raw);
      } catch {
        throw initialError;
      }
    }
  }
}

async function completion({ model, messages, temperature = 0.35, maxTokens = 6000, schema, repairLabel, schemaHint = '' }) {
  const provider = config();
  let currentMessages = messages;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: currentMessages, temperature: attempt ? 0.1 : temperature, max_tokens: maxTokens, response_format: { type: 'json_object' } }),
      signal: AbortSignal.timeout(90_000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `Alibaba Model Studio returned ${response.status}.`);
      error.code = response.status === 404 ? 'MODEL_NOT_AVAILABLE' : 'MODEL_REQUEST_FAILED';
      throw error;
    }
    const reply = payload?.choices?.[0]?.message?.content;
    try {
      const parsed = schema.safeParse(jsonFromReply(reply));
      if (parsed.success) return parsed.data;
      lastError = new Error(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).slice(0, 8).join('; '));
    } catch (error) { lastError = error; }
    console.warn(`[creative-director/${repairLabel}] Attempt ${attempt + 1} validation issue: ${lastError?.message}`);
    currentMessages = [
      ...messages,
      { role: 'assistant', content: String(reply || '') },
      { role: 'user', content: `Your ${repairLabel} response was invalid: ${lastError.message}. Return the complete corrected JSON object only. Keep every required field and use only the allowed values.${schemaHint ? `\n\nSchema specification:\n${schemaHint}` : ''}` }
    ];
  }
  console.error(`[creative-director/${repairLabel}] All attempts failed. Last error: ${lastError?.message}`);
  const error = new Error(`The AI Creative Director returned an invalid ${repairLabel}. Please run it again.`);
  error.code = 'INVALID_MODEL_OUTPUT';
  throw error;
}

const voiceRules = `You are writing directly to the client. Your PRIMARY source for every headline and caption is the SHOOT PURPOSE — what the photographer says this shoot celebrates (birthday, wedding, graduation, portrait session, etc.) and the brief they wrote about the client.

STRICT RULES:
1. Every headline and caption must celebrate the OCCASION and the CLIENT. Ask yourself: "What does this shoot mean to this person?" That answer drives every word you write.
2. ABSOLUTELY NEVER describe what you see in the image. Never write alt-text. Banned phrases: "A photograph of", "The subject is wearing", "Visible in this image", "captured in", "posing against", "standing in", "studio backdrop", "floral arrangement", "emerald dress", "wearing a", "holding a". If it sounds like you are describing a photo to a blind person, delete it immediately.
3. Write short, confident, warm. Sound like a real human speaking to a friend about their big day — not a robot cataloguing visual data.
4. Never invent names, relationships, or events the photographer did not mention.
5. Never use AI clichés: elevate, unlock, seamlessly, tapestry, symphony, beacon, testament, crescendo, delve, journey, essence, timeless, radiance, pure grace, grand finale, curated.
6. No hashtags, emojis, or corporate jargon.
7. Every photograph must have a meaningful caption. Never return an empty caption. If a frame is quiet, write about what the moment means to the client rather than describing the pixels.

GOOD examples for a 30th birthday shoot for Ada:
  - Headline: "The Start of a New Decade" / Caption: "Ada, this is the one you will keep coming back to."
  - Headline: "Thirty" / Caption: "The confidence that showed up on this birthday."

BAD examples (NEVER write like this):
  - "A woman wearing a green satin dress posing against a cream studio backdrop."
  - "Subject displays a warm smile while seated on a wooden stool."
  - "Captured in natural lighting with soft bokeh in the background."`;

export async function analyzeImageBatch({ brief, shootType, clientName, assets }) {
  const provider = config();
  const schemaInstructions = `You must return a valid JSON object with the following structure:
{
  "images": [
    {
      "assetId": "<string matching supplied assetId>",
      "summary": "<1-2 sentence description of visible subjects, lighting, and composition (4-240 characters)>",
      "subjects": ["<array of 1-8 visible subjects or elements, e.g. bride, groom, decor>"],
      "expression": "<visible expressions or emotional tone, max 100 characters>",
      "setting": "<visible background or venue setting, max 120 characters>",
      "clothing": "<visible attire or styling, max 140 characters>",
      "dominantColors": ["<1 to 5 six-digit hex color codes, e.g. #112233>"],
      "orientation": "portrait" | "landscape" | "square",
      "visualWeight": <integer from 1 to 10 indicating visual impact/prominence>,
      "moment": "<key action, moment, or beat, max 120 characters>"
    }
  ]
}
Return one entry in the "images" array for every supplied assetId in the exact order received. Describe only what is visible.`;

  const content = [{
    type: 'text',
    text: `Analyze these ${assets.length} finished photographs as one batch from the same client shoot.\n` +
          `Photographer brief: "${brief || 'Finished client shoot'}"\n` +
          `Shoot type: "${shootType || 'Photography session'}"\n` +
          `Client: "${clientName || 'Client'}"\n\n` +
          schemaInstructions
  }];

  for (const asset of assets) {
    content.push({ type: 'text', text: `assetId: ${asset.assetId}` });
    content.push({ type: 'image_url', image_url: { url: asset.analysisUrl } });
  }

  const result = await completion({
    model: provider.visionModel,
    messages: [
      { role: 'system', content: 'You are Veylo’s senior visual analyst. Inspect finished photographs accurately. Do not identify real people or infer sensitive traits. Return valid JSON only adhering strictly to the requested schema.' },
      { role: 'user', content }
    ],
    temperature: 0.15,
    maxTokens: 5000,
    schema: visionBatchSchema,
    repairLabel: 'image analysis',
    schemaHint: schemaInstructions
  });

  const expected = assets.map(asset => asset.assetId);
  const byAssetId = new Map(result.images.map(item => [item.assetId, item]));
  const ordered = [];
  for (let i = 0; i < expected.length; i += 1) {
    const id = expected[i];
    const match = byAssetId.get(id);
    if (match) {
      ordered.push(match);
    } else if (result.images[i]) {
      ordered.push({ ...result.images[i], assetId: id });
    }
  }

  if (ordered.length !== expected.length) {
    const error = new Error('The vision model did not return one ordered analysis for every photograph.');
    error.code = 'INVALID_VISION_SEQUENCE';
    throw error;
  }
  return ordered;
}

export async function recommendFormats({ brief, shootType, clientName, imageInsights }) {
  const provider = config();
  const compact = imageInsights.map(item => ({ assetId: item.assetId, summary: item.summary, expression: item.expression, setting: item.setting, clothing: item.clothing, colors: item.dominantColors, weight: item.visualWeight, moment: item.moment }));
  const schemaInstructions = `Return a JSON object matching this schema:
{
  "collectionSummary": "<overview of the shoot style, pacing, and visual story, 20-500 chars>",
  "clientThroughline": "<the personal connection and journey for this client, 10-300 chars>",
  "formatRecommendations": [
    { "format": "photo-story", "score": <1-100>, "reason": "<why this format suits the shoot, 8-180 chars>" },
    { "format": "editorial", "score": <1-100>, "reason": "..." },
    { "format": "photo-reveal", "score": <1-100>, "reason": "..." },
    { "format": "canvas", "score": <1-100>, "reason": "..." },
    { "format": "chapters", "score": <1-100>, "reason": "..." },
    { "format": "album", "score": <1-100>, "reason": "..." },
    { "format": "event-coverage", "score": <1-100>, "reason": "..." },
    { "format": "campaign", "score": <1-100>, "reason": "..." }
  ]
}
Rank all eight delivery formats exactly once.`;

  return completion({
    model: provider.creativeModel,
    messages: [
      { role: 'system', content: `You are Veylo’s senior creative director. Decide how a finished shoot should be delivered. Rank all eight formats exactly once. ${voiceRules}\n\n${schemaInstructions}` },
      { role: 'user', content: JSON.stringify({ task: 'Understand this complete shoot and rank the eight delivery formats', clientName, shootType, photographerBrief: brief, formats: FORMATS, photographs: compact }) }
    ],
    schema: recommendationSchema,
    repairLabel: 'format recommendation',
    schemaHint: schemaInstructions
  });
}

export async function createGlobalDirection({ format, brief, shootType, clientName, collectionAnalysis, imageInsights, revisionInstruction = '', currentDirection = null }) {
  const provider = config();
  const compact = imageInsights.map(item => ({ assetId: item.assetId, weight: item.visualWeight, moment: item.moment, orientation: item.orientation }));
  const schemaInstructions = `Return a JSON object matching this schema:
{
  "format": "${format}",
  "title": "<display title for the delivery, 2-80 chars>",
  "openingLine": "<welcoming subtitle or opening line, 4-140 chars>",
  "closingLine": "<closing sign-off or ending line, 4-160 chars>",
  "designReason": "<rationale for chosen palette and structure, 10-240 chars>",
  "palette": { "background": "<#hex>", "surface": "<#hex>", "text": "<#hex>", "accent": "<#hex>" },
  "typography": { "display": "editorial-serif" | "clean-sans" | "condensed-sans" | "soft-serif", "body": "clean-sans" | "editorial-serif" },
  "pace": "measured" | "warm" | "energetic",
  "variation": { "composition": "quiet" | "split" | "layered" | "grid" | "portrait-led" | "wide-led", "density": "spacious" | "balanced" | "layered", "imageTreatment": "natural" | "warm" | "contrast" | "monochrome", "captionTreatment": "quiet" | "editorial" | "bold", "accentPlacement": "corners" | "rules" | "labels" | "type" },
  "music": { "trackId": "<one approved track id>", "mood": "<mood title, 2-80 chars>", "genre": "<genre title, 2-80 chars>", "tempo": "slow" | "mid" | "upbeat" },
  "narrationRecommended": boolean,
  "sections": [
    { "id": "<kebab-case-id>", "title": "<section title>", "subtitle": "<section subtitle>", "layout": "hero" | "single" | "pair" | "triptych" | "grid" | "strip" | "spread" | "cluster" | "chapter-cover" }
  ]
}`;

  return completion({
    model: provider.creativeModel,
    messages: [
      { role: 'system', content: `You are Veylo’s senior creative director. Design one ${format} presentation around the actual finished shoot. The format must have its own structure. Photo Story is paced and sequential. Editorial is a scrollable publication. Photo Reveal is client-paced and suspenseful. Canvas is spatial and freely explored. Chapters is a non-linear moment selector. Album uses deliberate page turns and spreads. Event Coverage is documentary browsing organised into scenes for many subjects. Campaign is a commercial showcase followed by practical asset sets. ${voiceRules}\n\n${schemaInstructions}` },
      { role: 'user', content: JSON.stringify({
        task: revisionInstruction ? 'Revise the complete art direction and section plan' : 'Create the complete art direction and section plan',
        format,
        clientName,
        shootType,
        photographerBrief: brief,
        collectionAnalysis,
        currentDirection,
        photographerRevision: revisionInstruction,
        approvedSoundtrackCatalogue: DELIVERY_SOUNDTRACKS.map(track => ({ trackId: track.id, title: track.title, creator: track.creator, category: track.category, genre: track.genre, mood: track.mood, tempo: track.tempo, energy: track.energy, narrationFit: track.narrationFit, durationSec: track.durationSec, tags: track.tags, storyFunction: track.storyFunction, bestFor: track.bestFor, avoidFor: track.avoidFor, editingPace: track.editingPace, instrumentationCue: track.instrumentationCue, titleSignals: track.titleSignals, selectionNote: track.selectionNote, metadataConfidence: track.metadataConfidence, contentIdRegistered: track.contentIdRegistered, contentIdGuidance: track.contentIdGuidance, sourcePageUrl: track.sourcePageUrl, license: track.license, licenseUrl: track.licenseUrl, verifiedAt: track.verifiedAt })),
        strongestSoundtrackMatches: recommendSoundtracks(`${shootType} ${brief} ${JSON.stringify(collectionAnalysis || {})}`, 18).map(track => ({ trackId: track.id, title: track.title, creator: track.creator, genre: track.genre, mood: track.mood, tempo: track.tempo, energy: track.energy, narrationFit: track.narrationFit, durationSec: track.durationSec, tags: track.tags, storyFunction: track.storyFunction, bestFor: track.bestFor, avoidFor: track.avoidFor, editingPace: track.editingPace, instrumentationCue: track.instrumentationCue, titleSignals: track.titleSignals, selectionNote: track.selectionNote, metadataConfidence: track.metadataConfidence, contentIdRegistered: track.contentIdRegistered, contentIdGuidance: track.contentIdGuidance, sourcePageUrl: track.sourcePageUrl, license: track.license, licenseUrl: track.licenseUrl, verifiedAt: track.verifiedAt })),
        soundtrackInstruction: 'Consider the complete 100-track catalogue, use the strongest matches as a focused shortlist, and choose the exact trackId that best fits the photographs, occasion, pace, format and narration. Use only an approved trackId.',
        photographs: compact
      }) }
    ],
    schema: directionSchema,
    repairLabel: 'creative direction',
    schemaHint: schemaInstructions
  });
}

export async function createFrameBatch({ format, brief, shootType, clientName, direction, imageInsights, revisionInstruction = '', currentFrames = [] }) {
  const provider = config();
  const validSectionIds = (direction?.sections?.map(s => s.id) || []).filter(Boolean);
  if (!validSectionIds.length) validSectionIds.push('section-1');
  const defaultSectionId = validSectionIds[0];

  const expectedAssetIds = (imageInsights || []).map(insight => String(insight.assetId || ''));
  const schemaInstructions = `Return a JSON object matching this schema:
{
  "frames": [
    {
      "assetId": "<string matching supplied assetId>",
      "sectionId": "<one of: ${validSectionIds.join(', ')}>",
      "role": "opening" | "hero" | "supporting" | "detail" | "pair" | "finale",
      "headline": "<brief evocative headline under 70 chars, or empty>",
      "caption": "<required natural human caption under 180 chars, written for this client and occasion>",
      "motion": "slow-push" | "slow-pull" | "pan-left" | "pan-right" | "float" | "still",
      "transition": "fade" | "crossfade" | "wipe" | "slide" | "reveal" | "cut",
      "duration": <number between 2 and 12 seconds>,
      "emphasis": <integer from 1 to 10>
    }
  ]
}
Return one frame per photograph in the supplied order.`;

  const minimalInsights = (imageInsights || []).map(insight => ({
    assetId: String(insight.assetId || ''),
    summary: insight.summary || '',
    subjects: insight.subjects || [],
    expression: insight.expression || '',
    setting: insight.setting || '',
    moment: insight.moment || '',
    visualWeight: insight.visualWeight || 5,
    orientation: insight.orientation || 'landscape'
  }));

  const minimalDirection = {
    title: direction?.title || 'Photo Story',
    sections: (direction?.sections || []).map(s => ({ id: s.id, title: s.title }))
  };

  const captionFormatRules = {
    'event-coverage': `This is multi-subject event coverage. Do not address one named client and do not assume a private celebration. Write each caption as a useful, human record of the people, scene, purpose, or atmosphere the photographer described. Use plural or neutral language where appropriate. Explain why the moment matters to the event, not only what is visible.`,
    campaign: `This is a campaign handoff. Write for the brand, campaign objective, audience, and approved usage described in the brief. Captions should clarify the role of each frame in the campaign or asset set without inventing claims, sales copy, product specifications, or a private-person celebration.`,
    'photo-story': `This is a personal Photo Story. Address the named client naturally and connect each caption to the milestone, relationship, or purpose in the photographer's brief. Keep the voice intimate and reflective without becoming sentimental or generic.`,
    editorial: `This is an editorial delivery. Use the brief to give each frame a clear point of view and editorial role. Address the subject or story naturally, but do not write generic praise or describe pixels as alt text.`,
    'photo-reveal': `This is a reveal sequence. Make each caption build the approved story and explain the significance of the frame in the brief. Keep the writing concise enough to read during a reveal.`,
    canvas: `This is a browsable canvas. Give each frame a distinct, meaningful line tied to the brief so the collection does not read like a repeated template.`,
    chapters: `This is a chaptered delivery. Tie each caption to its chapter's purpose and keep the language varied across the sequence.`,
    album: `This is an album delivery. Write captions that feel like considered album notes: specific to the brief, calm, and useful to the person receiving the finished photographs.`
  }[format] || `Use the photographer's brief and the supplied photograph context to write a meaningful caption for this delivery.`;

  const alignFrames = (rawFrames = []) => {
    const byAssetId = new Map(rawFrames.map(f => [String(f.assetId || ''), f]));
    if (rawFrames.length !== expectedAssetIds.length) {
      throw Object.assign(new Error(`The creative director returned ${rawFrames.length} captions for ${expectedAssetIds.length} photographs.`), { code: 'INVALID_MODEL_OUTPUT' });
    }
    const seenCaptions = new Set();
    return expectedAssetIds.map((id, index) => {
      const matched = byAssetId.get(id);
      if (!matched) {
        throw Object.assign(new Error(`The creative director did not return a caption for photograph ${id}.`), { code: 'INVALID_MODEL_OUTPUT' });
      }
      const frame = { ...matched };
      frame.assetId = id;
      if (!validSectionIds.includes(frame.sectionId)) frame.sectionId = defaultSectionId;
      if (!['opening', 'hero', 'supporting', 'detail', 'pair', 'finale'].includes(frame.role)) {
        frame.role = index === 0 ? 'hero' : 'supporting';
      }
      if (typeof frame.headline !== 'string') frame.headline = '';
      const caption = typeof frame.caption === 'string' ? frame.caption.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim() : '';
      const normalizedCaption = caption.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (caption.length < 18 || caption.split(/\s+/).filter(Boolean).length < 4 || /^(a finished|a final|this frame|a photograph|photograph from the shoot)\b/i.test(caption) || seenCaptions.has(normalizedCaption)) {
        throw Object.assign(new Error(`The creative director returned an unusable caption for photograph ${id}.`), { code: 'INVALID_MODEL_OUTPUT' });
      }
      seenCaptions.add(normalizedCaption);
      frame.caption = caption.slice(0, 180);
      if (!MOTIONS.includes(frame.motion)) frame.motion = 'slow-push';
      if (!TRANSITIONS.includes(frame.transition)) frame.transition = 'crossfade';
      frame.duration = Math.min(12, Math.max(2, Number(frame.duration) || 4.5));
      frame.emphasis = Math.min(10, Math.max(1, Math.round(Number(frame.emphasis) || 5)));
      return frame;
    });
  };

  try {
    const result = await completion({
      model: provider.creativeModel,
      messages: [
        {
          role: 'system',
          content: `You are writing headlines and captions for a ${format} delivery of a "${shootType || 'photo'}" shoot for "${clientName || 'Client'}".

THE PHOTOGRAPHER SAYS THIS SHOOT IS ABOUT:
"${brief || 'Client photo collection'}"

THIS IS YOUR PRIMARY DIRECTIVE: Every headline and caption must celebrate what this shoot represents — the occasion, the milestone, the person. Speak directly to ${clientName || 'the client'} with warmth.

Use the supplied visual analysis and photographer's brief to anchor each caption in the actual moment or subject shown. The writing should add meaning, not read like mechanical alt-text: avoid camera jargon, pixel-level description, invented facts, or details that are not supported by the analysis or brief.

Assign every photograph to one existing section (${validSectionIds.join(', ')}). Choose cinematic motions and transitions that suit the emotional rhythm.

 ${voiceRules}

 FORMAT-SPECIFIC DIRECTION (this overrides any generic personal-portrait wording above):
 ${captionFormatRules}

 ${schemaInstructions}`
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: revisionInstruction ? 'Revise this batch of photograph directions' : 'Direct this batch of photographs',
            clientName,
            shootPurposeAndBrief: brief,
            deliveryDirection: minimalDirection,
            photographerRevision: revisionInstruction,
            currentFrames: (currentFrames || []).slice(0, 20),
            photographs: minimalInsights
          })
        }
      ],
      schema: frameBatchSchema,
      repairLabel: 'photograph direction',
      schemaHint: schemaInstructions
    });

    return { frames: alignFrames(result?.frames || []) };
  } catch (error) {
    console.warn('[createFrameBatch] Directing model did not return a complete captioned batch:', error.message);
    throw error;
  }
}

export async function createNarrationScript({ clientName, shootType, brief, direction, format }) {
  throw Object.assign(new Error('Narration script generation is disabled. Deepgram reads the approved delivery captions.'), { code: 'NARRATION_CAPTIONS_ONLY' });
}
/*
  const provider = config();
  const sections = direction?.sections || [];
  const frames = direction?.frames || [];
  const sectionCount = sections.length || Math.min(frames.length, 6);

  const schemaInstructions = `Return a JSON object matching this schema:
{
  "script": "<a narration script that walks through the photographs section by section, with natural pauses between each section, 80-200 words total>"
}`;

  const result = await completion({
    model: provider.creativeModel,
    messages: [
      {
        role: 'system',
        content: `You are narrating a photo delivery for ${clientName || 'the client'}. The shoot was a "${shootType || 'Photography Session'}" — "${brief || 'Client Shoot'}".

Write a spoken narration script that walks through the photographs ONE SECTION AT A TIME, like a narrator guiding the client through their story. There are ${sectionCount} sections.

STRUCTURE:
- Open with a warm 1-2 sentence welcome: greet ${clientName || 'the client'} and celebrate the occasion.
- Then, for each section, write 1-2 short sentences that introduce what that part of the collection holds. Use natural pauses between sections (end sentences with periods and leave breathing room).
- Close with a brief, warm sign-off.

VOICE:
- Speak like someone narrating an intimate, elegant documentary biography of this person or milestone.
- Calm, dignified, observant, and warm — never theatrical, never rushed like an auctioneer.
- Leave natural breathing room between thoughts. Use periods and punctuation for measured, unhurried cadence.
- Celebrate the PERSON and the OCCASION with quiet dignity.
- Never describe images. Never say "in this photo" or "you can see".
- No AI clichés (no elevate, tapestry, symphony, essence, timeless, etc.).
${voiceRules}

${schemaInstructions}`
      },
      {
        role: 'user',
        content: JSON.stringify({
          task: 'Write the spoken voiceover narration that walks through the delivery section by section',
          clientName,
          shootType,
          photographerBrief: brief,
          deliveryTitle: direction?.title,
          openingLine: direction?.openingLine,
          closingLine: direction?.closingLine,
          sectionTitles: sections.map(s => s.title)
        })
      }
    ],
    schema: z.object({ script: z.string().min(20).max(2000) }),
    repairLabel: 'narration script',
    schemaHint: schemaInstructions
  });

  return result.script;
}

*/
export async function createPortfolioDirection({ studioName, bio, location, items, imageInsights }) {
  const provider = config();
  const schemaInstructions = `Return a JSON object matching this schema:
{
  "headline": "<authentic display headline representing the studio, 8-100 chars>",
  "introLine": "<welcoming bio or intro statement, 10-240 chars>",
  "background": "ink" | "warm-black" | "ivory",
  "accent": "<six-digit hex color, e.g. #ff5a47>",
  "typeStyle": "editorial" | "modern" | "classic",
  "rhythm": "measured" | "bold" | "quiet",
  "heroPublicId": "<publicId of the single best lead photograph>",
  "orderedPublicIds": ["<all supplied publicIds ordered for optimal presentation>"],
  "designReason": "<rationale for the layout choices, 10-240 chars>"
}`;

  const result = await completion({
    model: provider.creativeModel,
    messages: [
      { role: 'system', content: `You are directing a public portfolio for a working Nigerian photographer or studio. Choose the visual treatment from the actual selected work. The headline must sound like the photographer speaking about their work and must make practical sense. ${voiceRules}\n\n${schemaInstructions}` },
      { role: 'user', content: JSON.stringify({ task: 'Direct this photographer portfolio', studioName, photographerBio: bio, location, selectedItems: items, photographAnalysis: imageInsights }) }
    ],
    schema: portfolioDirectionSchema,
    repairLabel: 'portfolio direction',
    schemaHint: schemaInstructions
  });
  const expected = items.map(item => item.publicId);
  if (result.orderedPublicIds.length !== expected.length || new Set(result.orderedPublicIds).size !== expected.length || result.orderedPublicIds.some(id => !expected.includes(id)) || !expected.includes(result.heroPublicId)) {
    const missing = expected.filter(id => !result.orderedPublicIds.includes(id));
    const validOrdered = result.orderedPublicIds.filter(id => expected.includes(id));
    result.orderedPublicIds = [...validOrdered, ...missing];
    if (!expected.includes(result.heroPublicId)) {
      result.heroPublicId = result.orderedPublicIds[0] || expected[0];
    }
  }
  return result;
}

export const creativeDirectorAllowlist = Object.freeze({ formats: FORMATS, motions: MOTIONS, transitions: TRANSITIONS, layouts: LAYOUTS });
