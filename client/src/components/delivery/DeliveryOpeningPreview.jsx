import React from 'react';
import { ArrowRight, Camera, Layers3 } from 'lucide-react';
import DeliveryFormatVisual from '../DeliveryFormatVisual.jsx';
import { DEMO_PALETTES } from '../../constants/demoPalettes.js';
import { PHOTO_REVEAL_DEMO } from '../../constants/photoRevealDemo.js';
import './DeliveryOpeningPreview.css';

const boardPhotos = [4, 1, 5, 6, 2, 3];

export default function DeliveryOpeningPreview({ kind = 'showcase', format }) {
  const palette = kind === 'pinboard' ? DEMO_PALETTES.gridboard : format?.value === 'canvas' ? DEMO_PALETTES.canvas : format?.value === 'photo-reveal' ? PHOTO_REVEAL_DEMO.creativeDirection.palette : null;
  const style = palette ? { '--opening-bg': palette.background, '--opening-surface': palette.surface, '--opening-text': palette.text, '--opening-accent': palette.accent } : undefined;

  return <div className={'delivery-opening-preview is-' + kind} style={style} aria-hidden="true" inert="">
    {kind === 'showcase' && format && <DeliveryFormatVisual key={format.value} format={format.id === 'photo-story' ? { ...format, storyCaption: 'Lora’s birthday, in photographs.', storyEyebrow: 'A DAY FOR LORA' } : format} compact paused />}
    {kind === 'pinboard' && <div className="opening-board">
      <div className="opening-studio"><Camera size={15} /><span>Photographed by <strong>Veylo Studio</strong></span></div>
      <div className="opening-board-title"><span>THE COMPLETE GALLERY</span><strong>Lora’s birthday<br />photographs.</strong><small>All photos <i /> 6 photographs</small></div>
      <div className="opening-board-photos">{boardPhotos.map((number, index) => <figure key={number}><img src={'/veylo/web/demo-lora-' + number + '-480.webp'} alt="" loading="lazy" decoding="async" /><figcaption>{String(index + 1).padStart(2, '0')}</figcaption></figure>)}</div>
    </div>}
    {kind === 'photoswap' && <div className="opening-swap">
      <div className="opening-studio"><Camera size={15} /><span>Photographed by <strong>Studio Lumière</strong></span></div>
      <div className="opening-swap-stack">{[3, 2, 1].map((number, index) => <figure className={'is-card-' + index} key={number}><img src={'/veylo/web/demo-sharon-' + number + '-480.webp'} alt="" loading="lazy" decoding="async" />{index === 2 && <figcaption><span>01 / 05</span><strong>Sharon’s studio portraits</strong></figcaption>}</figure>)}</div>
      <div className="opening-swap-hint"><Layers3 size={15} /><span>One photograph at a time</span><ArrowRight size={15} /></div>
    </div>}
  </div>;
}
