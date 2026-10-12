import fs from 'node:fs/promises';
import path from 'node:path';
import { root } from '../src/server/config.mjs';
import { templateProps, jsonSchema } from '../src/contracts/index.mjs';
import { atomicWrite } from '../src/server/storage.mjs';
const recipes = {
  HookKinetic: ['Audience and pain at frame zero.', 'Short hook, four lines maximum; emphasis stays within the fitted words.', { text: 'Photographers, make the handover count.', emphasis: ['handover'] }],
  VideoScene: ['Cinematic context clip supplied manually from Google Flow.', 'Use reviewed context footage; never invent the product interface or finished client work.', { slotId: 'context-clip', caption: 'Give the handover some care.', framing: 'cover' }],
  PainMontage: ['Quick cuts showing the old handover problem.', 'Cycle cleared context slots every 48 frames; no fabricated notifications or claims.', { slotIds: ['context-image'], caption: 'A finished shoot. An ordinary link.' }],
  PhoneDemo: ['A real Veylo capture inside a device frame.', 'Use current manifest IDs and DOM targets; keep the product action large enough to follow.', { clipId: 'photoswap-interaction', zoomTargets: [], caption: 'One photograph at a time.' }],
  UIZoom: ['A larger crop of a real product action.', 'Highlight manifest targets. Never redraw buttons or add unsupported product states.', { clipId: 'photoswap-gallery', zoomTargets: [], caption: 'The collection stays together.' }],
  MotionImage: ['A real result photograph or approved context image with movement.', 'Use push-in, drift, mask, light sweep or collage. Generated context cannot stand in for real finished work.', { slotId: 'finished-photo', caption: 'A considered first viewing.', preset: 'drift' }],
  BigCaptions: ['A short, readable statement between product actions.', 'Fitted type, shared easing and stagger. Word-timed narration captions are a separate global layer.', { text: 'Present the finished collection with Veylo.' }],
  BeforeAfterSplit: ['Compare the old handover with a real Veylo viewing.', 'Use a real capture and cleared reference. No invented competitor interfaces or income promises.', { slotId: 'context-image', clipId: 'photoswap-interaction', before: 'The ordinary link', after: 'A considered viewing' }],
  StatReveal: ['A statement backed by an approved fact ID.', 'Disabled for unsourced numerical claims. Never introduce prices or allowances.', { factId: 'feature:photoswap', text: 'One photograph at a time.' }],
  CTACard: ['One approved action at the end.', 'Use offer.json verbatim; a free-account CTA never makes paid features free.', { ctaId: 'start-free', text: 'Get started for free. Link in bio.' }],
};
for (const [name, schema] of Object.entries(templateProps)) {
  const [purpose, rules, example] = recipes[name]; schema.parse(example);
  await atomicWrite(path.join(root, 'formats', name + '.json'), { name, component: 'src/render/Composition.jsx#Scene', purpose, layout: '1080×1920; foreground safe rectangle x80–960, y250–1500; templates inset further for animated words.', typography: 'Outfit, from extracted design-language.json; fit measured text before drawing.', motion: { easing: [0.22, 1, 0.36, 1], enterFrames: 14, staggerFrames: 2, transitionFrames: 8 }, rules, propsSchema: jsonSchema(schema), example });
}
console.log('Extracted ten template contracts and format specifications.');
