import React from 'react';
import { useProPricing } from './ProPricing.jsx';
export function useVideoAvailability() { return useProPricing().videoDelivery || { available: false, configured: false }; }
export default function VideoAvailability({ compact = false }) {
  const config = useVideoAvailability();
  return <span>{config.available ? (compact ? 'Video delivery · Pro' : 'Video delivery included with Pro') : (compact ? 'Video delivery · Coming to Pro' : 'Video delivery is coming to Pro. Uploads open when the service is ready.')}</span>;
}
