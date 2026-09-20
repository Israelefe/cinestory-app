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

async function transcribeWordTimings({ apiKey, audio }) {
  const query = new URLSearchParams({ model: 'nova-3', utterances: 'true', punctuate: 'true' });
  const response = await fetch(`https://api.deepgram.com/v1/listen?${query.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'audio/mpeg',
      Accept: 'application/json'
    },
    body: audio,
    signal: AbortSignal.timeout(120_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(`Deepgram could not measure narration timing${payload?.err_msg ? `: ${payload.err_msg.slice(0, 180)}` : '.'}`), { code: 'NARRATION_TIMING_FAILED' });
  }
  const words = payload?.results?.channels?.[0]?.alternatives?.[0]?.words || [];
  if (!words.length) throw Object.assign(new Error('Deepgram returned no word timings for the generated narration.'), { code: 'NARRATION_TIMING_FAILED' });
  return {
    words: words.map(word => ({
      word: String(word.punctuated_word || word.word || '').trim(),
      start: Number(word.start),
      end: Number(word.end)
    })).filter(word => word.word && Number.isFinite(word.start) && Number.isFinite(word.end)),
    // Include trailing silence in the next chunk's offset. Falling back to the
    // last measured word keeps the alignment usable if a provider omits the
    // duration metadata.
    duration: Number(payload?.metadata?.duration)
  };
}

function timingToken(value) {
  return String(value || '').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu, '');
}

export function timedSegments(segments, words) {
  let cursor = 0;
  return segments.map(segment => {
    const targetWords = segment.text.split(/\s+/).map(timingToken).filter(Boolean);
    if (!targetWords.length) throw Object.assign(new Error(`Caption ${segment.id} has no measurable words.`), { code: 'NARRATION_TIMING_FAILED' });
    let first = null;
    let last = null;
    for (const target of targetWords) {
      let match = -1;
      for (let index = cursor; index < Math.min(words.length, cursor + 5); index += 1) {
        if (timingToken(words[index].word) === target) { match = index; break; }
      }
      if (match < 0) throw Object.assign(new Error(`Deepgram timing could not be aligned to caption ${segment.id}.`), { code: 'NARRATION_TIMING_FAILED' });
      if (first === null) first = match;
      last = match;
      cursor = match + 1;
    }
    return {
      ...segment,
      startSec: Number(words[first].start.toFixed(3)),
      endSec: Number(words[last].end.toFixed(3))
    };
  });
}

function splitNarration(segments, maxCharacters = 2600) {
  const chunks = [];
  let current = [];
  let length = 0;
  for (const segment of segments) {
    const extra = segment.text.length + (current.length ? 1 : 0);
    if (current.length && length + extra > maxCharacters) {
      chunks.push(current);
      current = [];
      length = 0;
    }
    current.push(segment);
    length += extra;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function stripLeadingId3(buffer) {
  if (buffer.length < 10 || buffer.toString('ascii', 0, 3) !== 'ID3') return buffer;
  const size = (buffer[6] & 0x7f) * 0x200000 + (buffer[7] & 0x7f) * 0x4000 + (buffer[8] & 0x7f) * 0x80 + (buffer[9] & 0x7f);
  return buffer.subarray(Math.min(buffer.length, 10 + size));
}

export async function generateNarration(delivery) {
  const apiKey = String(process.env.DEEPGRAM_API_KEY || '').trim();
  if (!apiKey) throw Object.assign(new Error('Deepgram narration is not configured.'), { code: 'NARRATION_NOT_CONFIGURED' });

  const segments = captionSegments(delivery);
  // A full stop between approved captions gives Flux a calm breath without inventing a script.
  const transcriptLines = segments.map(segment => {
    const line = cleanLine(segment.text, 220);
    return /[.!?…]$/.test(line) ? line : `${line}.`;
  });
  const transcript = transcriptLines.join(' ');
  const chunks = splitNarration(segments);
  const audioBuffers = [];
  const measuredSegments = [];
  let offset = 0;
  for (const chunk of chunks) {
    const chunkText = chunk.map(segment => {
      const line = cleanLine(segment.text, 220);
      return /[.!?…]$/.test(line) ? line : `${line}.`;
    }).join(' ');
    const chunkAudio = await synthesize({ apiKey, text: chunkText });
    const timing = await transcribeWordTimings({ apiKey, audio: chunkAudio });
    const chunkSegments = timedSegments(chunk, timing.words).map(segment => ({
      ...segment,
      startSec: Number((segment.startSec + offset).toFixed(3)),
      endSec: Number((segment.endSec + offset).toFixed(3))
    }));
    measuredSegments.push(...chunkSegments);
    const measuredDuration = Number.isFinite(timing.duration) && timing.duration > 0
      ? timing.duration
      : (timing.words.at(-1)?.end || 0);
    offset += Math.max(0, measuredDuration);
    audioBuffers.push(chunkAudio);
  }
  const buffer = Buffer.concat(audioBuffers.map((chunkAudio, index) => index === 0 ? chunkAudio : stripLeadingId3(chunkAudio)));
  const uploaded = await uploadAudio(buffer, delivery);
  const duration = Number(uploaded.duration) > 0
    ? Number(uploaded.duration)
    : Math.max(1, offset);

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
    segments: measuredSegments
  };
}
