import mongoose from 'mongoose';
import Delivery from '../models/Delivery.js';
import StorageAsset from '../models/StorageAsset.js';
import User from '../models/User.js';
import { resolveEntitlements } from '../services/entitlement.service.js';
import { portfolioId } from '../utils/portfolio.js';
export * from './portfolioV2.controller.js';
const sourceImage = publicId => `/api/v1/portfolios/mine/source-media?publicId=${encodeURIComponent(publicId)}`;

export async function getPortfolioSources(req, res) {
  try {
    const user = await User.findById(req.user.id);
    const entitlements = await resolveEntitlements(user, { includeUsage: false });
    if (entitlements.features.portfolioMode === 'unavailable') return res.status(403).json({ success: false, code: 'PRO_REQUIRED', message: 'Veylo Portfolio is included with Pro.' });
    const kind = ['deliveries', 'delivery', 'library'].includes(req.query.kind) ? req.query.kind : 'deliveries';
    const query = String(req.query.query || '').trim().slice(0, 50);
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const cursor = String(req.query.cursor || '');
    const pageSize = 24;
    if (kind === 'delivery') {
      const sourceId = String(req.query.sourceId || '');
      const delivery = await Delivery.findOne({ userId: user._id, publicId: sourceId, status: 'published' }).select('title shootType assets').lean();
      if (!delivery) return res.status(404).json({ success: false, message: 'That delivery is unavailable.' });
      const matching = delivery.assets.filter(asset => asset.resourceType !== 'video' && (!query || (asset.originalFilename || '').toLowerCase().includes(query.toLowerCase())));
      const offset = /^\d+$/.test(cursor) ? Math.min(Number(cursor), matching.length) : 0;
      const page = matching.slice(offset, offset + pageSize);
      return res.json({ success: true, data: page.map(asset => ({ publicId: asset.publicId, id: portfolioId(asset.publicId), title: '', filename: asset.originalFilename || '', width: asset.width, height: asset.height, source: 'delivery', sourceId, thumbnailUrl: sourceImage(asset.publicId) })), nextCursor: offset + pageSize < matching.length ? String(offset + pageSize) : null });
    }
    const after = mongoose.Types.ObjectId.isValid(cursor) ? { _id: { $lt: new mongoose.Types.ObjectId(cursor) } } : {};
    if (kind === 'library') {
      const match = { userId: user._id, ...after, ...(query ? { originalFilename: { $regex: escaped, $options: 'i' } } : {}) };
      const rows = await StorageAsset.find(match).sort({ _id: -1 }).limit(pageSize + 1).select('publicId originalFilename width height _id').lean();
      const page = rows.slice(0, pageSize);
      return res.json({ success: true, data: page.map(asset => ({ publicId: asset.publicId, id: portfolioId(asset.publicId), title: '', filename: asset.originalFilename || '', width: asset.width, height: asset.height, source: 'library', sourceId: String(asset._id), thumbnailUrl: sourceImage(asset.publicId) })), nextCursor: rows.length > pageSize ? String(page.at(-1)._id) : null });
    }
    const match = { userId: user._id, status: 'published', assets: { $elemMatch: { resourceType: { $ne: 'video' } } }, ...after, ...(query ? { $or: [{ title: { $regex: escaped, $options: 'i' } }, { shootType: { $regex: escaped, $options: 'i' } }] } : {}) };
    const rows = await Delivery.aggregate([{ $match: match }, { $sort: { _id: -1 } }, { $limit: pageSize + 1 }, { $addFields: { photoAssets: { $filter: { input: '$assets', as: 'asset', cond: { $ne: ['$$asset.resourceType', 'video'] } } } } }, { $project: { publicId: 1, title: 1, shootType: 1, photoCount: { $size: '$photoAssets' }, coverPublicId: { $arrayElemAt: ['$photoAssets.publicId', 0] } } }]);
    const page = rows.slice(0, pageSize);
    res.json({ success: true, data: page.map(delivery => ({ sourceId: delivery.publicId, title: delivery.title || delivery.shootType || 'Finished delivery', photoCount: delivery.photoCount, thumbnailUrl: delivery.coverPublicId ? sourceImage(delivery.coverPublicId) : '' })), nextCursor: rows.length > pageSize ? String(page.at(-1)._id) : null });
  } catch { res.status(500).json({ success: false, message: 'We could not load photographs for your portfolio.' }); }
}
