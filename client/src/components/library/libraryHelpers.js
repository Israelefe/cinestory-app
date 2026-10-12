import { API_BASE_URL } from '../../config/env.js';
export function formatBytes(value = 0) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(0, Math.round(value / 1024))} KB`;
}
export const photoId = photo => String(photo._id || photo.id);
export const shootName = name => !name || name === 'All photographs' ? 'Unfiled' : name;
export function selectionInstruction(rule = { mode: 'unlimited' }) {
  return rule.mode === 'exactly' ? `Choose exactly ${rule.count} photographs` : rule.mode === 'up-to' ? `Choose up to ${rule.count} photographs` : 'Choose the photographs you want edited';
}
export function downloadUrl(url) { return url.startsWith('/api/') ? `${API_BASE_URL.replace(/\/api\/?$/, '')}${url}` : url; }
export function publicMedia(publicId, id, token, { returned = false, size = '' } = {}) {
  const path = returned ? `returns/${encodeURIComponent(id)}/media` : `media/${encodeURIComponent(id)}`;
  return `${API_BASE_URL}/v1/storage/public/${encodeURIComponent(publicId)}/${path}?access_token=${encodeURIComponent(token)}${size ? `&size=${size}` : ''}`;
}
export const workflowPath = kind => kind === 'preselection' ? '/pre-selection' : '/editor-links';
export function linkStatus(item) {
  if (item.status === 'draft') return 'Draft';
  if (item.status === 'revoked') return 'Closed';
  if (new Date(item.expiresAt) <= new Date()) return 'Expired';
  if (item.kind === 'editor-handoff') return ({ 'ready-for-review': 'Edits ready', 'changes-requested': 'Changes requested', complete: 'Complete' })[item.editorState] || 'Awaiting edits';
  return item.status === 'submitted' ? 'Submitted' : item.selectionDraft?.updatedAt ? 'In progress' : 'Ready to share';
}
