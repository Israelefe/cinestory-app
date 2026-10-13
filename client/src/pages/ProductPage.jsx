import SwipePhotoCard from '../components/library/SwipePhotoCard.jsx';
import SelectionReplacement from '../components/library/SelectionReplacement.jsx';
import PhotoViewer from '../components/library/PhotoViewer.jsx';
import { decidePhoto, undoDecision } from '../utils/clientSelection.js';
import { AnimatePresence } from 'framer-motion';
import { Undo2, X } from 'lucide-react';
import '../components/library/LibraryWorkspace.css';
import React, { useEffect, useState } from 'react';
import VideoAvailability from '../components/VideoAvailability.jsx';
import { VIDEO_DEMO_MEDIA, demoVideoUrl } from '../constants/videoDemoMedia.js';
import './VideoDeliveryPage.css';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, ArrowUpRight, BadgeCheck, Camera, Check, CheckCheck, Clapperboard, Download, Eye, Folder, HardDrive, Image, LayoutGrid, LockKeyhole, MessageCircle, Send, ShieldCheck, Upload } from 'lucide-react';
import { Action, Eyebrow, Page, Photo, Questions, Reveal, TextLink } from '../components/PublicDesign.jsx';
import { ProPrice, useProPricing } from '../components/ProPricing.jsx';
import './ProductPage.css';

const portraits = ['demo-ada-1', 'demo-ada-2', 'demo-ada-3'];
const productSections = [['Photo Pre-selection', 'client-preselection'], ['Editor Links', 'editor-handoff'], ['Photo Library', 'image-library'], ['Delivery', 'delivery'], ['Portfolio', 'portfolio'], ['Plans', 'plans']];
const showcaseFormats = [['Photo Story', '/demo'], ['Editorial', '/demo/editorial'], ['Photo Reveal', '/demo/reveal'], ['Canvas', '/demo/canvas'], ['Chapters', '/demo/chapters'], ['Album', '/demo/album'], ['Event Coverage', '/demo/event-coverage'], ['Campaign', '/demo/campaign']];

function ProLabel() { return <span className="vp-pro"><BadgeCheck size={13} aria-hidden="true" />Included with Pro</span>; }
function Notes({ items }) { return <ul className="vp-notes">{items.map(item => <li key={item}><Check size={16} aria-hidden="true" /><span>{item}</span></li>)}</ul>; }
function PreviewHeader({ icon: Icon = Camera, title, detail }) { return <header className="vp-preview-header"><span className="vp-preview-mark"><Icon size={16} aria-hidden="true" /></span><div><strong>{title}</strong><span>{detail}</span></div><span className="vp-example">Example</span></header>; }
function StorageAmount({ plans }) {
  const gb = plans?.find(plan => plan.id === 'pro')?.personalStorageGb;
  return <>{Number.isFinite(gb) && gb > 0 ? `${gb} GB` : 'Personal storage'}</>;
}

function HeroPreview() {
  const [stage, setStage] = useState('delivery');
  const stages = [['selection', 'Client choices', CheckCheck], ['editor', 'Editor Links', Upload], ['delivery', 'Final delivery', Send]];
  return <div className="vp-hero-preview">
    <div className="vp-hero-preview-top"><span><Camera size={15} />KOLA STUDIO</span><span>ADA’S PORTRAITS / LAGOS</span></div>
    <div className={`vp-hero-scene is-${stage}`}>
      <div className="vp-hero-main"><Photo name="demo-ada-2" eager alt="Ada in a green velvet jacket, from the Veylo sample portrait shoot" sizes="(max-width: 767px) 85vw, 42vw" /><div className="vp-hero-photo-caption"><span>ADA / STUDIO PORTRAITS</span><strong>A little green.<br />A lot of presence.</strong></div></div>
      <div className="vp-hero-side"><Photo name="demo-ada-3" eager alt="A second portrait from Ada’s sample shoot" sizes="(max-width: 767px) 30vw, 16vw" /><div className="vp-hero-receipt" key={stage}>{stage === 'selection' ? <><CheckCheck size={22} /><span>PHOTO PRE-SELECTION</span><strong>Their choices.<br />Ready for editing.</strong><p>A private link to choose.</p></> : stage === 'editor' ? <><Upload size={22} /><span>EDITOR LINK</span><strong>Originals out.<br />Finished edits back.</strong><p>One protected editor link.</p></> : <><Send size={22} /><span>FINISHED DELIVERY</span><strong>Your work.<br />Their first look.</strong><p>Open, view, and save.</p></>}</div></div>
    </div>
    <div className="vp-stage-controls" role="group" aria-label="Explore the shoot workflow">{stages.map(([id, label, Icon], i) => <button type="button" key={id} aria-pressed={stage === id} onClick={() => setStage(id)}><span>0{i + 1}</span><Icon size={15} aria-hidden="true" /><strong>{label}</strong></button>)}</div>
  </div>;
}

