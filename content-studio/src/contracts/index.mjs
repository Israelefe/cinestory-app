import { z } from 'zod';

export const briefSchema = z.object({
  title: z.string().trim().min(3).max(120),
  audience: z.enum(['wedding', 'event', 'portrait', 'studio', 'commercial']),
  focus: z.string().trim().min(1).max(80),
  platform: z.enum(['tiktok', 'instagram', 'both']),
  seconds: z.number().int().min(20).max(40).default(32),
  notes: z.string().trim().max(2000).default(''),
}).strict();
export const reviewSchema = z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().trim().min(3).max(1500) }).strict();
export const claimRefusalSchema = z.object({ refused: z.boolean(), reason: z.enum(['unapproved_statistic', 'unsupported_product_claim', 'allowed_claim']) }).strict();
export const credentialsSchema = z.object({ groq: z.string().trim().max(300).optional(), deepgram: z.string().trim().max(300).optional(), voice: z.enum(['', 'flux-hannah-en', 'flux-kit-en', 'flux-alexis-en']).optional(), jobCap: z.number().min(0.01).max(100).optional(), dayCap: z.number().min(0.01).max(500).optional() }).strict();
export const rightsSchema = z.object({ rights: z.enum(['cleared', 'pending', 'blocked']), licenseNote: z.string().trim().min(5).max(1500), generated: z.boolean(), consent: z.boolean() }).strict();
export const sections = ['hook', 'problem', 'demo', 'result', 'cta'];
export const scriptSchema = z.object({
  variants: z.array(z.object({ id: z.string().max(30), title: z.string().max(100), angle: z.enum(['pain', 'result', 'curiosity']), audience: briefSchema.shape.audience, featureId: z.string().max(80), hookType: z.string().max(60),
    voiceover: z.object(Object.fromEntries(sections.map(key => [key, z.string().trim().max(1200)]))).strict(),
    onScreen: z.object(Object.fromEntries(sections.map(key => [key, z.string().trim().max(180)]))).strict(),
    captureIds: z.array(z.string()).min(1).max(5), factIds: z.array(z.string()).max(20), ctaId: z.string().max(80), why: z.string().max(350),
  }).strict()).length(3),
}).strict();
export const pitchSchema = z.object({ pitches: z.array(z.object({ id: z.string(), title: z.string().max(100), featureId: z.string(), problem: z.string().max(350), benefit: z.string().max(350), hook: z.string().max(160), direction: z.string().max(700), why: z.string().max(350) }).strict()).length(3) }).strict();
export const templateProps = {
  HookKinetic: z.object({ text: z.string().max(180), emphasis: z.array(z.string()).max(4) }).strict(),
  VideoScene: z.object({ slotId: z.string(), caption: z.string().max(110), framing: z.enum(['cover', 'contain']) }).strict(),
  PainMontage: z.object({ slotIds: z.array(z.string()).min(1).max(4), caption: z.string().max(110) }).strict(),
  PhoneDemo: z.object({ clipId: z.string(), zoomTargets: z.array(z.string()).max(5), caption: z.string().max(110) }).strict(),
  UIZoom: z.object({ clipId: z.string(), zoomTargets: z.array(z.string()).max(5), caption: z.string().max(110) }).strict(),
  MotionImage: z.object({ slotId: z.string(), caption: z.string().max(110), preset: z.enum(['pushIn', 'drift', 'maskedReveal', 'lightSweep', 'collage']) }).strict(),
  BigCaptions: z.object({ text: z.string().max(180) }).strict(),
  BeforeAfterSplit: z.object({ slotId: z.string(), clipId: z.string(), before: z.string().max(90), after: z.string().max(90) }).strict(),
  StatReveal: z.object({ factId: z.string(), text: z.string().max(160) }).strict(),
  CTACard: z.object({ ctaId: z.string(), text: z.string().max(100) }).strict(),
};
const motionSchema = z.object({ enter: z.enum(['fade', 'wordStagger', 'mask', 'slide']), camera: z.enum(['none', 'pushIn', 'drift', 'followTargets']) }).strict();
export const sceneSchema = z.discriminatedUnion('template', Object.entries(templateProps).map(([name, props]) => z.object({ id: z.string().max(40), section: z.enum(sections), voLineId: z.enum(sections), template: z.literal(name), props, motion: motionSchema, transitionOut: z.enum(['cut', 'fade', 'slideWipe']) }).strict()));
export const assetRequestSchema = z.object({ id: z.string().regex(/^[a-z][a-z0-9_-]{0,49}$/), kind: z.enum(['image', 'video']), use: z.enum(['context', 'finished_work']), purpose: z.string().max(600), prompt: z.string().max(5000), aspectRatio: z.literal('9:16'), resolution: z.enum(['1080p', '2K', '4K']), sourceSeconds: z.union([z.literal(0), z.literal(4), z.literal(6), z.literal(8), z.literal(10)]), references: z.array(z.string()).max(14), filename: z.string().max(80) }).strict();
export function scenePropsSchema(template, { captures, requests, variant, knowledge }) {
  const base = templateProps[template], fields = {};
  const allowed = (ids, label) => { if (!ids.length) throw new Error(`The ${template} template needs ${label}. Repair the storyboard plan.`); return z.enum([...new Set(ids)]); };
  if (base.shape.clipId) fields.clipId = allowed(captures.filter(clip => variant.captureIds.includes(clip.id) && clip.approved && !clip.stale).map(clip => clip.id), 'a selected current recording');
  if (base.shape.slotId) fields.slotId = allowed(requests.filter(slot => template !== 'VideoScene' || slot.kind === 'video').map(slot => slot.id), 'an existing media slot');
  if (base.shape.slotIds) fields.slotIds = z.array(allowed(requests.map(slot => slot.id), 'existing media slots')).min(1).max(4);
  if (base.shape.ctaId) fields.ctaId = z.literal(variant.ctaId);
  if (base.shape.factId) fields.factId = allowed(knowledge.facts.filter(fact => variant.factIds.includes(fact.id)).map(fact => fact.id), 'a script-approved fact');
  return base.extend(fields);
}
export const storyboardSchema = z.object({ title: z.string().max(120), scenes: z.array(sceneSchema).min(5).max(20), requests: z.array(assetRequestSchema).max(12), coverSceneId: z.string().max(40) }).strict();
export const visionSchema = z.object({ scores: z.object({ relevance: z.number().min(0).max(5), quality: z.number().min(0).max(5), composition: z.number().min(0).max(5), style: z.number().min(0).max(5), artifacts: z.number().min(0).max(5) }).strict(), watermark: z.boolean(), privateInformation: z.boolean(), generatedText: z.boolean(), allGeneratedPeopleBlackAdults: z.boolean(), uncertain: z.boolean(), reasons: z.array(z.string()).max(20) }).strict();
export const captionSchema = z.object({ caption: z.string().max(2000), hashtags: z.array(z.string().regex(/^#[\p{L}\p{N}_]+$/u)).max(12), factIds: z.array(z.string()).max(20) }).strict();
export function jsonSchema(schema) { return z.toJSONSchema(schema, { target: 'draft-7', unrepresentable: 'throw', reused: 'ref' }); }
