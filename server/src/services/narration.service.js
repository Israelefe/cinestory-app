import { Readable } from 'stream';
import { cloudinary, configureCloudinary } from './cloudinary.service.js';
import { deliveryFolder } from './deliveryMedia.service.js';
import { NARRATION_VOICES, DEFAULT_NARRATION_VOICE_ID } from '../constants/narrationVoices.js';

// Flux TTS is intentionally configured as one calm, consistent narrator for Veylo.
// The audio is generated from the approved per-photograph captions; no second script
// is invented at narration time.
const MODEL_ID = 'flux-hannah-en';
const VOICE_SETTINGS = Object.freeze({ speed: 0.85, expressivity: -1, sampleRate: 24000 });

function cleanLine(value, max = 360) {
  return String(value || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function getNarrationVoiceCatalogue() {
  const configured = Boolean(String(process.env.DEEPGRAM_API_KEY || '').trim());
  return NARRATION_VOICES.map(voice => ({
    ...voice,
    available: configured,
    provider: 'Deepgram Flux',
    model: MODEL_ID,
    previewUrl: ''
  }));
}

export function captionSegments(delivery) {
  const frames = Array.isArray(delivery.creativeDirection?.frames)
    ? delivery.creativeDirection.frames
    : [];
  const sections = delivery.creativeDirection?.sections || [];
  const sectionById = new Map(sections.map(section => [section.id, section]));
  const segments = frames.map((frame, index) => {
    const caption = cleanLine(frame.caption, 220);
    if (caption.length < 8) return null;
    const section = sectionById.get(frame.sectionId);
    return {
      id: `caption-${index + 1}`,
      assetIds: [frame.assetId],
      sectionId: frame.sectionId || null,
      text: caption,
      sectionTitle: cleanLine(section?.title, 80)
    };
  }).filter(Boolean);

  if (segments.length !== frames.length || !segments.length) {
    throw Object.assign(new Error('Every photograph needs an approved caption before narration can be created.'), { code: 'NARRATION_CAPTIONS_REQUIRED' });
  }
  return segments;
}

async function uploadAudio(buffer, delivery) {
  if (!configureCloudinary()) throw Object.assign(new Error('Cloudinary is not configured for narration.'), { code: 'NARRATION_STORAGE_UNAVAILABLE' });
  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream({
      resource_type: 'video',
      type: 'authenticated',
      folder: `${deliveryFolder(delivery.userId, delivery._id)}/narration`,
      format: 'mp3',
      overwrite: false
    }, (error, result) => error ? reject(error) : resolve(result));
    Readable.from(buffer).pipe(upload);
  });
}

async function synthesize({ apiKey, text }) {
  const query = new URLSearchParams({
    model: MODEL_ID,
    speed: String(VOICE_SETTINGS.speed),
    expressivity: String(VOICE_SETTINGS.expressivity)
  });
  const response = await fetch(`https://api.deepgram.com/v2/speak?${query.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg'
    },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(120_000)
  });
  if (!response.ok) {
    const providerMessage = await response.text().catch(() => '');
    throw Object.assign(new Error(`Deepgram could not create narration${providerMessage ? `: ${providerMessage.slice(0, 180)}` : '.'}`), { code: 'NARRATION_REQUEST_FAILED' });
  }
  return Buffer.from(await response.arrayBuffer());
}

function segmentTimings(segments, duration) {
  const weights = segments.map(segment => Math.max(1, segment.text.split(/\s+/).filter(Boolean).length));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
  let cursor = 0;
  return segments.map((segment, index) => {
    const startSec = cursor;
    cursor += duration * (weights[index] / totalWeight);
    return {
      ...segment,
      startSec: Number(startSec.toFixed(3)),
      endSec: Number(cursor.toFixed(3))
    };
  });
}

export async function generateNarration(delivery) {
  const apiKey = String(process.env.DEEPGRAM_API_KEY || '').trim();
  if (!apiKey) throw Object.assign(new Error('Deepgram narration is not configured.'), { code: 'NARRATION_NOT_CONFIGURED' });

  const segments = captionSegments(delivery);
  // A full stop between approved captions gives Flux a calm breath without inventing a script.
  const transcript = segments.map(segment => {
    const line = cleanLine(segment.text, 220);
    return /[.!?…]$/.test(line) ? line : `${line}.`;
  }).join(' ');
  const buffer = await synthesize({ apiKey, text: transcript });
  const uploaded = await uploadAudio(buffer, delivery);
  const duration = Number(uploaded.duration) > 0
    ? Number(uploaded.duration)
    : Math.max(1, segments.reduce((total, segment) => total + segment.text.split(/\s+/).filter(Boolean).length * 0.7, 0));

  return {
    publicId: uploaded.public_id,
    resourceType: 'video',
    format: uploaded.format,
    bytes: uploaded.bytes,
    duration,
    transcript,
    voiceId: DEFAULT_NARRATION_VOICE_ID,
    voiceName: 'Hannah',
    provider: 'Deepgram Flux',
    modelId: MODEL_ID,
    settings: VOICE_SETTINGS,
    captionsRead: true,
    approvedAt: new Date(),
    segments: segmentTimings(segments, duration)
  };
}
