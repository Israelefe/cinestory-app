import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import PortfolioMedia from '../models/PortfolioMedia.js';
import { getR2ObjectStream, imageVariantKey, prepareR2Image, r2Configured } from './r2.service.js';

export const portfolioVariants = Object.freeze({ '400': '400', '800': '800', '1600': '1600', og: 'og' });
const preparing = new Map();

export async function preparePortfolioMedia(publicId, keys = Object.keys(portfolioVariants)) {
  const cached = await PortfolioMedia.findOne({ publicId }).lean();
  if (cached && keys.every(key => cached.variants?.[key])) return cached;
  if (!r2Configured()) throw Object.assign(new Error('Photograph previews are temporarily unavailable.'), { status: 503, code: 'R2_NOT_CONFIGURED' });
  if (preparing.has(publicId)) {
    await preparing.get(publicId);
    return preparePortfolioMedia(publicId, keys);
  }
  const pending = (async () => {
    const image = await prepareR2Image(publicId);
    const variants = Object.fromEntries(keys.map(key => [key, imageVariantKey(publicId, portfolioVariants[key])]));
    return PortfolioMedia.findOneAndUpdate({ publicId }, {
      $set: { ...Object.fromEntries(Object.entries(variants).map(([key, value]) => [`variants.${key}`, value])), width: image.width, height: image.height }
    }, { upsert: true, new: true }).lean();
  })().finally(() => preparing.delete(publicId));
  preparing.set(publicId, pending);
  return pending;
}

export async function preparePortfolioSet(items) {
  const media = [];
  for (let offset = 0; offset < items.length; offset += 4) media.push(...(await Promise.all(items.slice(offset, offset + 4).map(item => preparePortfolioMedia(item.publicId)))));
  return new Map(media.map(item => [item.publicId, item]));
}

export async function streamPortfolioMedia(publicId, variant, res) {
  const key = String(variant || '800');
  if (!Object.hasOwn(portfolioVariants, key)) return res.status(400).end();
  const media = await preparePortfolioMedia(publicId, [key]);
  const upstream = await getR2ObjectStream(media.variants[key]);
  res.set({ 'Content-Type': key === 'og' ? 'image/jpeg' : 'image/webp', 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400', 'X-Content-Type-Options': 'nosniff' });
  await pipeline(Readable.fromWeb(upstream.body), res);
}
