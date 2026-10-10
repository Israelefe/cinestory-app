import React from 'react';
import { useProPricing } from './ProPricing.jsx';
export function useVideoAvailability() { return useProPricing().videoDelivery || { available: false, configured: false }; }
export default function VideoAvailability({ compact = false }) {
  // Plan inclusion stays consistent; upload controls use the live availability hook.
  return <span>{compact ? 'Video delivery · Included with Pro' : 'Video delivery included with Pro'}</span>;
}
