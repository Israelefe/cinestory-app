import { motion } from 'framer-motion';
import { Upload, Wifi, WifiOff } from 'lucide-react';
import { useVeyloReducedMotion } from '../utils/motionPolicy.js';
import './UploadConnectionStatus.css';

export default function UploadConnectionStatus({ batch }) {
  const reduced = useVeyloReducedMotion();
  if (!batch) return null;
  const count = Math.min(batch.limit, batch.total);
  const message = batch.offline ? 'Waiting for your internet connection.'
    : batch.reason === 'busy' ? 'Veylo is busy. Uploading fewer photos at once.'
      : batch.reason === 'slow' ? 'Connection is slow. Uploading fewer photos at once.'
        : batch.reason === 'connection' ? 'Connection interrupted. Uploading fewer photos at once.'
          : `Uploading up to ${count} photo${count === 1 ? '' : 's'} at once.`;
  const Icon = batch.offline ? WifiOff : batch.reason ? Wifi : Upload;
  return <motion.section className="delivery-upload-connection" role="status" aria-live="polite" aria-atomic="true"
    initial={reduced ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .2 }}>
    <p><Icon size={16} aria-hidden="true" /><span>{message}</span></p>
    <p className="delivery-upload-count">{batch.completed} of {batch.total} photos added</p>
  </motion.section>;
}
