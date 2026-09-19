import { Readable } from 'stream';
import { cloudinary, configureCloudinary } from './cloudinary.service.js';
import { deliveryFolder } from './deliveryMedia.service.js';
import { createNarrationScript } from './alibabaCreativeDirector.service.js';
import { DEFAULT_NARRATION_VOICE_ID, narrationVoice } from '../constants/narrationVoices.js';

const MODEL_ID = 'eleven_multilingual_v2';
const VOICE_SETTINGS = Object.freeze({ stability: 0.72, similarity_boost: 0.8, style: 0.08, speed: 0.9, use_speaker_boost: true });

function cleanLine(value, max = 360) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function fallbackNarrationText(delivery) {
  const direction = delivery.creativeDirection || {};
  const parts = [cleanLine(direction.openingLine, 180)];
  for (const section of direction.sections || []) {
    const line = cleanLine(section.subtitle, 180) || cleanLine(section.title, 100);
    if (line) parts.push(line);
  }
  parts.push(cleanLine(direction.closingLine, 180));
  return parts.filter(Boolean).slice(0, 8).join('. ').slice(0, 1900);
}

function narrationSegments(text, delivery) {
  const sentences = String(text).split(/(?<=[.!?])\s+/).map(value => cleanLine(value)).filter(Boolean);
  const sections = delivery.creativeDirection?.sections || [];
  const wanted = Math.min(8, Math.max(3, sections.length || 3));
  const chunkSize = Math.max(1, Math.ceil(sentences.length / wanted));
  const segments = [];
  for (let index = 0; index < sentences.length; index += chunkSize) {
    const section = sections[Math.min(segments.length, Math.max(0, sections.length - 1))];
    segments.push({ id: `narration-${segments.length + 1}`, sectionId: section?.id || null, assetIds: Array.isArray(section?.assetIds) ? section.assetIds.slice(0, 12) : [], text: sentences.slice(index, index + chunkSize).join(' ') });
  }
  return segments.slice(0, 8);
}

async function uploadAudio(buffer, delivery) {
  if (!configureCloudinary()) throw Object.assign(new Error('Cloudinary is not configured for narration.'), { code: 'NARRATION_STORAGE_UNAVAILABLE' });
  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream({ resource_type: 'video', type: 'authenticated', folder: `${deliveryFolder(delivery.userId, delivery._id)}/narration`, format: 'mp3', overwrite: false }, (error, result) => error ? reject(error) : resolve(result));
    Readable.from(buffer).pipe(upload);
  });
}

async function synthesize({ apiKey, voiceId, text }) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS, apply_text_normalization: 'auto' }),
    signal: AbortSignal.timeout(120_000)
  });
  if (!response.ok) {
    const providerMessage = await response.text().catch(() => '');
    throw Object.assign(new Error(`ElevenLabs could not create narration${providerMessage ? `: ${providerMessage.slice(0, 180)}` : '.'}`), { code: 'NARRATION_REQUEST_FAILED' });
  }
  const payload = await response.json();
  if (!payload.audio_base64 || !payload.alignment) throw Object.assign(new Error('ElevenLabs returned narration without timing information.'), { code: 'NARRATION_TIMING_MISSING' });
  return { buffer: Buffer.from(payload.audio_base64, 'base64'), alignment: payload.normalized_alignment || payload.alignment };
}

function segmentTimings(segments, alignment) {
  const starts = alignment?.character_start_times_seconds || [];
  const ends = alignment?.character_end_times_seconds || [];
  let offset = 0;
  return segments.map(segment => {
    const startIndex = offset;
    const endIndex = Math.max(startIndex, startIndex + segment.text.length - 1);
    offset += segment.text.length + 1;
    return { ...segment, startSec: Number(starts[startIndex] || 0), endSec: Number(ends[Math.min(endIndex, ends.length - 1)] || starts[startIndex] || 0) };
  });
}

export async function generateNarration(delivery, options = {}) {
  if (!['photo-story', 'chapters'].includes(delivery.format)) throw Object.assign(new Error('Narration is available for Photo Story and Chapters.'), { code: 'NARRATION_FORMAT_UNAVAILABLE' });
  const apiKey = String(process.env.ELEVENLABS_API_KEY || '').trim();
  if (!apiKey) throw Object.assign(new Error('ElevenLabs narration is not configured.'), { code: 'NARRATION_NOT_CONFIGURED' });

  const voiceId = String(options.voiceId || delivery.narration?.voiceId || DEFAULT_NARRATION_VOICE_ID);
  const voice = narrationVoice(voiceId);
  if (!voice) throw Object.assign(new Error('Choose one of Veylo’s approved Nigerian narrators.'), { code: 'NARRATION_VOICE_UNAVAILABLE' });

  let text = cleanLine(options.transcript || delivery.narration?.transcript, 2200);
  if (!text) {
    try {
      text = cleanLine(await createNarrationScript({ clientName: delivery.clientName, shootType: delivery.shootType, brief: delivery.brief, direction: delivery.creativeDirection, format: delivery.format }), 2200);
    } catch {
      text = fallbackNarrationText(delivery);
    }
  }
  if (!text) throw Object.assign(new Error('Review the story text before creating narration.'), { code: 'NARRATION_TEXT_REQUIRED' });

  const segments = narrationSegments(text, delivery);
  const speech = await synthesize({ apiKey, voiceId, text });
  const uploaded = await uploadAudio(speech.buffer, delivery);
  return { publicId: uploaded.public_id, resourceType: 'video', format: uploaded.format, bytes: uploaded.bytes, duration: uploaded.duration, transcript: text, voiceId, voiceName: voice.name, modelId: MODEL_ID, settings: VOICE_SETTINGS, approvedAt: new Date(), segments: segmentTimings(segments, speech.alignment) };
}
