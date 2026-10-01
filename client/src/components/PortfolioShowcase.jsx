import React, { useEffect, useRef, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import PortfolioCanvas from '../pages/PortfolioCanvas.jsx';
import { portfolioDesigns } from './portfolioDesigns.js';
import './PortfolioShowcase.css';

const photos = [
  ['demo-wedding-2', 'Weddings', 'Folake & Tunde', 'Folake and Tunde on their wedding day'],
  ['demo-ada-5', 'Fashion', 'The Green Issue', 'Ada wearing a green suit for a fashion editorial'],
  ['demo-sharon-2', 'Portraits', 'Sharon', 'Sharon photographed in natural light'],
  ['demo-lora-2', 'Birthdays', 'Lora / Thirty', 'Lora during her birthday portrait session'],
  ['demo-wedding-3', 'Weddings', '', 'A photograph from Folake and Tunde’s wedding'],
  ['demo-wedding-4', 'Weddings', '', 'Folake and Tunde celebrating their wedding'],
  ['demo-lora-3', 'Birthdays', '', 'Another portrait from Lora’s birthday session'],
  ['demo-courage-2', 'Portraits', 'Courage', 'Courage during her graduation portrait session']
].map(([asset, category, title, alt], index) => ({ id: `sample-${index}`, category, title, alt, featured: true, crop: 'fit', focalX: 50, focalY: 50, url: `/veylo/web/${asset}-960.webp`, thumbnailUrl: `/veylo/web/${asset}-480.webp`, srcSet: [480, 960, 1440].map(width => `/veylo/web/${asset}-${width}.webp ${width}w`).join(', ') }));
const sample = {
  handle: 'kolawolemedia', studioName: 'KOLAWOLE MEDIA', headline: 'People, as they are.',
  introLine: 'Weddings, portraits, and fashion photographed in Lagos and across Nigeria.',
  location: 'Lekki, Lagos', whatsapp: '2348012345678', contactLabel: 'Ask about a shoot',
  heroId: photos[0].id, items: photos, categories: ['Weddings', 'Portraits', 'Fashion', 'Birthdays'],
  projects: [{ id: 'sample-wedding', title: 'Folake & Tunde', category: 'Weddings', description: 'A wedding celebration in Lagos.', coverId: photos[4].id, photoIds: [photos[0].id, photos[4].id, photos[5].id] }]
};

export default function PortfolioShowcase() {
  const [designId, setDesignId] = useState('editorial');
  const [device, setDevice] = useState('desktop');
  const [available, setAvailable] = useState(390);
  const viewportRef = useRef(null);
  const design = portfolioDesigns.find(item => item.id === designId);
  useEffect(() => {
    const observer = new ResizeObserver(entries => setAvailable(entries[0].contentRect.width));
    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { viewportRef.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }, [designId, device]);
  const width = device === 'phone' ? 390 : available;
  return <div className="v-portfolio-showcase">
    <div className="v-portfolio-showcase-heading"><div><p className="v-eyebrow">Four designs. Your photographs.</p><h2>See how your portfolio can look.</h2><p>Try each design, browse the categories, and open a project. These use the same layouts as a published portfolio.</p></div><nav aria-label="Sample screen size">{[['desktop', Monitor, 'Full width'], ['phone', Smartphone, 'Phone']].map(([key, Icon, label]) => <button key={key} aria-pressed={device === key} onClick={() => setDevice(key)}><Icon size={17} />{label}</button>)}</nav></div>
    <div className="v-portfolio-showcase-designs" role="group" aria-label="Sample portfolio design">{portfolioDesigns.map(item => <button key={item.id} aria-pressed={designId === item.id} onClick={() => setDesignId(item.id)}><span>{item.name}</span><small>{item.label}</small></button>)}</div>
    <div className="v-portfolio-showcase-description"><strong>{design.name}</strong><p>{device === 'phone' ? design.mobile : design.description}</p><span>Sample studio · Scroll inside to explore</span></div>
    <div className="v-portfolio-showcase-viewport" data-portfolio-scroll ref={viewportRef} tabIndex={0} role="region" aria-label={`${design.name} portfolio sample`}><div className="v-portfolio-showcase-screen" style={{ width, zoom: Math.min(1, available / width) }}><PortfolioCanvas key={`${designId}-${device}`} portfolio={{ ...sample, direction: { ...design.defaults, template: designId } }} preview="sample" /></div></div>
  </div>;
}
