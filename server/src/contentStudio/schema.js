import { z } from 'zod';

const copy = (max) => z.string().trim().max(max).refine(value => !/[<>\u0000-\u0008]/.test(value), 'Use plain text.');
export const briefSchema = z.object({
  title: copy(100).default('New Veylo campaign'),
  goal: z.enum(['awareness', 'signups', 'feature', 'pro']).default('signups'),
  notes: copy(1600).default(''),
  duration: z.enum([15, 30, 45, 60]).default(30),
  formats: z.array(z.enum(['video', 'portrait', 'square', 'story', 'carousel'])).min(1).max(5).transform(v => [...new Set(v)]),
  generateImages: z.boolean().default(true),
  narration: z.boolean().default(true),
  music: z.boolean().default(true),
  soundDesign: z.boolean().default(true)
}).strict();

export const sceneSchema = z.object({
  id: z.string().regex(/^scene-[1-8]$/),
  assetIds: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/)).max(3),
  generatedImagePrompt: copy(1800).default(''),
  layout: z.enum(['fullbleed', 'editorial', 'split', 'collage', 'device', 'type']),
  headline: copy(75).min(1),
  body: copy(150).default(''),
  eyebrow: copy(40).default(''),
  narration: copy(250).default(''),
  duration: z.number().min(2).max(15),
  focalPoint: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }),
  motion: z.enum(['push', 'pull', 'pan', 'still']),
  transition: z.enum(['fade', 'slide', 'reveal', 'cut']),
  grade: z.enum(['original', 'warm', 'mono']),
  textPosition: z.enum(['top', 'bottom', 'center'])
}).strict();

export const planSchema = z.object({
  title: copy(100).min(1),
  angle: copy(350).min(1),
  audience: copy(200).min(1),
  artDirection: copy(600).min(1),
  palette: z.enum(['ember', 'ivory', 'ink']),
  musicMood: z.enum(['warm', 'editorial', 'bright']),
  cta: copy(65).min(1),
  captions: z.object({ instagram: copy(1800), tiktok: copy(1200), youtube: copy(1800) }).strict(),
  hashtags: z.array(z.string().regex(/^#[\p{L}\p{N}_]{1,40}$/u)).max(8),
  requiredAssets: z.array(copy(220)).max(5),
  scenes: z.array(sceneSchema).min(3).max(8)
}).strict().superRefine((plan, ctx) => {
  if (new Set(plan.scenes.map(scene => scene.id)).size !== plan.scenes.length) ctx.addIssue({ code: 'custom', message: 'Scene IDs must be unique.' });
  if (plan.scenes.filter(scene => scene.generatedImagePrompt).length > 3) ctx.addIssue({ code: 'custom', message: 'Use at most three generated images.' });
});

export const revisionSchema = z.object({ instruction: copy(1200).min(3), sceneId: z.string().regex(/^scene-[1-8]$/).optional() }).strict();
export const FPS = 30;
export const BUSY = ['queued', 'running'];
export const DIMENSIONS = { video: [1080, 1920], portrait: [1080, 1350], square: [1080, 1080], story: [1080, 1920], carousel: [1080, 1350] };
