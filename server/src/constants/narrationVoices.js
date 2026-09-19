export const NARRATION_VOICES = Object.freeze([
  Object.freeze({ id: '8P18CIVcRlwP98FOjZDm', name: 'Ola', presentation: 'masculine', tone: 'Warm documentary storyteller', bestFor: ['wedding', 'documentary', 'milestone'] }),
  Object.freeze({ id: 'U7wWSnxIJwCjioxt86mk', name: 'Olaniyi Victor', presentation: 'masculine', tone: 'Rich, calm Lagos cadence', bestFor: ['family', 'portrait', 'personal'] }),
  Object.freeze({ id: 'TBvIh5TNCMX6pQNIcWV8', name: 'Chidiebere', presentation: 'masculine', tone: 'Deep, clear and reflective', bestFor: ['editorial', 'anniversary', 'documentary'] }),
  Object.freeze({ id: 'kMy0Co9mV2JmuSM9VcRQ', name: 'Ekemini', presentation: 'feminine', tone: 'Confident and reassuring', bestFor: ['wedding', 'family', 'documentary'] }),
  Object.freeze({ id: 'oC2pCZZWEDRe6lmZpaaw', name: 'Bukola', presentation: 'feminine', tone: 'Gentle, clear and warm', bestFor: ['maternity', 'portrait', 'family'] }),
  Object.freeze({ id: 'AWxJjhmijML4C3mGaEAT', name: 'Jemmyeh', presentation: 'feminine', tone: 'Natural storyteller with a rich accent', bestFor: ['milestone', 'wedding', 'personal'] })
]);

export const DEFAULT_NARRATION_VOICE_ID = '8P18CIVcRlwP98FOjZDm';

export function narrationVoice(voiceId) {
  return NARRATION_VOICES.find(voice => voice.id === voiceId);
}
