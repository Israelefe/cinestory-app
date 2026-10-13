import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { repo } from './config.mjs';
import { hash, atomicWrite, safeFile } from './storage.mjs';

const imageType = buffer => buffer[0] === 0xff && buffer[1] === 0xd8 ? 'jpeg' : buffer.subarray(1, 4).toString() === 'PNG' ? 'png' : buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP' ? 'webp' : null;
export async function storeImage(config, db, buffer, { name, source = 'upload', generated = false, prompt = '', slotId = '', provenance = {} } = {}) {
  if (buffer.length > 30 * 1024 * 1024 || !imageType(buffer)) throw new Error('Choose a JPEG, PNG or WebP image under 30 MB.');
  const image = sharp(buffer, { limitInputPixels: 60000000, failOn: 'error' });
  const metadata = await image.metadata();
  const clean = await image.rotate().webp({ quality: 95 }).toBuffer();
  const sha256 = hash(clean), id = 'img_' + sha256.slice(0, 24), relative = `assets/${id}.webp`;
  await atomicWrite(path.join(config.data, relative), clean);
  const details = { width: metadata.autoOrient?.width || metadata.width, height: metadata.autoOrient?.height || metadata.height, generated, consent: false, prompt, slotId, provenance };
  db.prepare('INSERT OR IGNORE INTO assets(id,path,kind,name,sha256,metadata,rights,license_note,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, relative, 'image', String(name || id).slice(0, 160), sha256, JSON.stringify(details), 'pending', '', source, Date.now());
  const existing = assetRecord(db.prepare('SELECT * FROM assets WHERE id=?').get(id));
  if (generated && !existing.metadata.generated) db.prepare("UPDATE assets SET metadata=?,rights='pending' WHERE id=?").run(JSON.stringify({ ...existing.metadata, generated: true, prompt, slotId, provenance, consent: false }), id);
  return assetRecord(db.prepare('SELECT * FROM assets WHERE id=?').get(id));
}
export function assetRecord(row) { return row ? { ...row, metadata: JSON.parse(row.metadata), url: '/api/assets/' + row.id + '/media' } : null; }
export function acceptOwnerUpload(db, asset) {
  if (!asset || asset.source !== 'upload' || asset.rights === 'blocked') return asset;
  const metadata = { ...asset.metadata, ownerSelected: true, ownerSelectedAt: new Date().toISOString() };
  db.prepare("UPDATE assets SET rights='cleared',license_note=?,metadata=? WHERE id=?").run(asset.license_note || 'Owner uploaded this asset for use in the local studio. No independent license verification.', JSON.stringify(metadata), asset.id);
  return assetRecord(db.prepare('SELECT * FROM assets WHERE id=?').get(asset.id));
}
export function demoAssetEligible(asset) { return Boolean(asset && asset.rights === 'cleared' && (asset.metadata?.generated || asset.metadata?.consent || asset.metadata?.ownerSelected)); }
export async function indexSamples(config, db, progress = () => {}) {
  // Only explicitly public demonstration material, never product/customer storage.
  const folders = ['client/public/veylo/web', 'client/public/veylo/demo/event', 'client/public/veylo/demo/campaign', 'client/public/photos'];
  let count = 0;
  for (const folder of folders) {
    let files; try { files = await fs.readdir(path.join(repo, folder)); } catch { continue; }
    for (const file of files.filter(name => /(?:-1440\.webp|\.(?:jpe?g|png))$/i.test(name) || folder.includes('/demo/') && /\.webp$/i.test(name))) {
      const source = folder + '/' + file;
      if (db.prepare('SELECT id FROM assets WHERE source=?').get(source)) continue;
      const buffer = await fs.readFile(await safeFile(repo, source));
      await storeImage(config, db, buffer, { name: file, source, provenance: { note: 'Existing demo asset; real/generated origin and permissions are unverified.' } });
      count++; progress(Math.min(.9, count / 200), `Indexed ${count} demonstration images. Permission review is still required.`);
    }
  }
  const music = JSON.parse(await fs.readFile(path.join(repo, 'server/src/constants/pixabaySoundtracks.json'), 'utf8'));
  for (const track of music) {
    const source = 'server/private/music/pixabay/' + track.filename;
    if (db.prepare('SELECT id FROM assets WHERE source=?').get(source)) continue;
    let buffer; try { buffer = await fs.readFile(await safeFile(repo, source)); } catch { continue; }
    const sha256 = hash(buffer);
    if (track.sha256 !== sha256) continue;
    const id = 'music_' + sha256.slice(0, 24), relative = 'assets/' + id + '.mp3';
    await atomicWrite(path.join(config.data, relative), buffer);
    db.prepare('INSERT OR IGNORE INTO assets(id,path,kind,name,sha256,metadata,rights,license_note,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, relative, 'music', track.title, sha256, JSON.stringify(track), 'pending', `Recorded license: ${track.license}. Confirm intended commercial social use.`, source, Date.now());
  }
  return { images: count, note: 'All imported assets require rights review; no automatic clearance.' };
}
