import crypto from 'node:crypto';
import { z } from 'zod';
export const portfolioId = publicId => `p-${crypto.createHash('sha256').update(String(publicId)).digest('hex').slice(0, 24)}`;
export const directionDefaults = Object.freeze({
  background: 'ink',
  accent: '#ff9b8e',
  typeStyle: 'editorial',
  rhythm: 'measured',
  layout: 'editorial',
  motion: 'subtle',
  showBio: true,
  showLocation: true,
  showCategories: true,
  showPhotoTitles: true,
  showContact: true
});
export const handleSchema = z.string().trim().toLowerCase().min(3).max(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use letters, numbers, and single hyphens.');
export const publicHandleSchema = z.string().trim().toLowerCase().min(3).max(40).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
export const RESERVED = new Set(['admin', 'api', 'app', 'billing', 'dashboard', 'delivery', 'formats', 'help', 'home', 'login', 'portfolio', 'pricing', 'settings', 'signup', 'support', 'veylo']);
const directionSchema = z.object({
  background: z.enum(['ink', 'warm-black', 'ivory']).default('ink'),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i).default('#ff9b8e'),
  typeStyle: z.enum(['editorial', 'modern', 'classic']).default('editorial'),
  rhythm: z.enum(['measured', 'bold', 'quiet']).default('measured'),
  layout: z.enum(['editorial', 'grid', 'masonry']).default('editorial'),
  motion: z.enum(['subtle', 'still']).default('subtle'),
  showBio: z.boolean().default(true),
  showLocation: z.boolean().default(true),
  showCategories: z.boolean().default(true),
  showPhotoTitles: z.boolean().default(true),
  showContact: z.boolean().default(true)
}).strict();
const itemSchema = z.object({
  id: z.string().max(80).optional(),
  publicId: z.string().min(5).max(500),
  title: z.string().trim().max(100).default(''),
  category: z.string().trim().max(50).default('Selected work'),
  alt: z.string().trim().max(180).default(''),
  featured: z.boolean().default(true),
  focalX: z.number().min(0).max(100).default(50),
  focalY: z.number().min(0).max(100).default(50),
  crop: z.enum(['fit', 'fill']).default('fit')
}).strict();
export const draftSchema = z.object({
  expectedDraftRevision: z.number().int().min(0),
  handle: z.string().trim().toLowerCase().max(40),
  studioName: z.string().trim().max(100).default(''),
  bio: z.string().trim().max(600).default(''),
  headline: z.string().trim().max(100).default(''),
  introLine: z.string().trim().max(240).default(''),
  location: z.string().trim().max(120).default(''),
  contactLabel: z.string().trim().max(50).default('Ask about a shoot'),
  instagram: z.string().trim().max(100).default(''),
  whatsapp: z.string().trim().max(30).default(''),
  heroPublicId: z.string().max(500).default(''),
  items: z.array(itemSchema).max(50).default([]),
  projects: z.array(z.object({
    id: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
    title: z.string().trim().max(100),
    description: z.string().trim().max(400).default(''),
    category: z.string().trim().max(50).default('Selected work'),
    coverId: z.string().max(80).default(''),
    photoIds: z.array(z.string().max(80)).max(50)
  }).strict()).max(50).default([]),
  direction: directionSchema.default({})
}).strict();
export function normalizeWhatsApp(value) {
  let digits = String(value || '').replace(/[\s()+-]/g, '');
  if (/^0\d{10}$/.test(digits)) digits = `234${digits.slice(1)}`;
  if (digits.startsWith('00')) digits = digits.slice(2);
  return digits;
}
export function normalizeInstagram(value) {
  const text = String(value || '').trim();
  if (/^https?:\/\/(?:www\.)?instagram\.com\//i.test(text)) {
    try {
      const url = new URL(text);
      return decodeURIComponent(url.pathname.split('/').filter(Boolean)[0] || '');
    } catch {
      return text;
    }
  }
  return text.replace(/^@/, '');
}
export function normalizeSnapshot(value = {}) {
  const plain = value.toObject?.() || value;
  const keys = ['handle', 'studioName', 'bio', 'headline', 'introLine', 'location', 'instagram', 'whatsapp'];
  const items = (plain.items || []).map((item, sortOrder) => ({
    id: portfolioId(item.publicId),
    publicId: item.publicId,
    title: item.title || '',
    category: item.category?.trim() || 'Selected work',
    alt: item.alt || '',
    featured: item.featured ?? true,
    width: item.width || undefined,
    height: item.height || undefined,
    focalX: item.focalX ?? 50,
    focalY: item.focalY ?? 50,
    crop: item.crop || 'fit',
    sortOrder
  }));
  return {
    ...Object.fromEntries(keys.map(key => [key, plain[key] || ''])),
    contactLabel: plain.contactLabel || 'Ask about a shoot',
    heroPublicId: plain.heroPublicId || items.find(item => item.featured)?.publicId || items[0]?.publicId || '',
    items,
    projects: (plain.projects || []).map(project => ({
      id: project.id,
      title: project.title,
      description: project.description || '',
      category: project.category || 'Selected work',
      coverId: project.coverId || project.photoIds[0] || '',
      photoIds: [...project.photoIds]
    })),
    direction: {
      ...directionDefaults,
      ...(plain.direction?.toObject?.() || plain.direction || {})
    }
  };
}
export function snapshotErrors(snapshot, {
  publish = false, existingHandle = ''
} = {}) {
  const errors = [];
  const ids = new Set(snapshot.items.map(item => item.id));
  if (new Set(snapshot.items.map(item => item.publicId)).size !== snapshot.items.length) errors.push('Each photograph can only be added once.');
  if (new Set(snapshot.projects.map(project => project.id)).size !== snapshot.projects.length) errors.push('Each project needs its own address.');
  for (const project of snapshot.projects) {
    if (new Set(project.photoIds).size !== project.photoIds.length || project.photoIds.some(id => !ids.has(id))) errors.push('Choose available photographs for each project.');
    if (project.coverId && !project.photoIds.includes(project.coverId)) errors.push('Choose a project cover from its photographs.');
    if (publish && (!project.title.trim() || !project.photoIds.length)) errors.push('Give each project a title and at least one photograph.');
  }
  const visible = new Set([...snapshot.items.filter(item => item.featured).map(item => item.id), ...snapshot.projects.flatMap(project => project.photoIds)]);
  if (publish && snapshot.heroPublicId && !snapshot.items.some(item => item.publicId === snapshot.heroPublicId && visible.has(item.id))) errors.push('Choose a public cover photograph.');
  if (publish) {
    const keepingLegacy = snapshot.handle === existingHandle && publicHandleSchema.safeParse(snapshot.handle).success;
    if ((!keepingLegacy && !handleSchema.safeParse(snapshot.handle).success) || RESERVED.has(snapshot.handle)) errors.push('Choose a valid portfolio address.');
    if (snapshot.studioName.trim().length < 2) errors.push('Add your Studio or Brand name in Account settings.');
    if (!snapshot.bio.trim()) errors.push('Add a short studio bio.');
    if (visible.size < 4) errors.push('Choose at least four different photographs.');
    if (!snapshot.heroPublicId) errors.push('Choose a cover photograph.');
    if (snapshot.whatsapp && !/^[1-9]\d{7,14}$/.test(normalizeWhatsApp(snapshot.whatsapp))) errors.push('Enter a valid WhatsApp number with its country code.');
    if (snapshot.instagram && !/^[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?$/.test(normalizeInstagram(snapshot.instagram))) errors.push('Enter an Instagram username or profile link.');
    if (snapshot.direction.showContact && snapshot.whatsapp && snapshot.contactLabel.trim().length < 2) errors.push('Add a label for the WhatsApp button.');
  }
  return errors;
}
export function removeSnapshotPhotos(value, removedIds) {
  const next = normalizeSnapshot(value);
  next.items = next.items.filter(item => !removedIds.has(item.publicId));
  const ids = new Set(next.items.map(item => item.id));
  next.projects = next.projects.map(project => {
    const photoIds = project.photoIds.filter(id => ids.has(id));
    return {
      ...project,
      photoIds,
      coverId: photoIds.includes(project.coverId) ? project.coverId : photoIds[0] || ''
    };
  }).filter(project => project.photoIds.length);
  const visible = new Set([...next.items.filter(item => item.featured).map(item => item.id), ...next.projects.flatMap(project => project.photoIds)]);
  if (!next.items.some(item => item.publicId === next.heroPublicId && visible.has(item.id))) next.heroPublicId = next.items.find(item => visible.has(item.id))?.publicId || '';
  return next;
}
