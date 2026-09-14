import { Readable } from 'stream';
import { cloudinary, configureCloudinary } from './cloudinary.service.js';
import { deliveryFolder } from './deliveryMedia.service.js';

function narrationText(delivery) {
  const direction = delivery.creativeDirection || {};
  const lines = [direction.openingLine, ...(direction.frames || []).map(frame => frame.caption).filter(Boolean), direction.closingLine]
    .map(line => String(line || '').trim())
    .filter(Boolean);
  const selected = [];
  let length = 0;
  for (const line of lines) {
    if (length + line.length + 1 > 1900) break;
    selected.push(line);
    length += line.length + 1;
  }
  return selected.join(' ');
}

async function uploadAudio(buffer, delivery) {
  if (!configureCloudinary()) throw new Error('Cloudinary is not configured for narration.');
  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream({ resource_type: 'video', type: 'authenticated', folder: `${deliveryFolder(delivery.userId, delivery._id)}/narration`, format: 'mp3', overwrite: false }, (error, result) => error ? reject(error) : resolve(result));
    Readable.from(buffer).pipe(upload);
  });
}

export async function generateNarration(delivery) {
  if (!['photo-story', 'chapters'].includes(delivery.format)) throw Object.assign(new Error('Narration is available for Photo Story and Chapters.'), { code: 'NARRATION_FORMAT_UNAVAILABLE' });
  const apiKey = String(process.env.DEEPGRAM_API_KEY || '').trim();
  if (!apiKey) throw Object.assign(new Error('Deepgram narration is not configured.'), { code: 'NARRATION_NOT_CONFIGURED' });
  const text = narrationText(delivery);
  if (!text) throw Object.assign(new Error('Add approved story text before creating narration.'), { code: 'NARRATION_TEXT_REQUIRED' });
  const voice = process.env.DEEPGRAM_TTS_MODEL || 'flux-hannah-en';
  const response = await fetch(`https://api.deepgram.com/v2/speak?model=${encodeURIComponent(voice)}&encoding=mp3`, { method: 'POST', headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(90_000) });
  if (!response.ok) {
    const providerMessage = await response.text().catch(() => '');
    throw Object.assign(new Error(`Deepgram could not create narration${providerMessage ? `: ${providerMessage.slice(0, 160)}` : '.'}`), { code: 'NARRATION_REQUEST_FAILED' });
  }
  const result = await uploadAudio(Buffer.from(await response.arrayBuffer()), delivery);
  return { publicId: result.public_id, resourceType: 'video', format: result.format, bytes: result.bytes, duration: result.duration, transcript: text, voice };
}
