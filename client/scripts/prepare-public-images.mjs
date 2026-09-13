import sharp from 'sharp';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/veylo');
const sources = {
  blue: 'blue.jpeg', charm: 'charm.jpeg', sunshine: 'sunshine.jpeg', smile: 'smile.jpeg',
  'review-look-1': 'look/review-1.jpeg', 'review-look-2': 'look/review-2.jpeg', 'review-look-3': 'look/review-3.jpeg', 'review-look-4': 'look/review-4.jpeg',
  'look-1': 'look/look-1.jpeg', 'look-2': 'look/look-2.jpeg', 'look-3': 'look/look-3.jpeg', 'look-4': 'look/look-4.jpeg',
  sharon: 'show/sharon-1.jpeg', 'sharon-side': 'show/sharon-2.jpeg', birthday: 'ada/ada-1.jpg', 'birthday-detail': 'ada/ada-3.jpg',
  wedding: 'wedding/wedding-1.jpg', 'wedding-detail': 'wedding/wedding-3.jpg', editorial: 'pv-hero.jpeg', fashion: 'pv-editorial.jpeg',
  commercial: 'editorial/editorial-1.jpg', 'commercial-detail': 'editorial/editorial-3.jpg', photographer: 'pv-photographer.jpeg', sam: 'sam/sam.jpeg',
  'hero-story': 'hero/story.jpeg', 'hero-editorial': 'hero/editorial.jpeg', 'hero-reveal': 'hero/reveal.jpeg', 'hero-canvas': 'hero/canvas.jpeg',
  'hero-chapters': 'hero/chapters.jpeg', 'hero-album-fa-source': 'fa.jpeg', 'portrait-red': 'pv-red-phone.jpeg', 'portrait-bnw': 'pv-bnw.jpeg',
  'portrait-green': 'pv-green-portrait.jpeg', 'portrait-motion': 'pv-motion.jpeg', 'portrait-soft': 'pv-soft.jpeg', 'portrait-white': 'pv-white-suit.jpeg',
  'portrait-reaching': 'pv-reaching.jpeg', 'portrait-luxury': 'pv-luxury.jpeg', 'portrait-casual': 'pv-casual.jpeg', 'portrait-brand': 'pv-brand.jpeg',
  'portrait-espresso': 'pv-espresso.jpeg', 'portrait-male': 'pv-male-portrait.jpeg', 'portrait-shay': 'pv-shay.jpeg', 'portrait-striking': 'pv-striking.jpeg',
  'portrait-marvis': 'pv-marvis.jpeg', 'portrait-ghana': 'pv-ghana.jpeg', 'portrait-fashion': 'pv-white-fashion.jpeg',
  'audience-portrait': 'audience/portrait-photographers.jpeg', 'audience-birthday': 'audience/birthday-shoots.jpeg',
  'audience-commercial': 'audience/commercial-media.jpeg', 'niche-camera': 'niche/camera-portrait.jpeg', 'niche-blue': 'niche/blue-expression.jpeg',
  'formats-hero-main': 'formats/hero-main.jpeg', 'formats-hero-detail-one': 'formats/hero-detail-one.jpeg',
  'formats-hero-detail-two': 'formats/hero-detail-two.jpeg', 'formats-director-corporate': 'formats/director-corporate.jpeg',
};
for (const [preset, folder, count, ext] of [['sharon', 'show', 4, 'jpeg'], ['ada', 'ada', 5, 'jpg'], ['wedding', 'wedding', 5, 'jpg']]) {
  for (let i = 1; i <= count; i++) sources['demo-' + preset + '-' + i] = folder + '/' + preset + '-' + i + '.' + ext;
}
for (let i = 1; i <= 6; i++) sources['demo-courage-' + i] = 'courage/courage-' + i + '.jpeg';
for (let i = 1; i <= 6; i++) sources['demo-lora-' + i] = 'lora/lora-' + i + '.jpeg';
for (let i = 1; i <= 5; i++) sources['demo-editorial-' + i] = 'editorial/editorial-' + i + '.jpg';
sources['demo-album-fa-source'] = 'fa.jpeg';
for (let i = 2; i <= 5; i++) sources['demo-album-fa-' + i] = 'album/family-' + i + '.png';

await mkdir(path.join(root, 'web'), { recursive: true });
let total = 0;
for (const [name, source] of Object.entries(sources)) {
  for (const width of [480, 960, 1440]) {
    const output = path.join(root, 'web', name + '-' + width + '.webp');
    await sharp(path.join(root, source)).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 82, effort: 5 }).toFile(output);
    total += (await stat(output)).size;
  }
}
console.log('Prepared ' + Object.keys(sources).length * 3 + ' public preview images (' + (total / 1024 / 1024).toFixed(2) + ' MB total). Original files preserved.');
