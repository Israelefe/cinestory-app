import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, ArrowRight, Plus, Check, BadgeCheck, Camera } from 'lucide-react';
import Footer from './Footer.jsx';

export function Reveal({ children, className = '', delay = 0, ...props }) {
  const reduced = useReducedMotion();
  return <motion.div className={className} initial={reduced ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: false, amount: 0.14, margin: "-30px 0px" }} transition={{ duration: reduced ? 0 : 0.65, delay: reduced ? 0 : delay, ease: [0.22, 1, 0.36, 1] }} {...props}>{children}</motion.div>;
}

export function Photo({ name, url, thumbnailUrl, alt, className = '', eager = false, sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 60vw, 50vw', ...props }) {
  const imageRef = React.useRef(null);
  const [loaded, setLoaded] = React.useState(false);
  const [nearViewport, setNearViewport] = React.useState(eager);

  React.useEffect(() => {
    if (eager || nearViewport) return undefined;
    const image = imageRef.current;
    if (!image || !('IntersectionObserver' in window)) {
      setNearViewport(true);
      return undefined;
    }

    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      setNearViewport(true);
      observer.disconnect();
    }, { rootMargin: '160% 0px', threshold: 0.01 });

    observer.observe(image);
    return () => observer.disconnect();
  }, [eager, nearViewport]);

  if (url) {
    return <img
      ref={imageRef}
      src={url}
      sizes={sizes}
      alt={alt || ''}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : nearViewport ? 'auto' : 'low'}
      decoding="async"
      onLoad={() => setLoaded(true)}
      className={'v-photo ' + (loaded ? 'is-loaded ' : 'is-loading ') + className}
      style={{
        backgroundImage: thumbnailUrl && !loaded ? `url("${thumbnailUrl}")` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        transition: 'filter 0.35s ease, opacity 0.35s ease',
        ...props.style
      }}
      {...props}
    />;
  }

  const source = '/veylo/web/' + name;
  return <img
    ref={imageRef}
    src={nearViewport ? source + '-960.webp' : undefined}
    srcSet={nearViewport ? source + '-480.webp 480w, ' + source + '-960.webp 960w, ' + source + '-1440.webp 1440w' : undefined}
    sizes={sizes}
    alt={alt}
    loading={nearViewport ? 'eager' : 'lazy'}
    fetchPriority={eager ? 'high' : nearViewport ? 'auto' : 'low'}
    decoding="async"
    className={'v-photo ' + className}
    {...props}
  />;
}

export function Action({ children, to = '/create', secondary = false, className = '', ...props }) {
  return <Link to={to} className={'v-button ' + (secondary ? 'v-button-secondary ' : '') + className} {...props}><span>{children}</span><ArrowUpRight size={18} aria-hidden="true" /></Link>;
}

export function Eyebrow({ children, number }) {
  return <p className="v-eyebrow">{number && <span className="v-index">{number}</span>}{children}</p>;
}

export function Page({ children, className = '', footer = true }) {
  return <div className={'v-public ' + className}>{children}{footer && <Footer />}</div>;
}

export function Intro({ eyebrow, title, accent, description, children, className = '' }) {
  return <header className={'v-wrap v-page-intro ' + className}><Reveal><Eyebrow>{eyebrow}</Eyebrow><h1 className="v-title">{title}{accent && <><br /><em>{accent}</em></>}</h1>{description && <p className="v-lead">{description}</p>}{children}</Reveal></header>;
}

export function EndNote({ title = 'Your next shoot.', accent = 'Give it a proper arrival.', description = 'The editing is done. Choose how your client will meet the photographs.', showFormats = true, formatsTo = '/formats' }) {
  return <section className="v-endnote"><div className="v-wrap"><Reveal className="v-endnote-inner"><div><Eyebrow>Made for the finished shoot</Eyebrow><h2 className="v-heading">{title}<br /><em>{accent}</em></h2><p className="v-copy">{description}</p></div><div className="v-actions"><Action to="/signup">Get started</Action>{showFormats && <Action to={formatsTo} secondary>Explore the formats</Action>}</div></Reveal></div></section>;
}

export const questions = [
  { q: 'What does Veylo deliver?', a: 'Veylo presents the same finished shoot in one of six formats: Photo Story, Editorial Page, Photo Reveal, Canvas, Chapters, or Album. Every format leads to the complete gallery and downloads.' },
  { q: 'What should I upload?', a: 'Upload the final edited photographs your client is meant to receive. Add the client’s name and explain what the shoot is about so the presentation has the right context.' },
  { q: 'Does Veylo change my photographs?', a: 'No. Veylo designs the presentation around your photographs. It does not replace an image, retouch a face, or alter your colour grade.' },
  { q: 'Do I choose a template?', a: 'No fixed template decides how the shoot looks. Veylo studies the photographs and proposes the layout, colours, type, order, motion, and pacing. You review the result before publishing.' },
  { q: 'Does my client need an account?', a: 'No. Send the delivery link through WhatsApp, Instagram DM, or email. Your client opens it in a browser and can browse and download the photographs there.' },
  { q: 'Can clients download the photographs?', a: 'Yes. The complete gallery is part of every delivery. Clients can browse the final photographs and download the files provided by the photographer.' }
];

export function Questions({ items = questions }) {
  return <div className="v-faq">{items.map((item, i) => <details key={item.q}><summary><span className="v-index">{String(i + 1).padStart(2, '0')}</span><span>{item.q}</span><Plus size={20} aria-hidden="true" /></summary><p>{item.a}</p></details>)}</div>;
}

export function Plans() {
  const free = ['3 final photo deliveries each month', 'Up to 100 photos in each delivery', 'All six formats with Veylo branding'];
  const pro = ['Unlimited deliveries under fair use', 'Up to 500 photos in each delivery', 'Studio branding, Portfolio, and 50 GB storage'];
  return <div className="v-plans"><Reveal className="v-plan"><div className="v-plan-number"><span>01</span><small>FREE</small></div><div className="v-plan-top"><Camera size={22} /><span className="v-eyebrow">For trying Veylo with real client work</span></div><h3>Veylo Free</h3><p className="v-price">₦0<span>/ month</span></p><p className="v-copy">Deliver up to three finished shoots each month. Any delivery can use any of Veylo’s six formats.</p><p className="v-plan-format-note"><Check size={15} />Choose any format for every delivery</p><ul>{free.map(x => <li key={x}><Check size={17} /><span>{x}</span></li>)}</ul><Action to="/signup">Start free</Action><p className="v-fine">No payment card needed. Your three deliveries reset monthly.</p></Reveal><Reveal className="v-plan v-plan-pro" delay={0.08}><div className="v-plan-number"><span>02</span><small>PRO</small></div><div className="v-plan-top"><BadgeCheck size={22} /><span className="v-eyebrow">For regular client delivery</span></div><h3>Veylo Pro</h3><p className="v-price">₦25,000<span>/ month</span></p><p className="v-copy">For photographers and studios delivering work every week and wanting their own name across the experience.</p><p className="v-plan-format-note"><Check size={15} />Choose any format for every delivery</p><ul>{pro.map(x => <li key={x}><Check size={17} /><span>{x}</span></li>)}</ul><Action to="/billing">Choose Pro</Action><p className="v-fine">Billed monthly. Unlimited delivery is covered by the fair use policy.</p></Reveal></div>;
}

export function TextLink({ to, children, ...props }) {
  return <Link className="v-text-link" to={to} {...props}>{children}<ArrowRight size={17} aria-hidden="true" /></Link>;
}