function SelectionPreview() {
  const photos = portraits.map((name, index) => ({ id: name, originalFilename: 'Portrait_0' + (index + 1) + '.jpg' }));
  const [choices, setChoices] = useState({ selected: [], reviewed: [], cursor: 0, history: [] });
  const [mode, setMode] = useState('deck'), [ready, setReady] = useState(() => new Set()), [failed, setFailed] = useState(''), [retry, setRetry] = useState(0), [direction, setDirection] = useState(1), [replacement, setReplacement] = useState(null), [viewer, setViewer] = useState(null);
  const media = (id, size) => '/veylo/web/' + id + (size === 'thumb' ? '-480.webp' : '-960.webp');
  const current = photos[choices.cursor];
  function decide(id, choose, advance = false, replaceId) { const next = decidePhoto(choices, id, choose, advance ? Math.min(photos.length, choices.cursor + 1) : choices.cursor, 2, replaceId); if (next === choices) { setReplacement({ id, advance }); return false; } setChoices(next); setDirection(choose ? 1 : -1); setReplacement(null); return true; }
  return <div className="vp-preview vp-selection-preview lib-public-page">
    <PreviewHeader title="Kola Studio" detail="Ada’s portrait selection" />
    <div className="vp-preview-body"><span className="vp-small-label">PHOTO PRE-SELECTION</span><h3>Which ones shall we edit?</h3><p>Choose exactly 2 photographs. Try the same swipe controls your client will use.</p>
      <div className="sel-progress"><strong>{choices.selected.length} of 2 chosen</strong><span>{choices.reviewed.length} of 3 reviewed</span></div>
      <nav className="sel-modes" aria-label="Example selection views"><button type="button" aria-pressed={mode === 'deck'} onClick={() => { setMode('deck'); if (!current) setChoices(value => ({ ...value, cursor: 0 })); }}>Swipe</button><button type="button" aria-pressed={mode === 'all'} onClick={() => setMode('all')}>All photographs</button><button type="button" aria-pressed={mode === 'review'} onClick={() => setMode('review')}>Your choices</button></nav>
      {mode === 'deck' ? <><div className="sel-stage vp-live-selection"><AnimatePresence mode="popLayout" custom={direction}>{current ? <SwipePhotoCard key={current.id} photo={current} media={media} ready={ready} setReady={setReady} failed={failed} setFailed={setFailed} retry={retry} setRetry={setRetry} direction={direction} onDecision={decide} onInspect={photo => setViewer({ ...photo, url: media(photo.id) })} number={choices.cursor + 1} total={3} /> : <div className="lib-empty"><CheckCheck size={24} /><strong>All photographs reviewed</strong><button type="button" className="lib-button" onClick={() => setMode('review')}>Review choices</button></div>}</AnimatePresence><span className="vp-live-mark">VEYLO / PRE-SELECTION EXAMPLE</span></div><div className="sel-deck-controls"><button type="button" className="sel-skip" disabled={!current || !ready.has(current.id)} onClick={() => decide(current.id, false, true)}><X size={22} /><span>Skip</span></button><button type="button" className="sel-undo" disabled={!choices.history.length} onClick={() => setChoices(undoDecision(choices))}><Undo2 size={20} /><span>Undo</span></button><button type="button" className="sel-choose" disabled={!current || !ready.has(current.id)} onClick={() => decide(current.id, true, true)}><Check size={22} /><span>Choose</span></button></div></> : <><div className="lib-photo-grid">{photos.filter(photo => mode === 'all' || choices.selected.includes(photo.id)).map(photo => <button type="button" className={'lib-photo ' + (choices.selected.includes(photo.id) ? 'is-selected' : '')} key={photo.id} aria-label={'Choose ' + photo.originalFilename} aria-pressed={choices.selected.includes(photo.id)} onClick={() => decide(photo.id, !choices.selected.includes(photo.id))}><img src={media(photo.id, 'thumb')} alt={photo.originalFilename} /><i className="lib-check">{choices.selected.includes(photo.id) && <Check size={16} />}</i></button>)}</div><button type="button" className="lib-text-link" disabled={!choices.history.length} onClick={() => setChoices(undoDecision(choices))}><Undo2 size={16} />Undo</button></>}
    </div><footer className="vp-preview-footer"><LockKeyhole size={14} /><span>Example only. These choices are not saved.</span></footer>
    {replacement && <SelectionReplacement incomingId={replacement.id} photos={photos.filter(photo => choices.selected.includes(photo.id))} media={media} onReplace={id => decide(replacement.id, true, replacement.advance, id)} onClose={() => setReplacement(null)} />}{viewer && <PhotoViewer photos={[viewer]} onClose={() => setViewer(null)} />}
  </div>;
}

