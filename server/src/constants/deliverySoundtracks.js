import { readFileSync } from 'node:fs';
import path from 'node:path';

const rawCatalogue = JSON.parse(readFileSync(new URL('./pixabaySoundtracks.json', import.meta.url), 'utf8'));
const privateMusicRoot = path.resolve(new URL('../../private/music/pixabay/', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]):)/, '$1:'));

const CATEGORY_PROFILES = Object.freeze({
  wedding: {
    genre: 'Wedding and romantic instrumental',
    mood: 'Tender, ceremonial and warm',
    tempo: 'slow',
    energy: 'gentle',
    narrationFit: 'excellent',
    tags: ['wedding', 'traditional wedding', 'white wedding', 'pre-wedding', 'engagement', 'romance', 'couple', 'ceremony']
  },
  celebration: {
    genre: 'Upbeat celebration',
    mood: 'Joyful, bright and energetic',
    tempo: 'upbeat',
    energy: 'high',
    narrationFit: 'limited',
    tags: ['celebration', 'owambe', 'event', 'party', 'entrance', 'dance floor', 'conference', 'social gathering']
  },
  afrobeat: {
    genre: 'Afrobeat and African pop instrumental',
    mood: 'Rhythmic, confident and celebratory',
    tempo: 'upbeat',
    energy: 'high',
    narrationFit: 'limited',
    tags: ['afrobeat', 'Nigeria', 'Lagos', 'owambe', 'traditional wedding', 'birthday', 'fashion', 'event']
  },
  'calm-acoustic': {
    genre: 'Calm acoustic and folk',
    mood: 'Natural, intimate and relaxed',
    tempo: 'slow',
    energy: 'gentle',
    narrationFit: 'excellent',
    tags: ['portrait', 'family', 'maternity', 'newborn', 'studio', 'outdoor', 'quiet', 'documentary']
  },
  fashion: {
    genre: 'Fashion, house and editorial beats',
    mood: 'Polished, confident and stylish',
    tempo: 'mid',
    energy: 'medium-high',
    narrationFit: 'fair',
    tags: ['fashion', 'editorial', 'lookbook', 'beauty', 'campaign', 'runway', 'personal branding', 'creative portrait']
  },
  corporate: {
    genre: 'Corporate and commercial background',
    mood: 'Clean, optimistic and assured',
    tempo: 'mid',
    energy: 'medium',
    narrationFit: 'good',
    tags: ['corporate', 'conference', 'campaign', 'commercial', 'brand', 'property', 'hospitality', 'product']
  },
  faith: {
    genre: 'Faith, piano and inspirational',
    mood: 'Reverent, hopeful and reflective',
    tempo: 'slow',
    energy: 'gentle',
    narrationFit: 'excellent',
    tags: ['church', 'worship', 'thanksgiving', 'dedication', 'christening', 'faith', 'community', 'service']
  },
  cinematic: {
    genre: 'Cinematic and emotional score',
    mood: 'Reflective, moving and expansive',
    tempo: 'slow',
    energy: 'building',
    narrationFit: 'excellent',
    tags: ['photo story', 'documentary', 'biography', 'anniversary', 'graduation', 'memorial', 'milestone', 'emotional']
  },
  maternity: {
    genre: 'Soft piano and nurturing instrumental',
    mood: 'Gentle, caring and hopeful',
    tempo: 'slow',
    energy: 'gentle',
    narrationFit: 'excellent',
    tags: ['maternity', 'motherhood', 'newborn', 'family', 'baby', 'portrait', 'quiet', 'tender']
  },
  birthday: {
    genre: 'Birthday and milestone celebration',
    mood: 'Cheerful, playful and celebratory',
    tempo: 'upbeat',
    energy: 'high',
    narrationFit: 'fair',
    tags: ['birthday', 'milestone', '30th birthday', 'party', 'celebration', 'studio portrait', 'entrance', 'cake']
  }
});

export const DELIVERY_SOUNDTRACKS = Object.freeze(rawCatalogue.map((track, index) => {
  const profile = CATEGORY_PROFILES[track.category];
  if (!profile) throw new Error(`Unknown soundtrack category: ${track.category}`);
  return Object.freeze({
    id: `pixabay_${track.pixabayId}`,
    sortOrder: index,
    title: track.title,
    creator: track.creator,
    category: track.category,
    genre: profile.genre,
    mood: profile.mood,
    tempo: profile.tempo,
    energy: profile.energy,
    narrationFit: profile.narrationFit,
    durationSec: track.durationSec,
    tags: Object.freeze(profile.tags),
    source: 'pixabay',
    sourcePageUrl: track.sourcePageUrl,
    contentIdRegistered: track.contentIdRegistered,
    license: track.license,
    licenseUrl: track.licenseUrl,
    filename: track.filename,
    bytes: track.bytes,
    sha256: track.sha256
  });
}));

export function deliverySoundtrack(trackId) {
  return DELIVERY_SOUNDTRACKS.find(track => track.id === trackId);
}

export function deliverySoundtrackFile(trackId) {
  const track = deliverySoundtrack(trackId);
  if (!track) return null;
  const resolved = path.resolve(privateMusicRoot, track.filename);
  return resolved.startsWith(`${privateMusicRoot}${path.sep}`) ? resolved : null;
}

export function recommendSoundtracks(context, limit = 18) {
  const words = new Set(String(context || '').toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 2));
  return DELIVERY_SOUNDTRACKS
    .map(track => ({
      track,
      score: track.tags.reduce((total, tag) => total + String(tag).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).reduce((tagScore, word) => tagScore + (words.has(word) ? 2 : 0), 0), 0)
        + (words.has(track.category) ? 4 : 0)
    }))
    .sort((left, right) => right.score - left.score || left.track.sortOrder - right.track.sortOrder)
    .slice(0, limit)
    .map(entry => entry.track);
}
