import { z } from 'zod';

const copy = (max) => z.string().trim().max(max).refine(value => !/[<>\u0000-\u0008]/.test(value), 'Use plain text.');
export const briefSchema = z.object({
  title: z.preprocess(v => String(v || '').trim().slice(0, 100) || 'New Veylo campaign', copy(100)).default('New Veylo campaign'),
  goal: z.preprocess(v => ['awareness', 'signups', 'feature', 'pro'].includes(v) ? v : 'signups', z.enum(['awareness', 'signups', 'feature', 'pro'])).default('signups'),
  notes: z.preprocess(v => String(v || '').trim().slice(0, 1600), copy(1600)).default(''),
  duration: z.preprocess(v => { const n = Number(v); return [15, 30, 45, 60].includes(n) ? n : 30; }, z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)])).default(30),
  formats: z.preprocess(v => Array.isArray(v) ? v.filter(f => ['video', 'portrait', 'square', 'story', 'carousel'].includes(f)) : (v === undefined ? ['video'] : v), z.array(z.enum(['video', 'portrait', 'square', 'story', 'carousel'])).min(1, 'Select at least one format.').max(5).transform(v => [...new Set(v)])),
  generateImages: z.preprocess(v => v !== false, z.boolean()).default(true),
  narration: z.preprocess(v => v !== false, z.boolean()).default(true),
  music: z.preprocess(v => v !== false, z.boolean()).default(true),
  soundDesign: z.preprocess(v => v !== false, z.boolean()).default(true)
}).passthrough();

export const shotSlotSchema = z.object({
  id: z.string(),
  sceneId: z.string().optional(),
  format: z.preprocess(v => ['video', 'photo', 'screen_recording'].includes(v) ? v : 'photo', z.enum(['video', 'photo', 'screen_recording'])),
  title: z.preprocess(v => String(v || '').slice(0, 100), z.string()).default('Shot asset'),
  description: z.preprocess(v => String(v || '').slice(0, 300), z.string()).default(''),
  why: z.preprocess(v => String(v || '').slice(0, 200), z.string()).default(''),
  required: z.boolean().default(true),
  assetId: z.string().optional()
}).passthrough();

export const sceneSchema = z.object({
  id: z.preprocess(v => { const m = String(v || '').match(/[1-8]/); return m ? 'scene-' + m[0] : 'scene-1'; }, z.string().regex(/^scene-[1-8]$/)),
  assetIds: z.preprocess(v => Array.isArray(v) ? v.slice(0, 3) : [], z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/)).max(3)),
  slotId: z.string().optional(),
  beat: z.preprocess(v => ['hook', 'flow', 'payoff', 'cta'].includes(v) ? v : 'flow', z.enum(['hook', 'flow', 'payoff', 'cta'])).default('flow'),
  sceneType: z.preprocess(v => ['whatsapp_hook', 'device_scroll', 'photo_reveal', 'outro_cta', 'split_comparison', 'standard'].includes(v) ? v : 'standard', z.enum(['whatsapp_hook', 'device_scroll', 'photo_reveal', 'outro_cta', 'split_comparison', 'standard'])).default('standard'),
  generatedImagePrompt: z.preprocess(v => String(v || '').slice(0, 1800), copy(1800)).default(''),
  layout: z.preprocess(v => ['fullbleed', 'editorial', 'split', 'collage', 'device', 'type'].includes(v) ? v : 'editorial', z.enum(['fullbleed', 'editorial', 'split', 'collage', 'device', 'type'])),
  headline: z.preprocess(v => String(v || '').trim().slice(0, 75) || 'Veylo showcase', copy(75).min(1)),
  body: z.preprocess(v => String(v || '').trim().slice(0, 150), copy(150)).default(''),
  eyebrow: z.preprocess(v => String(v || '').trim().slice(0, 40), copy(40)).default(''),
  narration: z.preprocess(v => String(v || '').trim().slice(0, 250), copy(250)).default(''),
  duration: z.preprocess(v => Math.max(2, Math.min(15, Number(v) || 5)), z.number().min(2).max(15)),
  focalPoint: z.preprocess(v => ({ x: Math.max(0, Math.min(100, Number(v?.x) || 50)), y: Math.max(0, Math.min(100, Number(v?.y) || 40)) }), z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) })),
  motion: z.preprocess(v => ['push', 'pull', 'pan', 'still'].includes(v) ? v : 'push', z.enum(['push', 'pull', 'pan', 'still'])),
  transition: z.preprocess(v => ['fade', 'slide', 'reveal', 'cut'].includes(v) ? v : 'fade', z.enum(['fade', 'slide', 'reveal', 'cut'])),
  grade: z.preprocess(v => ['original', 'warm', 'mono'].includes(v) ? v : 'original', z.enum(['original', 'warm', 'mono'])),
  textPosition: z.preprocess(v => ['top', 'bottom', 'center'].includes(v) ? v : (v === 'middle' ? 'center' : 'bottom'), z.enum(['top', 'bottom', 'center']))
}).passthrough();

