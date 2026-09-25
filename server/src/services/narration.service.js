import { Readable } from 'stream';
import { cloudinary, configureCloudinary } from './cloudinary.service.js';
import { deliveryFolder } from './deliveryMedia.service.js';
import { NARRATION_VOICES, DEFAULT_NARRATION_VOICE_ID } from '../constants/narrationVoices.js';

// Flux TTS is intentionally configured as one calm, consistent narrator for Veylo.
// The audio is generated from the approved per-photograph captions; no second script
// is invented at narration time.
const MODEL_ID = 'flux-hannah-en';
export const NARRATION_RENDER_VERSION = 'flux-hannah-captions-v5';
const MAX_NARRATION_CHUNK_CHARACTERS = 2000;
// Keep Hannah measured without flattening her natural pitch movement. Deepgram's
// tuned expressivity default (0) sounds more like a person telling a story than
// the narrow, evenly stressed delivery produced by the previous -1 setting.
const VOICE_SETTINGS = Object.freeze({ speed: 0.86, expressivity: 0, sampleRate: 24000 });

function cleanLine(value, max = 360) {
  return String(value || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function narrationLine(value) {
  const line = cleanLine(value, 220)
    .replace(/[—–]/g, ', ')
    .replace(/\s*;\s*/g, ', ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
  return /[.!?…]$/.test(line) ? line : `${line}.`;
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
  const approvedPositions = new Map(
    (Array.isArray(delivery.assets) ? delivery.assets : [])
      .slice()
      .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0))
      .map((asset, index) => [String(asset.assetId), index])
  );
  const orderedFrames = delivery.schemaVersion >= 3 ? frames : approvedPositions.size
    ? frames.slice().sort((left, right) => (approvedPositions.get(String(left.assetId)) ?? Number.MAX_SAFE_INTEGER) - (approvedPositions.get(String(right.assetId)) ?? Number.MAX_SAFE_INTEGER))
    : frames;
  const sections = delivery.creativeDirection?.sections || [];
  const sectionById = new Map(sections.map(section => [section.id, section]));
  const segments = orderedFrames.map((frame, index) => {
    const lines = delivery.schemaVersion >= 3
      ? [index === 0 ? delivery.creativeDirection?.openingLine : '', frame.caption, index === orderedFrames.length - 1 ? delivery.creativeDirection?.closingLine : '']
      : [frame.caption];
    const caption = [...new Set(lines.map(line => cleanLine(line, 220)).filter(Boolean))].join(' ');
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

  if ((delivery.schemaVersion < 3 && segments.length !== frames.length) || !segments.length) {
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
  const DELAYS = [1000, 3000, 6000];
  for (let attempt = 0; attempt <= DELAYS.length; attempt++) {
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
      // Retry on transient errors
      if ([429, 502, 503, 504].includes(response.status) && attempt < DELAYS.length) {
        console.warn(`[narration/synthesize] Deepgram returned ${response.status}, retrying in ${DELAYS[attempt]}ms...`);
        await new Promise(r => setTimeout(r, DELAYS[attempt]));
        continue;
      }
      const providerMessage = await response.text().catch(() => '');
      throw Object.assign(new Error(`Deepgram could not create narration${providerMessage ? `: ${providerMessage.slice(0, 180)}` : '.'}`), { code: 'NARRATION_REQUEST_FAILED' });
    }
    return Buffer.from(await response.arrayBuffer());
  }
}

async function transcribeWordTimings({ apiKey, audio }) {
  const query = new URLSearchParams({ model: 'nova-3', utterances: 'true', punctuate: 'true' });
  const DELAYS = [1000, 3000, 6000];
  for (let attempt = 0; attempt <= DELAYS.length; attempt++) {
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
      if ([429, 502, 503, 504].includes(response.status) && attempt < DELAYS.length) {
        console.warn(`[narration/timing] Deepgram returned ${response.status}, retrying in ${DELAYS[attempt]}ms...`);
        await new Promise(r => setTimeout(r, DELAYS[attempt]));
        continue;
      }
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
}

function timingToken(value) {
  return String(value || '').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu, '');
}

function tokenDistance(left, right) {
  const a = timingToken(left);
  const b = timingToken(right);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= b.length; column += 1) {
      const above = previous[column];
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return previous[b.length];
}

function timingTokenMatches(expected, actual) {
  const left = timingToken(expected);
  const right = timingToken(actual);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 4 && (left.startsWith(right) || right.startsWith(left))) return true;
  return tokenDistance(left, right) <= Math.max(1, Math.floor(Math.max(left.length, right.length) * 0.24));
}

export function timedSegments(segments, words, duration = 0) {
  let cursor = 0;
  const matches = segments.map(segment => {
    const targetWords = segment.text.split(/\s+/).map(timingToken).filter(Boolean);
    if (!targetWords.length) throw Object.assign(new Error(`Caption ${segment.id} has no measurable words.`), { code: 'NARRATION_TIMING_FAILED' });
    let first = null;
    let last = null;
    for (const target of targetWords) {
      let match = -1;
      const searchEnd = Math.min(words.length, cursor + Math.max(16, targetWords.length + 8));
      // Prefer exact matches so repeated short words do not drift the cue.
      for (let index = cursor; index < searchEnd; index += 1) {
        if (timingToken(words[index].word) === target) { match = index; break; }
      }
      // Deepgram can spell a name, contraction, or inflected word slightly
      // differently even when the generated audio is correct. Use a bounded
      // fuzzy match, but never invent a timestamp from word counts.
      if (match < 0) {
        for (let index = cursor; index < searchEnd; index += 1) {
          if (timingTokenMatches(target, words[index].word)) { match = index; break; }
        }
      }
      // A missed transcript token should not invalidate the whole delivery.
      // The segment still receives boundaries from the neighbouring measured
      // words. We only fail when Deepgram measured no word for the caption.
      if (match < 0) continue;
      if (first === null) first = match;
      last = match;
      cursor = match + 1;
    }
    return { segment, first, last };
  });
  if (!matches.some(item => item.first !== null && item.last !== null)) throw Object.assign(new Error('Deepgram timing could not be aligned to any approved caption.'), { code: 'NARRATION_TIMING_FAILED' });
  const measuredDuration = Math.max(Number(duration) || 0, Number(words.at(-1)?.end || 0));
  const boundaries = matches.map(item => item.first === null ? null : { start: Number(words[item.first].start), end: Number(words[item.last].end) });
  // A provider transcript can omit a name, contraction, or very short caption.
  // Do not fall back to word-count estimates. Instead, split only the real
  // measured audio gap between the nearest measured caption boundaries.
  let index = 0;
  while (index < boundaries.length) {
    if (boundaries[index]) { index += 1; continue; }
    const startIndex = index;
    while (index < boundaries.length && !boundaries[index]) index += 1;
    const endIndex = index;
    const previousEnd = startIndex > 0 ? boundaries[startIndex - 1]?.end : Number(words[0]?.start || 0);
    const nextStart = endIndex < boundaries.length ? boundaries[endIndex]?.start : measuredDuration;
    const gapStart = Number.isFinite(previousEnd) ? previousEnd : 0;
    const gapEnd = Number.isFinite(nextStart) && nextStart > gapStart ? nextStart : Math.max(gapStart + 0.25 * (endIndex - startIndex), measuredDuration);
    const step = Math.max(0.12, (gapEnd - gapStart) / Math.max(1, endIndex - startIndex));
    for (let missing = startIndex; missing < endIndex; missing += 1) {
      const start = gapStart + step * (missing - startIndex);
      boundaries[missing] = { start, end: Math.max(start + 0.12, Math.min(gapEnd, start + step)) };
    }
  }
  return matches.map((item, itemIndex) => ({
    ...item.segment,
    startSec: Number(Math.max(0, boundaries[itemIndex].start).toFixed(3)),
    endSec: Number(Math.max(boundaries[itemIndex].start + 0.12, boundaries[itemIndex].end).toFixed(3))
  }));
}

function narrationChunkText(segments) {
  const spokenTranscriptLines = segments.map(segment => narrationLine(segment.text));
  return spokenTranscriptLines.join('\n\n');
}

function splitNarration(segments, maxCharacters = MAX_NARRATION_CHUNK_CHARACTERS) {
  const chunks = [];
  let current = [];
  for (const segment of segments) {
    const candidate = [...current, segment];
    if (current.length && narrationChunkText(candidate).length > maxCharacters) {
      chunks.push(current);
      current = [segment];
    } else {
      current = candidate;
    }
    if (narrationChunkText(current).length > maxCharacters) {
      throw Object.assign(new Error('An approved caption is longer than the narration provider’s per-request limit.'), { code: 'NARRATION_CHUNK_TOO_LONG' });
    }
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
  // A short paragraph break gives the narrator room to breathe between frames
  // while keeping every spoken word equal to an approved caption.
  const transcript = narrationChunkText(segments);
  const chunks = splitNarration(segments);
  const audioBuffers = [];
  const measuredSegments = [];
  let offset = 0;
  for (const chunk of chunks) {
    const spokenChunkText = narrationChunkText(chunk);
    if (spokenChunkText.length > MAX_NARRATION_CHUNK_CHARACTERS) {
      throw Object.assign(new Error('Narration exceeded the provider’s per-request character limit.'), { code: 'NARRATION_CHUNK_TOO_LONG' });
    }
    const chunkAudio = await synthesize({ apiKey, text: spokenChunkText });
    const timing = await transcribeWordTimings({ apiKey, audio: chunkAudio });
    const chunkSegments = timedSegments(chunk, timing.words, timing.duration).map(segment => ({
      ...segment,
      startSec: Number((segment.startSec + offset).toFixed(3)),
      endSec: Number((segment.endSec + offset).toFixed(3))
    }));
    measuredSegments.push(...chunkSegments);
    const lastWordEnd = Number(timing.words.at(-1)?.end || 0);
    const measuredDuration = Math.max(
      lastWordEnd,
      Number.isFinite(timing.duration) && timing.duration > 0 ? timing.duration : 0
    );
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
    contentHash: uploaded.etag || undefined,
    hashAlgorithm: uploaded.etag ? 'cloudinary-etag' : undefined,
    hashVerifiedAt: uploaded.etag ? new Date() : undefined,
    duration,
    transcript,
    voiceId: DEFAULT_NARRATION_VOICE_ID,
    voiceName: 'Hannah',
    provider: 'Deepgram Flux',
    modelId: MODEL_ID,
    renderVersion: NARRATION_RENDER_VERSION,
    settings: VOICE_SETTINGS,
    captionsRead: true,
    approvedAt: new Date(),
    segments: measuredSegments
  };
}
