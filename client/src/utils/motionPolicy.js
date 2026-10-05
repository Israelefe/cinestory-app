// Veylo keeps its intended motion regardless of the operating system preference.
// Photographer-selected still effects and playback pause controls remain local.
export const VEYLO_MOTION_CONFIG = Object.freeze({ reducedMotion: 'never' });

// Shared compatibility flag for components with full/still animation branches.
// This intentionally does not subscribe to the device's motion preference.
export function useVeyloReducedMotion() {
  return VEYLO_MOTION_CONFIG.reducedMotion !== 'never';
}