export const planSchema = z.object({
  title: z.preprocess(v => String(v || '').trim().slice(0, 100) || 'Veylo campaign', copy(100).min(1)),
  angle: z.preprocess(v => String(v || '').trim().slice(0, 350) || 'Showcase finished photographs with quiet confidence.', copy(350).min(1)),
  audience: z.preprocess(v => String(v || '').trim().slice(0, 200) || 'Nigerian photographers and media studios', copy(200).min(1)),
  artDirection: z.preprocess(v => String(v || '').trim().slice(0, 600) || 'Editorial photograph-led composition with warm tones.', copy(600).min(1)),
  palette: z.preprocess(v => ['ember', 'ivory', 'ink'].includes(v) ? v : 'ember', z.enum(['ember', 'ivory', 'ink'])),
  musicMood: z.preprocess(v => ['warm', 'editorial', 'bright'].includes(v) ? v : 'warm', z.enum(['warm', 'editorial', 'bright'])),
  cta: z.preprocess(v => String(v || '').trim().slice(0, 65) || 'Try Veylo today', copy(65).min(1)),
  googleVidsPrompt: z.preprocess(v => String(v || '').slice(0, 2000), z.string()).default(''),
  captions: z.preprocess(v => ({
    instagram: String(v?.instagram || v?.caption || 'Showcase your finished shoots on Veylo. Link in bio.').slice(0, 1800),
    tiktok: String(v?.tiktok || v?.caption || 'Deliver client shoots with confidence.').slice(0, 1200),
    youtube: String(v?.youtube || v?.caption || 'Deliver client shoots with confidence on Veylo.').slice(0, 1800)
  }), z.object({ instagram: copy(1800), tiktok: copy(1200), youtube: copy(1800) }).passthrough()),
  hashtags: z.preprocess(v => Array.isArray(v) && v.length ? v.slice(0, 8).map(t => { const s = String(t || '').replace(/[^a-zA-Z0-9_\p{L}\p{N}]/gu, ''); return s ? (s.startsWith('#') ? s : '#' + s) : '#Veylo'; }) : ['#Veylo', '#NigerianPhotographer'], z.array(z.string()).max(8)),
  requiredAssets: z.preprocess(v => Array.isArray(v) ? v.slice(0, 5).map(a => String(a || '').slice(0, 220)) : [], z.array(copy(220)).max(5)),
  shotList: z.preprocess(v => Array.isArray(v) ? v : [], z.array(shotSlotSchema)).default([]),
  scenes: z.preprocess(v => Array.isArray(v) ? v.slice(0, 8).map((scene, i) => ({ ...scene, id: scene?.id || `scene-${i + 1}` })) : [], z.array(sceneSchema).min(1).max(8))
}).passthrough().superRefine((plan, ctx) => {
  if (new Set(plan.scenes.map(scene => scene.id)).size !== plan.scenes.length) ctx.addIssue({ code: 'custom', message: 'Scene IDs must be unique.' });
  if (plan.scenes.filter(scene => scene.generatedImagePrompt).length > 3) ctx.addIssue({ code: 'custom', message: 'Use at most three generated images.' });
});

export const revisionSchema = z.object({ instruction: copy(1200).min(3), sceneId: z.string().regex(/^scene-[1-8]$/).optional() }).strict();
export const FPS = 30;
export const BUSY = ['queued', 'running'];
export const DIMENSIONS = { video: [1080, 1920], portrait: [1080, 1350], square: [1080, 1080], story: [1080, 1920], carousel: [1080, 1350] };
