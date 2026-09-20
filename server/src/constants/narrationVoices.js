export const NARRATION_VOICES = Object.freeze([
  Object.freeze({
    id: 'flux-hannah-en',
    name: 'Hannah',
    presentation: 'Female',
    tone: 'Clear, thoughtful, pleasant storyteller',
    provider: 'Deepgram Flux',
    bestFor: ['Photo Story', 'Chapters', 'Editorial', 'Event Coverage', 'Campaign']
  })
]);

export const DEFAULT_NARRATION_VOICE_ID = 'flux-hannah-en';

export function narrationVoice(voiceId = DEFAULT_NARRATION_VOICE_ID) {
  return NARRATION_VOICES.find(voice => voice.id === voiceId);
}
