// Audio is part of a format's contract, not a global delivery switch.
// Keep this table in sync with client/src/constants/deliveryCapabilities.js.
export const DELIVERY_CAPABILITIES = Object.freeze({
  'photo-story': Object.freeze({ music: true, narration: true }),
  'photo-reveal': Object.freeze({ music: true, narration: false }),
  album: Object.freeze({ music: true, narration: false }),
  editorial: Object.freeze({ music: false, narration: false }),
  canvas: Object.freeze({ music: false, narration: false }),
  chapters: Object.freeze({ music: false, narration: false }),
  'event-coverage': Object.freeze({ music: false, narration: false }),
  campaign: Object.freeze({ music: false, narration: false })
});

export function getDeliveryCapabilities(format) {
  return DELIVERY_CAPABILITIES[format] || { music: false, narration: false };
}

export function supportsDeliveryMusic(format) {
  return Boolean(getDeliveryCapabilities(format).music);
}

export function supportsDeliveryNarration(format) {
  return Boolean(getDeliveryCapabilities(format).narration);
}
