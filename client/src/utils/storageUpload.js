import api from '../services/api.js';

const RAW_FORMATS = new Set(['arw', 'cr2', 'cr3', 'dng', 'nef', 'nrw', 'orf', 'rw2', 'raf', 'pef', 'srw', '3fr', 'iiq', 'mos', 'mef', 'mrw', 'rwl', 'x3f']);

function extension(filename = '') {
  return String(filename).split('.').pop()?.toLowerCase() || '';
}

export function isRawPhoto(file) {
  return RAW_FORMATS.has(extension(file?.name));
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Veylo could not prepare a JPEG preview for this camera file.')), type, quality));
}

async function makeRawPreview(file) {
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

async function uploadOne(file, signature) {
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signature.apiKey);
  form.append('timestamp', signature.timestamp);
  form.append('signature', signature.signature);
  form.append('folder', signature.folder);
  form.append('public_id', signature.public_id);
  form.append('type', signature.type);
  form.append('overwrite', String(signature.overwrite));
  form.append('unique_filename', String(signature.unique_filename));
  if (signature.allowed_formats) form.append('allowed_formats', signature.allowed_formats.join(','));
  if (signature.eager) form.append('eager', signature.eager);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/${signature.resourceType || 'image'}/upload`, { method: 'POST', body: form });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message || `Upload failed for ${file.name}.`);
  return result;
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
          const [rawSignature, imageSignature] = await Promise.all([
            api.post('/v1/storage/uploads/sign', { resourceType: 'raw', format: extension(file.name) }),
            api.post('/v1/storage/uploads/sign', { resourceType: 'image' })
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
          const signResponse = await api.post('/v1/storage/uploads/sign', { resourceType: 'image' });
          uploadedImage = await uploadOne(file, signResponse.data.data);
        }
        onProgress(Math.round(((index + 0.8) / files.length) * 100), `Saving ${file.name}`);
        const response = await api.post('/v1/storage/uploads/confirm', {
          publicId: uploadedImage.public_id,
          version: uploadedImage.version,
          signature: uploadedImage.signature,
          ...(uploadedRaw ? { rawOriginal: { publicId: uploadedRaw.public_id, version: uploadedRaw.version, signature: uploadedRaw.signature } } : {}),
          originalFilename: file.name,
          folder,
          tags: []
        });
        completed.push(response.data.data);
      } catch (error) {
        const cleanup = [
          ...(uploadedImage ? [{ publicId: uploadedImage.public_id, resourceType: 'image' }] : []),
          ...(uploadedRaw ? [{ publicId: uploadedRaw.public_id, resourceType: 'raw' }] : [])
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

export async function uploadEditorReturn(file, sourceAssetId, token, publicId) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 100 * 1024 * 1024) {
    throw new Error('Choose a JPEG, PNG, or WebP edit no larger than 100 MB.');
  }
  const headers = { Authorization: `Bearer ${token}` };
  const endpoint = `/v1/storage/public/${encodeURIComponent(publicId)}/uploads`;
  const signResponse = await api.post(`${endpoint}/sign`, { sourceAssetId }, { headers });
  const uploaded = await uploadOne(file, signResponse.data.data);
  const response = await api.post(`${endpoint}/confirm`, {
    publicId: uploaded.public_id,
    version: uploaded.version,
    signature: uploaded.signature,
    sourceAssetId,
    originalFilename: file.name
  }, { headers });
  return response.data.data;
}
