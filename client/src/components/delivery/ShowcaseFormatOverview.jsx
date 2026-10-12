import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { DELIVERY_FORMATS } from '../../constants/deliveryFormats.js';
import { Photo } from '../PublicDesign.jsx';
import { DEMO_PALETTES } from '../../constants/demoPalettes.js';
import { PHOTO_REVEAL_DEMO } from '../../constants/photoRevealDemo.js';
import './ShowcaseFormatOverview.css';

const photoCounts = { 'photo-story': 1, editorial: 2, 'photo-reveal': 1, canvas: 3, chapters: 3, album: 2, 'event-coverage': 3, campaign: 3 };

function FormatThumbnail({ format }) {
  const palette = format.value === 'canvas' ? DEMO_PALETTES.canvas : format.value === 'photo-reveal' ? PHOTO_REVEAL_DEMO.creativeDirection.palette : null;
  const style = palette ? { '--thumbnail-bg': palette.background, '--thumbnail-frame': palette.surface } : undefined;
  return <div className={'v-showcase-thumbnail is-' + format.value} style={style} aria-hidden="true">
    <div className="v-showcase-thumbnail-photos">{format.photos.slice(0, photoCounts[format.value]).map((photo, index) => <div key={photo}><Photo name={photo} alt="" eager={index === 0} sizes="(max-width: 767px) 42vw, (max-width: 1099px) 20vw, 12vw" /></div>)}</div>
    {format.value === 'photo-story' && <span className="v-showcase-thumbnail-progress"><i /><i /><i /></span>}
    {format.value === 'editorial' && <span className="v-showcase-thumbnail-lines"><i /><i /><i /></span>}
  </div>;
}

export default function ShowcaseFormatOverview() {
  return <div className="v-showcase-overview">
    <header><strong>Eight ways to open a gallery</strong><span>SHOWCASE DELIVERY</span></header>
    <div className="v-showcase-overview-grid">
      {DELIVERY_FORMATS.map(format => <Link key={format.value} className="v-showcase-overview-format" to={format.value === 'photo-story' ? '/demo' : '/demo/' + (format.value === 'photo-reveal' ? 'reveal' : format.value)} target="_blank" rel="noopener noreferrer" aria-label={'Preview ' + format.name}>
        <div className="v-showcase-overview-art"><FormatThumbnail format={format} /></div>
        <span>{format.name}<ArrowUpRight size={12} aria-hidden="true" /></span>
      </Link>)}
    </div>
  </div>;
}
