import { Readable } from 'stream';
import { cloudinary, configureCloudinary } from './cloudinary.service.js';
import { deliveryFolder } from './deliveryMedia.service.js';
import { createNarrationScript } from './alibabaCreativeDirector.service.js';

function fallbackNarrationText(delivery) {
  const direction = delivery.creativeDirection || {};
  const sections = direction.sections || [];
  const frames = direction.frames || [];
  const parts = [];

  // Opening
  if (direction.openingLine) parts.push(direction.openingLine.trim());

  // Group frames by section for a walking narration
  if (sections.length > 0) {
    for (const section of sections) {
      const sectionFrames = frames.filter(f => f.sectionId === section.id);
      const sectionCaptions = sectionFrames.map(f => f.caption).filter(Boolean);
      if (section.subtitle) parts.push(section.subtitle.trim());
      else if (sectionCaptions.length > 0) parts.push(sectionCaptions[0].trim());
    }
  } else {
    // No sections — pick a few representative captions with pauses
    const captions = frames.map(f => f.caption).filter(Boolean);
    const step = Math.max(1, Math.floor(captions.length / 4));
    for (let i = 0; i < captions.length && parts.length < 6; i += step) {
      parts.push(captions[i].trim());
    }
  }

  // Closing
  if (direction.closingLine) parts.push(direction.closingLine.trim());

  // Join with period-space for natural TTS pauses
  return parts.filter(Boolean).join('. ').slice(0, 1900);
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

  let text = String(delivery.narration?.transcript || '').trim();
  if (!text) {
    try {
      text = await createNarrationScript({
        clientName: delivery.clientName,
        shootType: delivery.shootType,
        brief: delivery.brief,
        direction: delivery.creativeDirection,
        format: delivery.format
      });
    } catch {
      text = fallbackNarrationText(delivery);
    }
  }

  if (!text) throw Object.assign(new Error('Add approved story text before creating narration.'), { code: 'NARRATION_TEXT_REQUIRED' });
  const voice = process.env.DEEPGRAM_TTS_MODEL || 'flux-hannah-en';
  const speed = process.env.DEEPGRAM_TTS_SPEED || '0.85';
  const response = await fetch(`https://api.deepgram.com/v2/speak?model=${encodeURIComponent(voice)}&encoding=mp3&speed=${encodeURIComponent(speed)}`, { method: 'POST', headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(90_000) });
  if (!response.ok) {
    const providerMessage = await response.text().catch(() => '');
    throw Object.assign(new Error(`Deepgram could not create narration${providerMessage ? `: ${providerMessage.slice(0, 160)}` : '.'}`), { code: 'NARRATION_REQUEST_FAILED' });
  }
  const result = await uploadAudio(Buffer.from(await response.arrayBuffer()), delivery);
  return { publicId: result.public_id, resourceType: 'video', format: result.format, bytes: result.bytes, duration: result.duration, transcript: text, voice };
}
