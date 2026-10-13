import api from '../services/api.js';
import { uploadR2Object } from './r2Upload.js';

const RAW_FORMATS = new Set(['arw', 'cr2', 'cr3', 'dng', 'nef', 'nrw', 'orf', 'rw2', 'raf', 'pef', 'srw', '3fr', 'iiq', 'mos', 'mef', 'mrw', 'rwl', 'x3f']);
const MAX_LIBRARY_FILE_BYTES = 100 * 1024 * 1024;

function extension(filename = '') {
  return String(filename).split('.').pop()?.toLowerCase() || '';
}

export function isRawPhoto(file) {
  return RAW_FORMATS.has(extension(file?.name));
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Veylo could not prepare a JPEG preview for this camera file.')), type, quality));
}

let rawPreviewQueue = Promise.resolve();
async function makeRawPreview(file, signal) {
  const previous = rawPreviewQueue;
  let release;
  rawPreviewQueue = new Promise(resolve => { release = resolve; });
  await previous;
  try { signal?.throwIfAborted(); return await decodeRawPreview(file); }
  finally { release(); }
}

async function decodeRawPreview(file) {
  const { default: LibRaw } = await import('libraw-wasm');
  const decoder = new LibRaw();
  try {
    await decoder.open(await file.arrayBuffer(), { outputBps: 8, outputColor: 1, useCameraWb: true, useCameraMatrix: 3, userFlip: -1 });
    const rendered = await decoder.imageData();
    if (!rendered?.data || !rendered.width || !rendered.height || ![1, 3, 4].includes(rendered.colors)) throw new Error('Veylo could not read a preview from this camera file.');
    const { width, height, colors, data, bits } = rendered;
    const rgba = new Uint8ClampedArray(width * height * 4);
    const sourceMax = data.BYTES_PER_ELEMENT === 2 ? (2 ** (bits || 16)) - 1 : 255;
    const pixels = width * height;
    for (let start = 0; start < pixels; start += 750_000) {
      const end = Math.min(pixels, start + 750_000);
      for (let index = start; index < end; index += 1) {
        const source = index * colors;
        const target = index * 4;
        if (colors === 1) {
          const grey = Math.round((data[source] / sourceMax) * 255);
          rgba[target] = grey; rgba[target + 1] = grey; rgba[target + 2] = grey;
        } else {
          rgba[target] = Math.round((data[source] / sourceMax) * 255);
          rgba[target + 1] = Math.round((data[source + 1] / sourceMax) * 255);
          rgba[target + 2] = Math.round((data[source + 2] / sourceMax) * 255);
        }
        rgba[target + 3] = colors === 4 ? Math.round((data[source + 3] / sourceMax) * 255) : 255;
      }
      if (end < pixels) await new Promise(resolve => requestAnimationFrame(resolve));
    }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Veylo could not prepare a preview on this device.');
    context.putImageData(new ImageData(rgba, width, height), 0, 0);
    const blob = await canvasBlob(canvas, 'image/jpeg', 0.95);
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.preview.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch (error) {
    throw new Error(error?.message || `Veylo could not read ${file.name}. Try a camera JPEG or another RAW file.`);
  } finally {
    decoder.dispose();
  }
}

async function uploadOne(file, signature, onProgress, signal) {
  if (file.size > MAX_LIBRARY_FILE_BYTES) throw new Error(`${file.name} is over the 100 MB upload limit. Choose a smaller file and try again.`);
  return uploadR2Object(signature, file, onProgress, { signal });
}

export function validLibraryPhoto(file) {
  return Boolean(file?.size && file.size <= MAX_LIBRARY_FILE_BYTES && (['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || isRawPhoto(file)));
}

async function renewRecord(record, part, endpoint, extra = {}, headers) {
  const name = part ? part + 'Signature' : 'signature', uploadedName = part ? 'uploaded' + part[0].toUpperCase() + part.slice(1) : 'uploaded';
  const signature = record[name];
  if (!signature?.expiresAt || new Date(signature.expiresAt).getTime() > Date.now() + 30000) return;
  const { data } = await api.post(endpoint + '/renew', { objectKey: signature.objectKey, uploadToken: signature.uploadToken, ...extra }, { headers });
  record[name] = data.data;
  if (record[uploadedName]) record[uploadedName] = { ...record[uploadedName], uploadToken: data.data.uploadToken };
}

// Keep this record across retries: a failed confirmation must not transfer a
// second copy of an already uploaded original or abandon its object key.
export async function uploadLibraryPhoto(file, { folder = 'All photographs', signal, onChange = () => {}, record = {} } = {}) {
  if (!validLibraryPhoto(file)) throw new Error('Use a JPEG, PNG, WebP, or supported camera RAW file, up to 100 MB each.');
  signal?.throwIfAborted();
  if (isRawPhoto(file) && !record.preview) {
    onChange({ state: 'preparing' });
    record.preview = await makeRawPreview(file, signal);
    signal?.throwIfAborted();
  }
  const image = record.preview || file;
  await renewRecord(record, 'image', '/v1/storage/uploads');
  await renewRecord(record, 'raw', '/v1/storage/uploads');
  const total = file.size + (record.preview?.size || 0);
  const loaded = { image: record.uploadedImage ? image.size : 0, raw: record.uploadedRaw ? file.size : 0 };
  const report = (part, amount) => { loaded[part] = amount; onChange({ state: 'uploading', loaded: loaded.image + loaded.raw, total }); };
  if (!record.uploadedImage || isRawPhoto(file) && !record.uploadedRaw) onChange({ state: 'uploading', loaded: loaded.image + loaded.raw, total });
  // RAW decoding has its own serial queue; prepared originals can transfer
  // alongside other photographs without starting six decoders at once.
  if (isRawPhoto(file) && !record.uploadedRaw) {
    record.rawSignature ||= (await api.post('/v1/storage/uploads/sign', { resourceType: 'raw', format: extension(file.name) }, { signal })).data.data;
    record.uploadedRaw = await uploadOne(file, record.rawSignature, amount => report('raw', amount), signal);
    report('raw', file.size);
  }
  if (!record.uploadedImage) {
    record.imageSignature ||= (await api.post('/v1/storage/uploads/sign', { resourceType: 'image', contentType: image.type }, { signal })).data.data;
    record.uploadedImage = await uploadOne(image, record.imageSignature, amount => report('image', amount), signal);
    report('image', image.size);
  }
  onChange({ state: 'saving', loaded: total, total });
  record.confirmationStarted = true;
  // Do not abort confirmation: after bytes transfer, settle the saved record
  // before reporting Added, even if the user cancels at that exact moment.
  const response = await api.post('/v1/storage/uploads/confirm', {
    objectKey: record.uploadedImage.objectKey, uploadToken: record.uploadedImage.uploadToken,
    ...(record.uploadedRaw ? { rawOriginal: { objectKey: record.uploadedRaw.objectKey, uploadToken: record.uploadedRaw.uploadToken, format: extension(file.name), resourceType: 'raw' } } : {}),
    originalFilename: file.name, folder, tags: []
  });
  return { asset: response.data.data, usage: response.data.usage };
}

export async function uploadLibraryPhotos(files, { folder = 'All photographs', onProgress = () => {} } = {}) {
  const completed = [];
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      onProgress(Math.round((index / files.length) * 100), `Preparing ${file.name}`);
      let uploadedImage;
      let uploadedRaw;
      try {
        if (isRawPhoto(file)) {
          const preview = await makeRawPreview(file);
          if (file.size > MAX_LIBRARY_FILE_BYTES) throw new Error('This camera file is over the 100 MB upload limit. Choose a smaller file or use a camera JPEG.');
          if (preview.size > MAX_LIBRARY_FILE_BYTES) throw new Error('The JPEG preview made from this camera file is over the 100 MB limit. Try a smaller RAW file or use a camera JPEG.');
          const [rawSignature, imageSignature] = await Promise.all([
            api.post('/v1/storage/uploads/sign', { resourceType: 'raw', format: extension(file.name) }),
            api.post('/v1/storage/uploads/sign', { resourceType: 'image', contentType: preview.type })
          ]);
          const uploads = await Promise.allSettled([
            uploadOne(file, rawSignature.data.data),
            uploadOne(preview, imageSignature.data.data)
          ]);
          uploadedRaw = uploads[0].status === 'fulfilled' ? uploads[0].value : undefined;
          uploadedImage = uploads[1].status === 'fulfilled' ? uploads[1].value : undefined;
          const failed = uploads.find(result => result.status === 'rejected');
          if (failed) throw failed.reason;
        } else {
          const signResponse = await api.post('/v1/storage/uploads/sign', { resourceType: 'image', contentType: file.type });
          uploadedImage = await uploadOne(file, signResponse.data.data);
        }
        onProgress(Math.round(((index + 0.8) / files.length) * 100), `Saving ${file.name}`);
        const response = await api.post('/v1/storage/uploads/confirm', {
          objectKey: uploadedImage.objectKey,
          uploadToken: uploadedImage.uploadToken,
          ...(uploadedRaw ? { rawOriginal: { objectKey: uploadedRaw.objectKey, uploadToken: uploadedRaw.uploadToken, format: extension(file.name), resourceType: 'raw' } } : {}),
          originalFilename: file.name,
          folder,
          tags: []
        });
        completed.push(response.data.data);
      } catch (error) {
        const cleanup = [
          ...(uploadedImage ? [{ publicId: uploadedImage.objectKey, resourceType: 'image' }] : []),
          ...(uploadedRaw ? [{ publicId: uploadedRaw.objectKey, resourceType: 'raw' }] : [])
        ];
        if (cleanup.length) await api.post('/v1/storage/uploads/cleanup', { uploads: cleanup }).catch(() => {});
        throw error;
      }
      onProgress(Math.round(((index + 1) / files.length) * 100), file.name);
    }
  } catch (error) {
    error.completed = completed;
    throw error;
  }
  return completed;
}

export async function uploadEditorReturn(file, sourceAssetId, token, publicId, { signal, onChange = () => {}, record = {}, variationId = 'main', variationName = 'Main edit' } = {}) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > MAX_LIBRARY_FILE_BYTES) {
    throw new Error('Choose a JPEG, PNG, or WebP edit that is 100 MB or smaller.');
  }
  const headers = { Authorization: `Bearer ${token}` };
  const endpoint = `/v1/storage/public/${encodeURIComponent(publicId)}/uploads`;
  await renewRecord(record, '', endpoint, { sourceAssetId, variationId, variationName, editorGrant: record.signature?.editorGrant }, headers);
  record.signature ||= (await api.post(`${endpoint}/sign`, { sourceAssetId, variationId, variationName, contentType: file.type }, { headers, signal })).data.data;
  onChange({ state: 'uploading', loaded: record.uploaded ? file.size : 0, total: file.size });
  record.uploaded ||= await uploadOne(file, record.signature, loaded => onChange({ state: 'uploading', loaded, total: file.size }), signal);
  const uploaded = record.uploaded;
  onChange({ state: 'saving', loaded: file.size, total: file.size });
  record.confirmationStarted = true;
  const response = await api.post(`${endpoint}/confirm`, {
    objectKey: uploaded.objectKey,
    uploadToken: uploaded.uploadToken,
    sourceAssetId, variationId, variationName,
    editorGrant: record.signature.editorGrant,
    originalFilename: file.name
  }, { headers });
  return response.data.data;
}
