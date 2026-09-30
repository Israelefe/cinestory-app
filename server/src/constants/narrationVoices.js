// Verified against Deepgram's Flux English voice catalogue.
const voices = [
  ['hannah', 'Hannah', 'Female', 'American', 'Clear and thoughtful'],
  ['sienna', 'Sienna', 'Female', 'American', 'Calm and warm'],
  ['alexis', 'Alexis', 'Female', 'American', 'Clear and caring'],
  ['gemma', 'Gemma', 'Female', 'British', 'Friendly and gentle'],
  ['kit', 'Kit', 'Male', 'British', 'Friendly and thoughtful'],
  ['cliff', 'Cliff', 'Male', 'American', 'Deep and calm'],
  ['colin', 'Colin', 'Male', 'British', 'Warm and confident'],
  ['miles', 'Miles', 'Male', 'American', 'Calm and sincere']
];
export const NARRATION_VOICES = Object.freeze(voices.map(([slug, name, presentation, accent, tone]) => Object.freeze({
  id: `flux-${slug}-en`, name, presentation, accent, tone, language: 'English',
  provider: 'Deepgram Flux', bestFor: ['Photo Story'], previewUrl: `/veylo/audio/voices/${slug}.mp3`
})));

export const DEFAULT_NARRATION_VOICE_ID = 'flux-hannah-en';

export function narrationVoice(voiceId = DEFAULT_NARRATION_VOICE_ID) {
  return NARRATION_VOICES.find(voice => voice.id === voiceId);
}
