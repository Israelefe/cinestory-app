import { z } from 'zod';

const FORMATS = ['photo-story', 'editorial', 'photo-reveal', 'canvas', 'chapters', 'album'];
const MOTIONS = ['slow-push', 'slow-pull', 'pan-left', 'pan-right', 'float', 'still'];
const TRANSITIONS = ['fade', 'crossfade', 'wipe', 'slide', 'reveal', 'cut'];
const LAYOUTS = ['hero', 'single', 'pair', 'triptych', 'grid', 'strip', 'spread', 'cluster', 'chapter-cover'];

const imageInsightSchema = z.object({
  assetId: z.string().min(1).max(500),
  summary: z.string().min(4).max(240),
  subjects: z.array(z.string().min(1).max(60)).max(8),
  expression: z.string().max(100),
  setting: z.string().max(120),
  clothing: z.string().max(140),
  dominantColors: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).min(1).max(5),
  orientation: z.enum(['portrait', 'landscape', 'square']),
  visualWeight: z.number().int().min(1).max(10),
  moment: z.string().max(120)
}).strict();

const visionBatchSchema = z.object({ images: z.array(imageInsightSchema).min(1).max(20) }).strict();

const recommendationSchema = z.object({
  collectionSummary: z.string().min(20).max(500),
  clientThroughline: z.string().min(10).max(300),
  formatRecommendations: z.array(z.object({
    format: z.enum(FORMATS),
    score: z.number().int().min(1).max(100),
    reason: z.string().min(8).max(180)
  }).strict()).length(6)
}).strict().superRefine((value, context) => {
  const returned = value.formatRecommendations.map(item => item.format);
  if (new Set(returned).size !== FORMATS.length || FORMATS.some(format => !returned.includes(format))) context.addIssue({ code: 'custom', path: ['formatRecommendations'], message: 'Return every delivery format exactly once.' });
});

const directionSchema = z.object({
  format: z.enum(FORMATS),
  title: z.string().min(2).max(80),
  openingLine: z.string().min(4).max(140),
  closingLine: z.string().min(4).max(160),
  designReason: z.string().min(10).max(240),
  palette: z.object({
    background: z.string().regex(/^#[0-9a-f]{6}$/i),
    surface: z.string().regex(/^#[0-9a-f]{6}$/i),
    text: z.string().regex(/^#[0-9a-f]{6}$/i),
    accent: z.string().regex(/^#[0-9a-f]{6}$/i)
  }).strict(),
  typography: z.object({ display: z.enum(['editorial-serif', 'clean-sans', 'condensed-sans', 'soft-serif']), body: z.enum(['clean-sans', 'editorial-serif']) }).strict(),
  pace: z.enum(['measured', 'warm', 'energetic']),
  music: z.object({ mood: z.string().min(2).max(80), genre: z.string().min(2).max(80), tempo: z.enum(['slow', 'mid', 'upbeat']) }).strict(),
  narrationRecommended: z.boolean(),
  sections: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]{1,32}$/), title: z.string().min(1).max(60), subtitle: z.string().max(120), layout: z.enum(LAYOUTS) }).strict()).min(1).max(12)
}).strict().superRefine((value, context) => {
  if (new Set(value.sections.map(section => section.id)).size !== value.sections.length) context.addIssue({ code: 'custom', path: ['sections'], message: 'Every section id must be unique.' });
});

const frameSchema = z.object({
  assetId: z.string().min(1).max(100),
  sectionId: z.string().regex(/^[a-z0-9-]{1,32}$/),
  role: z.enum(['opening', 'hero', 'supporting', 'detail', 'pair', 'finale']),
  headline: z.string().max(70),
  caption: z.string().max(180),
  motion: z.enum(MOTIONS),
  transition: z.enum(TRANSITIONS),
  duration: z.number().min(2).max(12),
  emphasis: z.number().int().min(1).max(10)
}).strict();

const frameBatchSchema = z.object({ frames: z.array(frameSchema).min(1).max(50) }).strict();
const portfolioDirectionSchema = z.object({
  headline: z.string().min(8).max(100),
  introLine: z.string().min(10).max(240),
  background: z.enum(['ink', 'warm-black', 'ivory']),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i),
  typeStyle: z.enum(['editorial', 'modern', 'classic']),
  rhythm: z.enum(['measured', 'bold', 'quiet']),
  heroPublicId: z.string().min(5).max(500),
  orderedPublicIds: z.array(z.string().min(5).max(500)).min(4).max(50),
  designReason: z.string().min(10).max(240)
}).strict();

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
  return { apiKey, baseUrl: baseUrl.replace(/\/$/, ''), visionModel: process.env.ALIBABA_VISION_MODEL || 'qwen3.7-flash', creativeModel: process.env.ALIBABA_CREATIVE_MODEL || 'deepseek-v4.1-flash' };
}

function jsonFromReply(reply) {
  const cleaned = String(reply || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The model did not return JSON.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function completion({ model, messages, temperature = 0.35, maxTokens = 6000, schema, repairLabel }) {
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
      { role: 'user', content: `Your ${repairLabel} response was invalid: ${lastError.message}. Return the complete corrected JSON object only. Keep every required field and use only the allowed values.` }
    ];
  }
  const error = new Error(`The AI Creative Director returned an invalid ${repairLabel}. Please run it again.`);
  error.code = 'INVALID_MODEL_OUTPUT';
  throw error;
}

const voiceRules = `Write plain, specific English that a Nigerian photographer would comfortably send to a real client. Captions must describe the person, shoot, clothing, expression, or occasion visible in the photographs. Never invent a relationship, age, event, location, or personal fact that the photographer did not provide. Never use: elevate, unlock, seamlessly, tapestry, symphony, beacon, testament, crescendo, delve, journey, essence, timeless radiance, pure grace, or grand finale. No slogans, emojis, hashtags, or vague praise.`;

