import { z } from 'zod';

const FORMATS = ['photo-story', 'editorial', 'photo-reveal', 'canvas', 'chapters', 'album'];
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
  music: z.object({
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

const frameSchema = z.object({
  assetId: z.string().min(1).max(100),
  sectionId: z.preprocess(val => String(val || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 32) || 'section-1', z.string().regex(/^[a-z0-9-]{1,32}$/)),
  role: z.preprocess(val => ['opening', 'hero', 'supporting', 'detail', 'pair', 'finale'].includes(val) ? val : 'supporting', z.enum(['opening', 'hero', 'supporting', 'detail', 'pair', 'finale'])),
  headline: z.preprocess(val => String(val || '').trim().slice(0, 70), z.string().max(70)),
  caption: z.preprocess(val => String(val || '').trim().slice(0, 180), z.string().max(180)),
  motion: z.preprocess(val => MOTIONS.includes(val) ? val : 'slow-push', z.enum(MOTIONS)),
  transition: z.preprocess(val => TRANSITIONS.includes(val) ? val : 'crossfade', z.enum(TRANSITIONS)),
  duration: z.preprocess(val => Math.min(12, Math.max(2, Number(val) || 4.5)), z.number().min(2).max(12)),
  emphasis: z.preprocess(val => Math.min(10, Math.max(1, Math.round(Number(val) || 5))), z.number().int().min(1).max(10))
});

const frameBatchSchema = z.object({ frames: z.array(frameSchema).min(1).max(50) });

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

function jsonFromReply(reply) {
  const cleaned = String(reply || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
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

  if (start < 0 || end <= start) throw new Error('The model did not return JSON.');
  const raw = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(raw);
  } catch (initialError) {
    const sanitized = raw.replace(/,\s*([}\]])/g, '$1');
    try {
      return JSON.parse(sanitized);
    } catch {
      throw initialError;
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
    currentMessages = [
      ...messages,
      { role: 'assistant', content: String(reply || '') },
      { role: 'user', content: `Your ${repairLabel} response was invalid: ${lastError.message}. Return the complete corrected JSON object only. Keep every required field and use only the allowed values.${schemaHint ? `\n\nSchema specification:\n${schemaHint}` : ''}` }
    ];
  }
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
7. Leave captions empty when a photograph speaks for itself.

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
    { "format": "album", "score": <1-100>, "reason": "..." }
  ]
}
Rank all six delivery formats exactly once.`;

  return completion({
    model: provider.creativeModel,
    messages: [
      { role: 'system', content: `You are Veylo’s senior creative director. Decide how a finished shoot should be delivered. Rank all six formats exactly once. ${voiceRules}\n\n${schemaInstructions}` },
      { role: 'user', content: JSON.stringify({ task: 'Understand this complete shoot and rank the six delivery formats', clientName, shootType, photographerBrief: brief, formats: FORMATS, photographs: compact }) }
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
  "music": { "mood": "<mood title, 2-80 chars>", "genre": "<genre title, 2-80 chars>", "tempo": "slow" | "mid" | "upbeat" },
  "narrationRecommended": boolean,
  "sections": [
    { "id": "<kebab-case-id>", "title": "<section title>", "subtitle": "<section subtitle>", "layout": "hero" | "single" | "pair" | "triptych" | "grid" | "strip" | "spread" | "cluster" | "chapter-cover" }
  ]
}`;

  return completion({
    model: provider.creativeModel,
    messages: [
      { role: 'system', content: `You are Veylo’s senior creative director. Design one ${format} presentation around the actual finished shoot. The format must feel structurally distinct from the other five formats. Photo Story is paced and sequential. Editorial is a scrollable publication. Photo Reveal is client-paced and suspenseful. Canvas is spatial and freely explored. Chapters is a non-linear moment selector. Album uses deliberate page turns and spreads. ${voiceRules}\n\n${schemaInstructions}` },
      { role: 'user', content: JSON.stringify({ task: revisionInstruction ? 'Revise the complete art direction and section plan' : 'Create the complete art direction and section plan', format, clientName, shootType, photographerBrief: brief, collectionAnalysis, currentDirection, photographerRevision: revisionInstruction, photographs: compact }) }
    ],
    schema: directionSchema,
    repairLabel: 'creative direction',
    schemaHint: schemaInstructions
  });
}

export async function createFrameBatch({ format, brief, shootType, clientName, direction, imageInsights, revisionInstruction = '', currentFrames = [] }) {
  const provider = config();
  const validSectionIds = direction?.sections?.map(s => s.id) || ['main'];
  const schemaInstructions = `Return a JSON object matching this schema:
{
  "frames": [
    {
      "assetId": "<string matching supplied assetId>",
      "sectionId": "<one of: ${validSectionIds.join(', ')}>",
      "role": "opening" | "hero" | "supporting" | "detail" | "pair" | "finale",
      "headline": "<brief evocative headline under 70 chars, or empty>",
      "caption": "<natural human caption under 180 chars, or empty>",
      "motion": "slow-push" | "slow-pull" | "pan-left" | "pan-right" | "float" | "still",
      "transition": "fade" | "crossfade" | "wipe" | "slide" | "reveal" | "cut",
      "duration": <number between 2 and 12 seconds>,
      "emphasis": <integer from 1 to 10>
    }
  ]
}
Return one frame per photograph in the supplied order.`;

  // Strip image insights to minimal context — remove visual descriptions that
  // cause the model to echo alt-text instead of writing occasion-focused copy
  const minimalInsights = (imageInsights || []).map(insight => ({
    assetId: insight.assetId,
    moment: insight.moment,
    visualWeight: insight.visualWeight,
    orientation: insight.orientation
  }));

  return completion({
    model: provider.creativeModel,
    messages: [
      {
        role: 'system',
        content: `You are writing headlines and captions for a ${format} delivery of a "${shootType || 'photo'}" shoot for "${clientName || 'Client'}".

THE PHOTOGRAPHER SAYS THIS SHOOT IS ABOUT:
"${brief || 'Client photo collection'}"

THIS IS YOUR PRIMARY DIRECTIVE: Every headline and caption must celebrate what this shoot represents — the occasion, the milestone, the person. Speak directly to ${clientName || 'the client'} with warmth.

You have minimal context about each photo (the type of moment it captures and its visual weight). Use that to vary your writing — but NEVER describe what you see. Never write alt-text. Never mention clothing, backdrops, poses, or lighting.

Assign every photograph to one existing section (${validSectionIds.join(', ')}). Choose cinematic motions and transitions that suit the emotional rhythm.

${voiceRules}

${schemaInstructions}`
      },
      {
        role: 'user',
        content: JSON.stringify({
          task: revisionInstruction ? 'Revise this batch of photograph directions' : 'Direct this batch of photographs',
          clientName,
          shootPurposeAndBrief: brief,
          deliveryDirection: direction,
          photographerRevision: revisionInstruction,
          currentFrames,
          photographs: minimalInsights
        })
      }
    ],
    schema: frameBatchSchema,
    repairLabel: 'photograph direction',
    schemaHint: schemaInstructions
  });
}

export async function createNarrationScript({ clientName, shootType, brief, direction, format }) {
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
- Speak like a real human — warm, direct, unhurried.
- Celebrate the OCCASION (the ${shootType || 'shoot'}), not the photographs themselves.
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