function EditorPreview() {
  const [view, setView] = useState('originals'), [accepted, setAccepted] = useState([]);
  return <div className="vp-preview vp-editor-preview lib-public-page">
    <PreviewHeader icon={LockKeyhole} title="Ada’s portraits" detail="Editor Link ? password protected" />
    <div className="vp-preview-body"><div className="vp-editor-intro"><div><span className="vp-small-label">EDITOR LINK</span><h3>Originals out. Edits back.</h3></div><Folder size={26} /></div>
      <div className="vp-editor-switch" role="group" aria-label="Editor Link example"><button type="button" aria-pressed={view === 'originals'} onClick={() => setView('originals')}><Download size={15} />Source photographs</button><button type="button" aria-pressed={view === 'edits'} onClick={() => setView('edits')}><Eye size={15} />Review returned edits</button></div>
      <div className="lib-photo-grid vp-editor-photos">{portraits.map((name, i) => <article key={name} className="editor-return-card"><div className="lib-photo"><Photo name={name} alt={'Sample source portrait ' + (i + 1)} sizes="(max-width:640px) 40vw, 18vw" /></div><div><strong>{view === 'originals' ? 'Portrait_0' + (i + 1) + '.CR3' : i === 2 ? 'Black and white alternative' : 'Main edit'}</strong><small>{view === 'originals' ? 'Camera original with JPEG preview' : 'Matched to original portrait ' + (i === 2 ? 1 : i + 1)}</small>{view === 'edits' && <button type="button" className="lib-button" disabled={accepted.includes(i)} onClick={() => setAccepted(values => [...values, i])}>{accepted.includes(i) ? 'Saved to Photo Library' : 'Accept & save to Library'}</button>}</div></article>)}</div>
      {accepted.length ? <div className="lib-notice"><Folder size={18} /><span>{accepted.length} accepted edit{accepted.length === 1 ? '' : 's'} in the job’s Photo Library folder. Choose that folder in the normal delivery setup.</span></div> : <p className="vp-demo-hint">{view === 'originals' ? 'Editors match returned files to these photographs visually.' : 'Try accepting an edit. Alternatives can be accepted alongside the main edit.'}</p>}
    </div><footer className="vp-preview-footer"><ShieldCheck size={14} /><span>Example only. No files are uploaded or saved.</span></footer>
  </div>;
}

function DeliveryPreview({ type }) {
  return <div className={`vp-delivery-art is-${type}`} aria-hidden="true">{type === 'showcase' ? <><Photo name="demo-wedding-1" alt="" sizes="(max-width: 767px) 85vw, 30vw" /><div><span>FOLAKE & TUNDE</span><strong>The day<br />we said yes.</strong></div><span className="vp-art-label"><Clapperboard size={13} />Photo Story</span></> : type === 'gridboard' ? <><div className="vp-mini-board">{['demo-lora-1', 'demo-lora-3', 'demo-lora-4', 'demo-lora-2'].map(name => <Photo key={name} name={name} alt="" sizes="(max-width: 767px) 42vw, 15vw" />)}</div><span className="vp-art-label"><LayoutGrid size={13} />The complete set</span></> : <><div className="vp-swap-back" /><div className="vp-swap-card"><Photo name="demo-lora-1" alt="" sizes="(max-width: 767px) 65vw, 22vw" /><span>LORA / BIRTHDAY PORTRAITS</span></div><span className="vp-art-label"><ArrowRight size={13} />One photo at a time</span></>}</div>;
}

