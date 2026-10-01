import React from 'react';
import { REVEAL_STYLES } from '../../utils/photoReveal.js';
import './RevealDesignControls.css';

export default function RevealDesignControls({ value, onChange, disabled = false }) {
  return <section className="rv-design"><h2>Photo Reveal style</h2><p>Try each style in the client preview before choosing.</p>
    <label>Reveal transition<select disabled={disabled} value={value.style} onChange={event => onChange({ ...value, style: event.target.value })}>{Object.entries(REVEAL_STYLES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    <label>Photo movement<select disabled={disabled} value={value.movement ? 'gentle' : 'still'} onChange={event => onChange({ ...value, movement: event.target.value === 'gentle' })}><option value="gentle">Gentle movement</option><option value="still">Keep photographs still</option></select></label>
    <label>Closing arrangement<select disabled={disabled} value={value.ending} onChange={event => onChange({ ...value, ending: event.target.value })}><option value="triptych">Three photographs</option><option value="single">Closing photograph only</option></select></label>
    <small>The closing photo leads the three-photo arrangement. The two supporting photos come from the end of your showcase.</small>
  </section>;
}
