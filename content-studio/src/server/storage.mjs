import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export function hash(value) { return createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex'); }
export function contained(base, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('\0') || relative.includes(':')) throw new Error('Invalid local file reference.');
  const target = path.resolve(base, relative);
  const rel = path.relative(path.resolve(base), target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('The file is outside studio storage.');
  return target;
}
export async function safeFile(base, relative) {
  const target = contained(base, relative);
  const [realBase, realTarget] = await Promise.all([fs.realpath(base), fs.realpath(target)]);
  const rel = path.relative(realBase, realTarget);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('The file is outside studio storage.');
  return realTarget;
}
export async function atomicWrite(target, value) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = target + '.' + randomUUID() + '.tmp';
  await fs.writeFile(temporary, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2), { mode: 0o600 });
  await fs.rename(temporary, target);
}
export async function initialiseStorage(config) {
  for (const folder of ['assets', 'jobs', 'captures', 'exports', 'temp', 'backups', 'tools', 'knowledge']) await fs.mkdir(path.join(config.data, folder), { recursive: true });
}
export function redact(value) {
  return String(value).replace(/\b(?:gsk_[A-Za-z0-9_-]+|Bearer\s+\S+|Token\s+\S+)\b/gi, '[redacted]').replace(/((?:api[_-]?key|secret|password|authorization)["']?\s*[:=]\s*)["']?[^\s,"'}]+/gi, '$1[redacted]');
}