export async function analyzeImageBatch({ brief, shootType, clientName, assets }) {
  const provider = config();
  const content = [{ type: 'text', text: `Analyze these ${assets.length} finished photographs as one batch from the same client shoot. The photographer wrote: "${brief}". Shoot type: "${shootType}". Client name: "${clientName}". Return one images item for every supplied assetId, in the same order. Describe only what is visible. Colors must be six-digit hex values.` }];
  for (const asset of assets) {
    content.push({ type: 'text', text: `assetId: ${asset.assetId}` });
    content.push({ type: 'image_url', image_url: { url: asset.analysisUrl } });
  }
  const result = await completion({ model: provider.visionModel, messages: [{ role: 'system', content: 'You are Veylo’s visual analyst. Inspect finished photographs accurately. Do not identify real people or infer sensitive traits. Return JSON only.' }, { role: 'user', content }], temperature: 0.15, maxTokens: 5000, schema: visionBatchSchema, repairLabel: 'image analysis' });
  const expected = assets.map(asset => asset.assetId);
  if (result.images.length !== expected.length || result.images.some((item, index) => item.assetId !== expected[index])) {
    const error = new Error('The vision model did not return one ordered analysis for every photograph.');
    error.code = 'INVALID_VISION_SEQUENCE';
    throw error;
  }
  return result.images;
}

export async function recommendFormats({ brief, shootType, clientName, imageInsights }) {
  const provider = config();
  const compact = imageInsights.map(item => ({ assetId: item.assetId, summary: item.summary, expression: item.expression, setting: item.setting, clothing: item.clothing, colors: item.dominantColors, weight: item.visualWeight, moment: item.moment }));
  return completion({
    model: provider.creativeModel,
    messages: [
      { role: 'system', content: `You are Veylo’s senior creative director. Decide how a finished shoot should be delivered. Rank all six formats exactly once. ${voiceRules}` },
      { role: 'user', content: JSON.stringify({ task: 'Understand this complete shoot and rank the six delivery formats', clientName, shootType, photographerBrief: brief, formats: FORMATS, photographs: compact }) }
    ],
    schema: recommendationSchema,
    repairLabel: 'format recommendation'
  });
}

export async function createGlobalDirection({ format, brief, shootType, clientName, collectionAnalysis, imageInsights, revisionInstruction = '', currentDirection = null }) {
  const provider = config();
  const compact = imageInsights.map(item => ({ assetId: item.assetId, summary: item.summary, colors: item.dominantColors, weight: item.visualWeight, moment: item.moment }));
  return completion({
    model: provider.creativeModel,
    messages: [
      { role: 'system', content: `You are Veylo’s senior creative director. Design one ${format} presentation around the actual finished shoot. The format must feel structurally distinct from the other five formats. Photo Story is paced and sequential. Editorial is a scrollable publication. Photo Reveal is client-paced and suspenseful. Canvas is spatial and freely explored. Chapters is a non-linear moment selector. Album uses deliberate page turns and spreads. ${voiceRules}` },
      { role: 'user', content: JSON.stringify({ task: revisionInstruction ? 'Revise the complete art direction and section plan' : 'Create the complete art direction and section plan', format, clientName, shootType, photographerBrief: brief, collectionAnalysis, currentDirection, photographerRevision: revisionInstruction, photographs: compact }) }
    ],
    schema: directionSchema,
    repairLabel: 'creative direction'
  });
}

export async function createFrameBatch({ format, brief, clientName, direction, imageInsights, revisionInstruction = '', currentFrames = [] }) {
  const provider = config();
  return completion({
    model: provider.creativeModel,
    messages: [
      { role: 'system', content: `You are completing a Veylo ${format}. Assign every supplied photograph to one existing section. Return one frame per assetId in the supplied order. Captions can be empty when the photograph works better without text. Use "still" sparingly; movement must suit the image. ${voiceRules}` },
      { role: 'user', content: JSON.stringify({ task: revisionInstruction ? 'Revise this batch of photograph directions' : 'Direct this batch of photographs', clientName, photographerBrief: brief, direction, photographerRevision: revisionInstruction, currentFrames, photographs: imageInsights }) }
    ],
    schema: frameBatchSchema,
    repairLabel: 'photograph direction'
  });
}

export async function createPortfolioDirection({ studioName, bio, location, items, imageInsights }) {
  const provider = config();
  const result = await completion({
    model: provider.creativeModel,
    messages: [
      { role: 'system', content: `You are directing a public portfolio for a working Nigerian photographer or studio. Choose the visual treatment from the actual selected work. The headline must sound like the photographer speaking about their work and must make practical sense. ${voiceRules}` },
      { role: 'user', content: JSON.stringify({ task: 'Direct this photographer portfolio', studioName, photographerBio: bio, location, selectedItems: items, photographAnalysis: imageInsights }) }
    ],
    schema: portfolioDirectionSchema,
    repairLabel: 'portfolio direction'
  });
  const expected = items.map(item => item.publicId);
  if (result.orderedPublicIds.length !== expected.length || new Set(result.orderedPublicIds).size !== expected.length || result.orderedPublicIds.some(id => !expected.includes(id)) || !expected.includes(result.heroPublicId)) {
    const error = new Error('The creative model did not return the complete selected portfolio set.');
    error.code = 'INVALID_PORTFOLIO_SEQUENCE';
    throw error;
  }
  return result;
}

export const creativeDirectorAllowlist = Object.freeze({ formats: FORMATS, motions: MOTIONS, transitions: TRANSITIONS, layouts: LAYOUTS });
