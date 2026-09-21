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

const CATEGORY_DECISIONS = Object.freeze({
  wedding: { storyFunction: 'ceremony, vows, couple portraits and a gentle closing', avoidFor: ['fast dance-floor recap', 'hard-edged fashion campaign'], editingPace: 'long holds and soft transitions' },
  celebration: { storyFunction: 'arrivals, entrances, crowd energy and party highlights', avoidFor: ['quiet newborn story', 'memorial or reflective biography'], editingPace: 'quick sequences and energetic scene changes' },
  afrobeat: { storyFunction: 'Nigeria-first celebration, fashion confidence and social-event movement', avoidFor: ['spoken biography', 'quiet worship sequence'], editingPace: 'rhythmic cuts with room for strong hero frames' },
  'calm-acoustic': { storyFunction: 'intimate portraits, family connection and unhurried documentary moments', avoidFor: ['high-energy entrance', 'nightlife campaign'], editingPace: 'measured holds and natural transitions' },
  fashion: { storyFunction: 'lookbook, beauty, runway and commercial attitude', avoidFor: ['solemn ceremony', 'soft newborn gallery'], editingPace: 'confident cuts, repeatable visual beats and clean reveals' },
  corporate: { storyFunction: 'conference, team, property, product and brand handoff', avoidFor: ['romantic vows', 'high-emotion memorial'], editingPace: 'clear sections and steady forward movement' },
  faith: { storyFunction: 'worship, thanksgiving, dedication and reflective community scenes', avoidFor: ['party dance floor', 'edgy fashion sequence'], editingPace: 'patient holds and respectful transitions' },
  cinematic: { storyFunction: 'biography, milestone, graduation and emotionally structured Photo Stories', avoidFor: ['casual rapid gallery browsing', 'playful children party recap'], editingPace: 'slow opening, gradual build and resolved ending' },
  maternity: { storyFunction: 'motherhood, newborn, family tenderness and quiet anticipation', avoidFor: ['corporate conference', 'fast nightlife recap'], editingPace: 'soft, slow and spacious' },
  birthday: { storyFunction: 'birthday portraits, cake, entrance and milestone celebration', avoidFor: ['solemn service', 'formal corporate handoff'], editingPace: 'bright openings and upbeat highlight runs' }
});

function titleListedInstrumentation(title) {
  const value = String(title).toLowerCase();
  const cues = [['piano', 'Piano'], ['organ', 'Organ'], ['choir', 'Choir'], ['orchestra', 'Orchestral'], ['marimba', 'Marimba'], ['acoustic', 'Acoustic'], ['reggae', 'Reggae-influenced'], ['house', 'House'], ['jazz', 'Jazz-influenced']].filter(([word]) => value.includes(word)).map(([, label]) => label);
  return cues.length ? `Pixabay title cue only: ${cues.join(', ')}` : 'No instrumentation stated in the Pixabay listing title';
}

function titleSignals(title) {
  const words = String(title).toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 2);
  return [...new Set(words)].slice(0, 12);
}

function trackDecision(track, profile) {
  const decision = CATEGORY_DECISIONS[track.category];
  const durationShape = track.durationSec < 100 ? 'compact' : track.durationSec > 210 ? 'extended' : 'standard';
  const sourceTags = Array.isArray(track.pixabayTags) ? track.pixabayTags.filter(Boolean) : [];
  const bestFor = [...new Set([...profile.tags, ...sourceTags])].slice(0, 12);
  return {
    storyFunction: decision.storyFunction,
    bestFor,
    sourceTags,
    avoidFor: decision.avoidFor,
    editingPace: `${decision.editingPace}; ${durationShape} ${Math.floor(track.durationSec / 60)}:${String(track.durationSec % 60).padStart(2, '0')} runtime`,
    instrumentationCue: titleListedInstrumentation(track.title),
    titleSignals: titleSignals(track.title),
    selectionNote: `Selected from the ${track.category} group using the Pixabay title, source tags, source record, runtime, narration fit, and intended delivery use.`,
    metadataConfidence: 'source-and-file-verified; instrumentation cue is not a claim about the recording',
    contentIdGuidance: track.contentIdRegistered ? 'Pixabay marks this track as Content ID registered; keep the source page and licence record with the delivery.' : 'Not marked as Content ID registered in the verified catalogue record.'
  };
}

export const DELIVERY_SOUNDTRACKS = Object.freeze(rawCatalogue.map((track, index) => {
  const profile = CATEGORY_PROFILES[track.category];
  if (!profile) throw new Error(`Unknown soundtrack category: ${track.category}`);
  const decision = trackDecision(track, profile);
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
    storyFunction: decision.storyFunction,
    bestFor: Object.freeze(decision.bestFor),
    avoidFor: Object.freeze(decision.avoidFor),
    editingPace: decision.editingPace,
    sourceTags: Object.freeze(decision.sourceTags),
    sourceDescription: track.sourceDescription || null,
    isAiGenerated: track.isAiGenerated === true,
    instrumentationCue: decision.instrumentationCue,
    titleSignals: Object.freeze(decision.titleSignals),
    selectionNote: decision.selectionNote,
    metadataConfidence: decision.metadataConfidence,
    contentIdGuidance: decision.contentIdGuidance,
    source: 'pixabay',
    sourcePageUrl: track.sourcePageUrl,
    contentIdRegistered: track.contentIdRegistered,
    license: track.license,
    licenseUrl: track.licenseUrl,
    verifiedAt: track.verifiedAt,
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
      score: [...track.tags, ...track.bestFor, track.storyFunction, track.instrumentationCue].reduce((total, tag) => total + String(tag).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).reduce((tagScore, word) => tagScore + (words.has(word) ? 2 : 0), 0), 0)
        + (words.has(track.category) ? 4 : 0)
    }))
    .sort((left, right) => right.score - left.score || left.track.sortOrder - right.track.sortOrder)
    .slice(0, limit)
    .map(entry => entry.track);
}
