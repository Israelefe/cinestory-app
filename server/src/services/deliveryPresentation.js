import crypto from 'node:crypto';

export const PRESENTATION_VERSION = 3;
// New creation uses the rebuilt pipeline in every environment. Keep an explicit
// opt-out for rollback without changing existing drafts or published links.
export const creationPipelineVersion = () => process.env.DELIVERY_V3_ENABLED === 'false' ? 2 : PRESENTATION_VERSION;
export const OBSERVATION_VERSION = 'visual-observations-1';
export const FORMATS = ['photo-story', 'editorial', 'photo-reveal', 'canvas', 'chapters', 'album', 'event-coverage', 'campaign'];
export const LIMITS = { 'photo-story': 12, editorial: 20, 'photo-reveal': 16, canvas: 30, chapters: 30, album: 20, 'event-coverage': 12, campaign: 12 };
export const snapshotFields = ['schemaVersion', 'format', 'clientName', 'shootType', 'title', 'assets', 'creativeDirection', 'presentationOrder', 'galleryOrder', 'curatedAssetIds', 'galleryAssetIds', 'soundtrack', 'narration', 'formatConfig'];
export function snapshotOf(delivery) {
  const source = delivery.toObject ? delivery.toObject() : delivery;
  return structuredClone(Object.fromEntries(snapshotFields.filter(key => source[key] !== undefined).map(key => [key, source[key]])));
}
export function observationKey(userId, asset) {
  const identity = asset.hashVerifiedAt && asset.contentHash ? `${asset.hashAlgorithm}:${asset.contentHash}` : asset.publicId;
  return crypto.createHash('sha256').update(`${userId}|${identity}|${process.env.ALIBABA_VISION_MODEL || 'qwen3-vl-flash'}|${OBSERVATION_VERSION}`).digest('hex');
}
export function selectPresentation(assets, format, observations = {}) {
  const sorted = [...assets].sort((a, b) => a.sortOrder - b.sortOrder);
  const limit = LIMITS[format] || 12;
  if (sorted.length <= limit) return sorted;
  // Cover the whole collection, preferring a representative within each interval.
  const chosen = [];
  const groups = new Set();
  for (let i = 0; i < limit; i++) {
    const candidates = sorted.slice(Math.floor(i * sorted.length / limit), Math.floor((i + 1) * sorted.length / limit));
    candidates.sort((a, b) => {
      const score = asset => { const o = observations[asset.assetId] || {}; return Number(o.emphasis || 0) + (groups.has(o.group) ? 0 : 2); };
      return score(b) - score(a) || a.sortOrder - b.sortOrder;
    });
    chosen.push(candidates[0]); groups.add(observations[candidates[0].assetId]?.group);
  }
  return chosen.sort((a, b) => a.sortOrder - b.sortOrder);
}
export function assemblePresentation(delivery, { observations = {}, writing = null } = {}) {
  const assets = [...delivery.assets].sort((a, b) => a.sortOrder - b.sortOrder);
  const selected = selectPresentation(assets, delivery.format, observations);
  const beats = writing?.beats || [];
  const groupId = label => String(label || 'photographs').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'photographs';
  const frames = selected.map((asset, index) => ({
    assetId: asset.assetId, sectionId: groupId(observations[asset.assetId]?.group),
    caption: beats.find(beat => beat.position === index)?.text || '', headline: '',
    duration: 4.2, durationSec: 4.2, motion: index % 2 ? 'pan_left' : 'zoom_in', transition: 'fade',
    focalPoint: '50% 50%', alt: observations[asset.assetId]?.description || `Photograph ${asset.sortOrder + 1}`
  }));
  const groupMap = new Map();
  for (const asset of assets) {
    const group = observations[asset.assetId]?.group || 'photographs';
    if (!groupMap.has(group)) groupMap.set(group, { id: groupId(group), title: group === 'photographs' ? 'Photographs' : group, assetIds: [], layout: 'grid', subtitle: '' });
    groupMap.get(group).assetIds.push(asset.assetId);
  }
  return {
    ...snapshotOf(delivery), schemaVersion: 3,
    title: writing?.title || delivery.brief.split(/[\n.!?]/)[0].slice(0, 120) || delivery.clientName,
    assets: assets.map(asset => { const { analysis, ...rest } = asset.toObject ? asset.toObject() : asset; return { ...rest, alt: observations[asset.assetId]?.description || '' }; }),
    presentationOrder: frames.map(f => f.assetId), curatedAssetIds: frames.map(f => f.assetId),
    galleryOrder: assets.map(a => a.assetId), galleryAssetIds: assets.map(a => a.assetId),
    narration: undefined,
    creativeDirection: {
      title: writing?.title || delivery.brief.split(/[\n.!?]/)[0].slice(0, 120),
      openingLine: writing?.openingLine || '', closingLine: writing?.closingLine || '',
      palette: { background: '#070709', surface: '#0c0c10', text: '#ffffff', accent: '#ff9b8e' },
      typography: { display: 'editorial-serif', body: 'clean-sans' },
      pace: 'warm', variation: { imageTreatment: 'natural', density: 'spacious' },
      frames, sections: [...groupMap.values()]
    }
  };
}
export function publicPreparation(run, tasks, observationsDone = 0, total = 0) {
  const unavailable = run.kind === 'caption' ? 'Your original caption is still saved. A new version is unavailable right now.' : run.kind === 'narration' ? 'Narration is unavailable right now. You can publish the presentation without it.' : run.metrics?.writingReady ? 'Your presentation is available to review. Some photograph checks are still incomplete; you can use this selection or prepare it again.' : 'Your photo presentation is ready. AI writing is unavailable right now; you can publish this version or try the writing again.';
  return { id: String(run._id), kind: run.kind, state: run.state, startedAt: run.createdAt, completedAt: run.completedAt,
    photographs: { completed: observationsDone, total },
    tasks: tasks.map(task => ({ kind: task.kind, state: task.state })),
    message: run.state === 'ready' ? 'Your presentation is ready to review.' : run.state === 'available' ? unavailable : run.state === 'working' ? run.kind === 'caption' ? 'Writing a new caption. Your current caption stays here until it is ready.' : run.kind === 'narration' ? 'Recording the approved story text.' : 'Preparing your presentation. You can leave this page and come back.' : 'Your saved presentation is unchanged.' };
}
