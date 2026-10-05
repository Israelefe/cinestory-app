import React from 'react';
import { Check, ArrowUpRight, Image as ImageIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { useVeyloReducedMotion } from '../utils/motionPolicy.js';
import { portfolioDesigns } from './portfolioDesigns.js';
import './PortfolioDesignPicker.css';

function DesignThumbnail({ design, form }) {
  const cover = form.items.find(photo => photo.publicId === form.heroPublicId) || form.items[0];
  const photographs = [cover, ...form.items.filter(photo => photo !== cover)].filter(Boolean).slice(0, 3);
  const image = index => photographs[index] ? <img src={photographs[index].thumbnailUrl || photographs[index].url} alt="" loading="lazy" style={{ objectPosition: `${photographs[index].focalX ?? 50}% ${photographs[index].focalY ?? 50}%` }} /> : <span className="vpd-placeholder"><ImageIcon size={20} /></span>;
  return <div className={`vpd-thumbnail vpd-thumbnail-${design.id}`} aria-hidden="true">
    <div className="vpd-mini-nav"><span>{form.studioName || 'Your studio'}</span><span>Work / Contact</span></div>
    <div className="vpd-mini-heading">{form.headline || form.studioName || 'Your photographs'}</div>
    <div className="vpd-mini-images"><div>{image(0)}</div><div>{image(1)}</div><div>{image(2)}</div></div>
    <span className="vpd-mini-label">{design.label}</span>
  </div>;
}

export default function PortfolioDesignPicker({ form, onChange, onPreview }) {
  const reduced = useVeyloReducedMotion();
  return <section className="vpd-picker" aria-labelledby="vpd-title">
    <div className="vpd-introduction"><div><p className="vpd-kicker">The look of your studio</p><h2 id="vpd-title">Choose how your work is seen.</h2></div><p>Each design has its own opening, photo arrangement and mobile layout. Try it with your photographs before you choose.</p></div>
    <div className="vpd-grid" role="radiogroup" aria-label="Portfolio design">
      {portfolioDesigns.map((design, index) => <motion.article key={design.id} className={`vpd-card ${form.direction.template === design.id ? 'is-selected' : ''}`} initial={reduced ? false : { opacity: 0, y: 10 }} animate={reduced ? { opacity: 1, y: 0 } : undefined} whileInView={reduced ? undefined : { opacity: 1, y: 0 }} viewport={{ once: true, amount: .1 }} transition={{ duration: reduced ? 0 : .3, delay: reduced ? 0 : index * .04 }}>
        <label className="vpd-choice">
          <input type="radio" name="portfolio-design" value={design.id} checked={form.direction.template === design.id} onChange={() => onChange(design)} aria-label={`${design.name} design`} />
          <DesignThumbnail design={design} form={form} />
          <span className="vpd-title"><span><small>{String(index + 1).padStart(2, '0')}</small><strong>{design.name}</strong></span><span className="vpd-selected-mark">{form.direction.template === design.id ? <Check size={18} /> : <span />}</span></span>
          <span className="vpd-description">{design.description}</span>
        </label>
        <div className="vpd-card-bottom"><p>{design.mobile}</p><button type="button" onClick={() => onPreview(design.id)}>Preview {design.name}<ArrowUpRight size={16} /></button></div>
      </motion.article>)}
    </div>
    {!form.items.length && <p className="vpd-note">Add your photographs in Work to see them in these previews.</p>}
    <p className="vpd-note">Each design starts with its own colours, type and motion. Adjust them below. Your public page changes when you publish.</p>
  </section>;
}
