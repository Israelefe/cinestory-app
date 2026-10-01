import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import PortfolioMedia from '../models/PortfolioMedia.js';
import { cloudinary, configureCloudinary } from './cloudinary.service.js';
export const portfolioVariants = Object.freeze({
  '400': 'c_limit,w_400/f_webp,q_auto:good',
  '800': 'c_limit,w_800/f_webp,q_auto:good',
  '1600': 'c_limit,w_1600/f_webp,q_auto:good',
  og: 'c_fill,w_1200,h_630,g_auto/f_jpg,q_auto:good'
});
const preparing = new Map();
export async function preparePortfolioMedia(publicId, keys = Object.keys(portfolioVariants)) {
  const cached = await PortfolioMedia.findOne({
    publicId
  }).lean();
  if (cached && keys.every(key => cached.variants?.[key])) return cached;
  if (preparing.has(publicId)) {
    await preparing.get(publicId);
    return preparePortfolioMedia(publicId, keys);
  }
  const missing = keys.filter(key => !cached?.variants?.[key]);
  const pending = (async () => {
    if (!configureCloudinary()) throw Object.assign(new Error('Photograph previews are temporarily unavailable.'), {
      status: 503
    });
    const resource = await cloudinary.uploader.explicit(publicId, {
      type: 'authenticated',
      resource_type: 'image',
      eager: missing.map(key => portfolioVariants[key]).join('|')
    });
    const variants = Object.fromEntries(missing.map((key, index) => [key, resource.eager?.[index]?.secure_url]));
    if (Object.values(variants).some(url => !url || !url.startsWith('https://res.cloudinary.com/'))) throw Object.assign(new Error('Some photograph previews are still being prepared. Please try again.'), {
      status: 503
    });
    return PortfolioMedia.findOneAndUpdate({
      publicId
    }, {
      $set: {
        ...Object.fromEntries(Object.entries(variants).map(([key, value]) => [`variants.${key}`, value])),
        width: resource.width,
        height: resource.height
      }
    }, {
      upsert: true,
      new: true
    }).lean();
  })().finally(() => preparing.delete(publicId));
  preparing.set(publicId, pending);
  return pending;
}
export async function preparePortfolioSet(items) {
  // Bounded preparation avoids flooding the media provider on a 50-photo publish.
  const media = [];
  for (let offset = 0; offset < items.length; offset += 4) media.push(...(await Promise.all(items.slice(offset, offset + 4).map(item => preparePortfolioMedia(item.publicId)))));
  return new Map(media.map(item => [item.publicId, item]));
}
export async function streamPortfolioMedia(publicId, variant, res) {
  const key = String(variant || '800');
  if (!Object.hasOwn(portfolioVariants, key)) return res.status(400).end();
  const media = await preparePortfolioMedia(publicId, [key]);
  const upstream = await fetch(media.variants[key], {
    signal: AbortSignal.timeout(30000),
    redirect: 'error'
  });
  if (!upstream.ok || !upstream.body) throw Object.assign(new Error('Photograph unavailable.'), {
    status: 502
  });
  res.set({
    'Content-Type': key === 'og' ? 'image/jpeg' : 'image/webp',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  await pipeline(Readable.fromWeb(upstream.body), res);
}
