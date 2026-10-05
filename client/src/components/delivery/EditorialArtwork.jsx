import { motion } from 'framer-motion';
import { useVeyloReducedMotion } from '../../utils/motionPolicy.js';

const drawings = {
  curve: [
    'M18 105C52 18 188 11 188 75C188 122 104 158 69 125C31 89 151 36 211 66C238 80 222 118 193 133',
    'M30 143C67 121 115 119 160 140',
    'M172 31C184 31 195 28 207 22',
  ],
  botanical: [
    'M49 152C97 124 132 80 172 20',
    'M89 123C54 120 41 94 39 69C67 67 91 84 89 123Z',
    'M111 100C110 66 88 47 64 41C58 71 75 95 111 100Z',
    'M116 94C150 100 179 83 187 58C157 47 128 62 116 94Z',
    'M141 61C132 38 139 18 153 9C174 28 169 47 141 61Z',
  ],
  geometry: [
    'M23 124L71 24L197 61L149 161Z',
    'M67 146L114 47L224 79',
    'M39 52C95 2 180 12 211 52',
    'M27 159L65 159M212 137L212 162M199 150L226 150',
  ],
};

export function editorialArtworkKind(shootType = '') {
  if (/wedding|bridal|maternity/i.test(shootType)) return 'botanical';
  if (/fashion|lookbook|campaign|commercial|brand/i.test(shootType)) return 'geometry';
  return 'curve';
}

export default function EditorialArtwork({ kind = 'curve', className = '', paused = false }) {
  const reduced = useVeyloReducedMotion();
  const animated = !reduced && !paused;
  return <svg className={`ed-illustration ${className}`} viewBox="0 0 240 180" aria-hidden="true" focusable="false" fill="none" data-drawing={kind}>
    {(drawings[kind] || drawings.curve).map((path, index) => <motion.path
      key={path} d={path} stroke="currentColor" strokeWidth={index === 0 ? 1.8 : 1.2} strokeLinecap="round" strokeLinejoin="round"
      initial={animated ? { pathLength: 0, opacity: 0 } : false}
      whileInView={{ pathLength: 1, opacity: index === 0 ? .85 : .55 }}
      viewport={{ once: true, amount: .25 }}
      transition={{ duration: animated ? .9 : 0, delay: animated ? index * .12 : 0, ease: [.22, 1, .36, 1] }}
    />)}
  </svg>;
}
