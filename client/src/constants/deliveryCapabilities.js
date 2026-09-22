// Audio is part of a format's contract, not a global delivery switch.
// Keep this table in sync with server/src/constants/deliveryCapabilities.js.
export const DELIVERY_CAPABILITIES = Object.freeze({
  'photo-story': Object.freeze({ music: true, narration: true, soundtrackOwner: 'format', narrationOwner: 'format' }),
  'photo-reveal': Object.freeze({ music: true, narration: false, soundtrackOwner: 'format', narrationOwner: 'none' }),
  album: Object.freeze({ music: true, narration: false, soundtrackOwner: 'format', narrationOwner: 'none' }),
  editorial: Object.freeze({ music: false, narration: false, soundtrackOwner: 'none', narrationOwner: 'none' }),
  canvas: Object.freeze({ music: false, narration: false, soundtrackOwner: 'none', narrationOwner: 'none' }),
  chapters: Object.freeze({ music: false, narration: false, soundtrackOwner: 'none', narrationOwner: 'none' }),
  'event-coverage': Object.freeze({ music: false, narration: false, soundtrackOwner: 'none', narrationOwner: 'none' }),
  campaign: Object.freeze({ music: false, narration: false, soundtrackOwner: 'none', narrationOwner: 'none' })
});

export function getDeliveryCapabilities(format) {
  return DELIVERY_CAPABILITIES[format] || Object.freeze({ music: false, narration: false, soundtrackOwner: 'none', narrationOwner: 'none' });
}

export function supportsDeliveryMusic(format) {
  return getDeliveryCapabilities(format).music;
}

export function supportsDeliveryNarration(format) {
  return getDeliveryCapabilities(format).narration;
}