export default function ProductPage({ user }) {
  const { plans } = useProPricing();
  const free = plans?.find(plan => plan.id === 'free');
  const pro = plans?.find(plan => plan.id === 'pro');
  const libraryTo = user ? '/library' : '/signup';
  const selectionTo = user ? '/pre-selection' : '/signup';
  const editorTo = user ? '/editor-links' : '/signup';
  const createTo = user ? '/create' : '/signup';
  useEffect(() => {
    const description = document.querySelector('meta[name="description"]');
    const previous = description?.getAttribute('content');
    description?.setAttribute('content', 'Explore Veylo: private client photo selection, password-protected Editor Links, Photo Library, finished photo delivery, and your studio Portfolio.');
    return () => { if (description) { if (previous === null) description.removeAttribute('content'); else description.setAttribute('content', previous); } };
  }, []);
  const faqs = [
    { q: 'Are client selection and final delivery the same link?', a: 'They are separate. A Library preselection link lets your client choose photographs for editing. A final delivery presents the finished photographs, with downloads and likes according to your settings.' },
    { q: 'Can my editor download originals and return edits?', a: 'Yes. With Pro, create a password-protected Editor Links from Photo Library. Your editor downloads the source files and uploads finished JPEG, PNG or WebP edits to the same link.' },
    { q: 'Does my client or editor need a Veylo account?', a: 'They open the link in their browser. Give them the PIN or password when you have protected the link. You manage the project from your own Veylo account.' },
    { q: 'What uses Photo Library storage?', a: 'Camera originals, their paired previews, and returned edits use your personal Library storage. Published photo deliveries use separate hosting. Original videos share your Pro storage. Keep your own backups of the originals.' },
    { q: 'Does Veylo edit or retouch the photographs?', a: 'No. Your photographer or editor supplies the finished files. Veylo helps with the presentation, words, sharing and delivery around those photographs.' },
    { q: 'What happens to selection and editor links when Pro ends?', a: 'Those links stop working without Pro. Your Library becomes read-only during the retention period shown in your account, so you can download or remove retained files. Portfolio access also requires Pro.' }
  ];
  return <Page className="vp-page">
    <header className="v-wrap vp-hero">
      <Reveal className="vp-hero-title"><Eyebrow>THE VEYLO PRODUCT / FOR PHOTOGRAPHERS & STUDIOS</Eyebrow><h1>From client choices<br />to <em>finished delivery.</em></h1></Reveal>
      <Reveal className="vp-hero-visual" delay={.08}><HeroPreview /></Reveal>
      <Reveal className="vp-hero-after"><p className="v-lead">Send photos for selection. Hand the originals to your editor. Give the finished shoot a delivery worth opening. Keep your public work in a Portfolio with your studio’s name on it.</p><div className="v-actions"><Action to={createTo}>{user ? 'Create a delivery' : 'Start free'}</Action><Action to="/demo?preset=ada" state={{ returnTo: '/product' }} secondary>Open a client demo</Action></div><p className="vp-hero-fine"><Check size={14} />Final delivery on Free. Library, client selection, Editor Links and Portfolio with Pro.</p></Reveal>
    </header>

    <nav className="v-wrap vp-section-nav" aria-label="On this product page"><span>TAKE A CLOSER LOOK<ArrowDown size={13} /></span><div>{productSections.map(([label, id]) => <a href={`#${id}`} key={id}>{label}</a>)}</div></nav>

    <section className="vp-section" id="client-preselection"><div className="v-wrap vp-feature">
      <Reveal className="vp-feature-title"><Eyebrow number="01">Before the edit</Eyebrow><h2>Let your client<br /><em>make their choices.</em></h2><ProLabel /></Reveal>
      <Reveal className="vp-feature-art"><SelectionPreview /></Reveal>
      <Reveal className="vp-feature-after"><p className="v-copy">Send one private link instead of asking for screenshots and file numbers over WhatsApp. Set how many photographs the client can choose. They swipe right to choose, swipe left to skip, then review and send their selection.</p><Notes items={['Marked previews with no download controls', 'Add a six-digit PIN when you need one', 'See chosen photographs and keep earlier submissions']} /><TextLink to={selectionTo}>{user ? 'Open Photo Pre-selection' : 'Start with a Veylo account'}</TextLink></Reveal>
    </div></section>

    <section className="vp-section vp-section-warm" id="editor-handoff"><div className="v-wrap vp-feature vp-feature-reverse">
      <Reveal className="vp-feature-title"><Eyebrow number="02">Work with your editor</Eyebrow><h2>The files they need.<br /><em>A place to return them.</em></h2><ProLabel /></Reveal>
      <Reveal className="vp-feature-art"><EditorPreview /></Reveal>
      <Reveal className="vp-feature-after"><p className="v-copy">Give your editor a password-protected link to the source files. They download the originals and return finished edits to the same link, ready for you to review.</p><Notes items={['Share camera originals and their previews', 'Receive finished JPEG, PNG or WebP photographs', 'Set an expiry or close the link when the work is done']} /><TextLink to={editorTo}>{user ? 'Open Editor Links' : 'Create your studio account'}</TextLink></Reveal>
    </div></section>

    <section className="vp-section" id="image-library"><div className="v-wrap vp-library">
      <Reveal><Eyebrow number="03">Your Photo Library</Eyebrow><h2>Your shoot,<br /><em>kept together.</em></h2><p className="v-copy">Keep camera originals, paired previews and returned edits in your Pro Library. Create folders for each client or session, add search tags and keep internal notes. Accepted edits are saved in a folder for that editor job. Choose a folder or individual finished photographs in the normal delivery setup.</p><TextLink to={libraryTo}>{user ? 'Go to your library' : 'Get started with Veylo'}</TextLink></Reveal>
      <Reveal className="vp-library-panel"><div className="vp-library-capacity"><HardDrive size={26} /><div><strong><StorageAmount plans={plans} /></strong><span>PERSONAL PHOTO LIBRARY / PRO</span></div></div><div className="vp-library-folders">{[[Folder, 'Ada’s birthday portraits', 'A folder for originals from one session.'], [Folder, 'Ada - Accepted edits', 'Accepted editor returns, ready to deliver.'], [Image, 'Not in a folder', 'Photographs you can organise later.']].map(([Icon, title, text]) => <div key={title}><Icon size={20} /><div><strong>{title}</strong><p>{text}</p></div></div>)}</div><p className="vp-library-separate"><ShieldCheck size={17} /><span>Photo delivery hosting is separate. Video originals share your 100 GB.</span></p></Reveal>
    </div></section>

    <section className="vp-section vp-delivery" id="delivery"><div className="v-wrap">
      <Reveal className="vp-section-heading"><div><Eyebrow number="04">The finished photographs</Eyebrow><h2>Choose how<br /><em>they first see the shoot.</em></h2></div><p className="v-copy">Upload the final edits, review the client view, and send the private link. Three delivery types give your photographs different ways to be seen.</p></Reveal>
      <div className="vp-delivery-grid">{[
        ['showcase', 'Showcase', 'A designed first viewing.', 'Open with a presentation, then lead to the complete gallery. Choose from eight Showcase formats.', '/formats', 'Explore Showcase', '/demo', 'Try Photo Story'],
        ['gridboard', 'GridBoard', 'The full gallery, first.', 'Let your client browse the complete board, open individual photos, or play an optional slideshow.', '/gridboard', 'Explore GridBoard', '/demo/gridboard', 'Try GridBoard'],
        ['photoswap', 'Photo Swap', 'One photograph at a time.', 'Swipe through a stack of finished photographs, each with its own caption and permitted likes and downloads.', '/photoswap', 'Explore Photo Swap', '/demo/photoswap', 'Try Photo Swap']
      ].map(([type, title, line, text, to, label, demo, demoLabel], i) => <Reveal className="vp-delivery-card" key={type} delay={i * .05}><DeliveryPreview type={type} /><div className="vp-delivery-card-copy"><span className="vp-small-label">0{i + 1} / {title}</span><h3>{line}</h3><p>{text}</p><TextLink to={to}>{label}</TextLink><Link className="vp-demo-link" to={demo}>{demoLabel}<ArrowUpRight size={14} /></Link></div></Reveal>)}</div>
      <Reveal className="vp-formats"><div><Clapperboard size={18} /><span>INSIDE SHOWCASE</span></div><div>{showcaseFormats.map(([name, to]) => <Link key={name} to={to}>{name}<ArrowUpRight size={12} /></Link>)}</div></Reveal>
    </div></section>

    <section className="vp-section" id="video-delivery"><div className="v-wrap vp-feature"><Reveal className="vp-feature-title"><Eyebrow>Finished films / Pro</Eyebrow><h2>A client link<br /><em>for the films, too.</em></h2><ProLabel /></Reveal><Reveal className="vp-feature-art"><div className="v-video-hero-art"><video src={demoVideoUrl(VIDEO_DEMO_MEDIA.wide)} poster={VIDEO_DEMO_MEDIA.wide.posterUrl} controls controlsList="nodownload" playsInline preload="none" aria-label="Pexels landscape video sample: A celebration, in full view" /><footer><span><strong>A celebration, in full view</strong><small>Pexels sample footage · 4K · no audio</small></span></footer></div></Reveal><Reveal className="vp-feature-after"><p className="v-copy">Send finished films in their own delivery. Your client chooses a video and presses play, with your studio branding above the player.</p><Notes items={['Up to 10 videos, 5 GB per file and three hours each', 'Video originals share your existing 100 GB', 'Private playback, optional PIN and original downloads']} /><p className="v-fine"><VideoAvailability /></p><TextLink to="/video-delivery">Read about video delivery</TextLink><TextLink to="/demo/video">Open the client demo</TextLink></Reveal></div></section>
    <section className="vp-section" id="review"><div className="v-wrap vp-feature">
      <Reveal className="vp-feature-title"><Eyebrow number="05">AI preparation. Your approval.</Eyebrow><h2>Check the words.<br />Set the order.<br /><em>Make it yours.</em></h2></Reveal>
      <Reveal className="vp-feature-art vp-review-preview"><PreviewHeader icon={Clapperboard} title="Before you publish" detail="Photographer review · sample caption" /><div className="vp-review-content"><Photo name="demo-ada-4" alt="Sample portrait being reviewed before client delivery" sizes="(max-width: 767px) 85vw, 45vw" /><div><span className="vp-small-label">ADA / STUDIO PORTRAITS</span><h3>A look over the shoulder.</h3><p>A closer portrait of Ada looking back towards the camera, with the green velvet jacket still in view.</p><span className="vp-review-status"><Eye size={14} />Ready for your review</span></div></div></Reveal>
      <Reveal className="vp-feature-after"><p className="v-copy">Veylo proposes captions, headlines, sequencing and a presentation for the shoot. Read the result, change what needs changing, and check the preview before publishing.</p><Notes items={['Edit the words and reorder the photographs', 'Review typography, colour, motion and available audio options', 'Your original photographs and colour grades stay untouched']} /><TextLink to={createTo}>Prepare a delivery</TextLink></Reveal>
    </div></section>

    <section className="vp-section vp-client" id="client-view"><div className="v-wrap vp-client-grid"><Reveal><Eyebrow number="06">On your client’s phone</Eyebrow><h2>A link they open.<br /><em>Photos they keep.</em></h2><p className="v-copy">Send the published link through WhatsApp, Instagram DM or email. Your client opens it in their browser. No app or Veylo account is needed.</p><TextLink to="/client-experience">See the client experience</TextLink></Reveal><Reveal className="vp-client-details">{[[Image, 'Every finished photograph', 'A complete collection in the delivery type you chose.'], [Download, 'Downloads you control', 'Choose whether individual files and download-all are available.'], [LockKeyhole, 'Access on your terms', 'Add a PIN, set an expiry, or revoke access when needed.'], [Camera, 'Your studio identity', 'Pro deliveries can carry your photographer or studio branding.']].map(([Icon, title, text]) => <div key={title}><Icon size={21} /><div><h3>{title}</h3><p>{text}</p></div></div>)}</Reveal></div></section>

    <section className="vp-section" id="portfolio"><div className="v-wrap vp-feature vp-feature-reverse">
      <Reveal className="vp-feature-title"><Eyebrow number="07">Veylo Portfolio</Eyebrow><h2>Your public work.<br /><em>Your studio’s address.</em></h2><ProLabel /></Reveal>
      <Reveal className="vp-feature-art vp-portfolio-preview"><PreviewHeader title="Kola Studio" detail="veylo.com.ng/@yourstudio · example address" /><div className="vp-portfolio-cover"><Photo name="demo-wedding-1" alt="A sample wedding photograph on a public studio portfolio" sizes="(max-width: 767px) 85vw, 48vw" /><div><span>WEDDINGS / PORTRAITS / LAGOS</span><h3>Photographs<br />with people at heart.</h3></div></div><div className="vp-portfolio-foot"><span>Selected work</span><span>About the studio<ArrowUpRight size={14} /></span></div></Reveal>
      <Reveal className="vp-feature-after"><p className="v-copy">Give potential clients one public place to see your work, learn about your studio and make an enquiry. Choose which photographs belong there and publish when you’re ready.</p><Notes items={['Selected projects, studio details and contact links', 'An enquiry inbox for potential clients', 'Private client deliveries stay separate from public work']} /><TextLink to="/portfolio">Explore Veylo Portfolio</TextLink></Reveal>
    </div></section>

    <section className="vp-section vp-assistant" id="assistant"><div className="v-wrap vp-assistant-inner"><Reveal><span className="vp-assistant-icon"><MessageCircle size={25} /></span><Eyebrow number="08">Veylo Assistant</Eyebrow><h2>A little help<br /><em>with the next step.</em></h2><p className="v-copy">Ask about delivery types, client selection, editor links or your plan. With page context enabled, the Assistant can use your current page and recent steps to give more relevant help.</p></Reveal><Reveal className="vp-assistant-help"><div><Check size={17} /><p>Get guidance, check a delivery, or ask for help with a title or caption.</p></div><div><ShieldCheck size={17} /><p>Inspect or turn off page context. Typed fields, passwords and payment details are excluded.</p></div><button type="button" className="v-button v-button-secondary" onClick={event => window.dispatchEvent(new CustomEvent('veylo:assistant-open', { detail: event.currentTarget }))}><MessageCircle size={17} />Ask Veylo<ArrowUpRight size={17} /></button></Reveal></div></section>

    <section className="vp-section" id="plans"><div className="v-wrap"><Reveal className="vp-section-heading"><div><Eyebrow number="09">Choose your plan</Eyebrow><h2>Try a real delivery.<br /><em>Add Pro when you need it.</em></h2></div><TextLink to="/pricing">See the full plan comparison</TextLink></Reveal><div className="vp-plan-grid"><Reveal className="vp-plan"><span className="vp-small-label">FREE / FINAL CLIENT DELIVERY</span><h3>Start with the finished shoot.</h3><p className="vp-plan-price">₦0<small>/ month</small></p><Notes items={[free?.deliveriesPerMonth ? `${free.deliveriesPerMonth} published deliveries each month` : 'A monthly allowance of published deliveries', free?.photosPerDelivery ? `Up to ${free.photosPerDelivery} photographs per delivery` : 'Photo limits shown on the pricing page', 'Showcase, GridBoard and Photo Swap with Veylo branding']} /><Action to={createTo}>{user ? 'Create a delivery' : 'Start free'}</Action></Reveal><Reveal className="vp-plan is-pro"><span className="vp-small-label"><BadgeCheck size={14} />PRO / YOUR STUDIO’S WORKFLOW</span><h3>From selection to delivery.</h3><p className="vp-plan-price"><ProPrice /><small>/ month</small></p><Notes items={[pro?.deliveriesPerMonth === null ? 'Unlimited deliveries under fair use' : pro?.deliveriesPerMonth ? `${pro.deliveriesPerMonth} published deliveries each month` : 'More room for regular client delivery', 'Client preselection and password-protected Editor Links', 'Personal Photo Library, studio branding and Portfolio', 'Video delivery with private playback and optional original downloads']} /><Action to={user ? '/billing' : '/signup'}>Get started with Pro</Action></Reveal></div></div></section>

    <section className="vp-section vp-questions" id="questions"><div className="v-wrap vp-questions-grid"><Reveal><Eyebrow number="10">Before your first shoot</Eyebrow><h2>A few things<br /><em>you might be wondering.</em></h2></Reveal><Reveal><Questions items={faqs} /></Reveal></div></section>
    <section className="vp-end"><div className="v-wrap"><Reveal><Camera size={25} /><h2>Your next shoot.<br /><em>Ready for its next step.</em></h2><div className="v-actions"><Action to={createTo}>{user ? 'Create a delivery' : 'Create your free account'}</Action><Action to="/demo?preset=ada" state={{ returnTo: '/product' }} secondary>Try the client demo</Action></div></Reveal></div></section>
  </Page>;
}
