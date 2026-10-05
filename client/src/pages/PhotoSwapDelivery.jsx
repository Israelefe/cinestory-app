import React from 'react';
import {
  ArrowDownToLine,
  Check,
  Grid2X2,
  Image,
  Layers3,
  LockKeyhole,
  MoveHorizontal,
  Music2
} from 'lucide-react';
import { Action, Eyebrow, Page, Reveal, TextLink } from '../components/PublicDesign.jsx';
import './PhotoSwapDelivery.css';

const samplePhotos = [
  { src: '/veylo/web/demo-wedding-1-480.webp', alt: 'A couple in traditional wedding attire' },
  { src: '/veylo/web/demo-ada-1-480.webp', alt: 'An editorial portrait in a green jacket' },
  { src: '/veylo/web/demo-lora-1-480.webp', alt: 'A birthday portrait in a green dress' }
];

const features = [
  { icon: MoveHorizontal, label: 'Swipe at their own pace', copy: 'Clients move forward or back whenever they like. No slideshow timer to wait for.' },
  { icon: Layers3, label: 'A real card stack', copy: 'The next photographs peek out behind the current one, with a light response to each drag.' },
  { icon: Image, label: 'Your order stays yours', copy: 'Arrange the finished set before publishing. Photo Swap follows the order you choose.' },
  { icon: Music2, label: 'Music when it fits', copy: 'Add a catalogue track or music you have permission to use. Clients choose when to start it.' },
  { icon: Grid2X2, label: 'The full gallery is close', copy: 'Clients can leave the stack to browse the complete set at any time.' },
  { icon: LockKeyhole, label: 'Access stays in your hands', copy: 'Set a PIN, expiry, and download permissions for the private delivery link.' }
];

export default function PhotoSwapDelivery() {
  return (
    <Page className="v-photoswap-page">
      <header className="v-wrap v-ps-hero">
        <Reveal className="v-ps-hero-copy">
          <Eyebrow>PHOTO SWAP DELIVERY</Eyebrow>
          <h1>One photo.<br /><em>Then the next.</em></h1>
          <p>A full-screen stack of finished photographs your client can swipe through at their own pace.</p>
          <div className="v-actions">
            <Action to="/demo/photoswap">Try the live demo</Action>
            <Action to="/create?type=photoswap" secondary>Create a Photo Swap</Action>
          </div>
          <div className="v-ps-hero-note"><Check size={15} /><span>Send one private link by WhatsApp or Instagram DM.</span></div>
        </Reveal>

        <Reveal className="v-ps-hero-art" delay={0.08} aria-label="Preview of a swipeable Photo Swap stack">
          <div className="v-ps-art-glow" />
          <div className="v-ps-stack-card v-ps-stack-back"><img src={samplePhotos[0].src} alt="" /></div>
          <div className="v-ps-stack-card v-ps-stack-middle"><img src={samplePhotos[1].src} alt="" /></div>
          <div className="v-ps-stack-card v-ps-stack-front">
            <img src={samplePhotos[2].src} alt="" />
            <span className="v-ps-art-count">01 <i>/</i> 08</span>
          </div>
          <div className="v-ps-art-top"><span>PHOTO SWAP</span><span>01 / 08</span></div>
          <div className="v-ps-art-progress"><i /><i /><i /><i /><i /><i /><i /><i /></div>
          <div className="v-ps-art-dock"><span><ArrowDownToLine size={14} /></span><b>01 <i>/</i> 08</b><span><Grid2X2 size={14} /></span></div>
          <p className="v-ps-art-caption">A client view, ready for a thumb.</p>
        </Reveal>
      </header>

      <section className="v-ps-intro-section">
        <div className="v-wrap v-ps-intro-grid">
          <Reveal>
            <Eyebrow number="01">A different first look</Eyebrow>
            <h2>Let each finished photo<br /><em>have its turn.</em></h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p>Some clients want to open every image at once. Others want to take their time with each photograph. Photo Swap gives them a simple, touch-first way to move through the set, while keeping your chosen order intact.</p>
            <TextLink to="/demo/photoswap">See the stack in action</TextLink>
          </Reveal>
        </div>
      </section>

      <section className="v-ps-features-section">
        <div className="v-wrap">
          <Reveal className="v-ps-section-head">
            <Eyebrow number="02">Made for the client’s thumb</Eyebrow>
            <h2>Easy to pick up.<br /><em>Made around the photographs.</em></h2>
            <p>Swipe, tap the arrows, or use the keyboard. The photos remain the main event.</p>
          </Reveal>
          <div className="v-ps-feature-grid">
            {features.map(({ icon: Icon, label, copy }, index) => (
              <Reveal className="v-ps-feature" key={label} delay={Math.min(index * 0.035, 0.16)}>
                <span className="v-ps-feature-icon"><Icon size={18} /></span>
                <h3>{label}</h3>
                <p>{copy}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="v-ps-workflow-section">
        <div className="v-wrap v-ps-workflow">
          <Reveal className="v-ps-workflow-copy">
            <Eyebrow number="03">Your studio sets it up</Eyebrow>
            <h2>Upload. Set the order.<br /><em>Send the link.</em></h2>
            <p>Photo Swap is for finished work. Upload the final photographs, arrange the sequence, choose the background, and set the client’s access before you publish.</p>
            <ol>
              <li><span>01</span><strong>Add the finished set</strong></li>
              <li><span>02</span><strong>Choose the order and style</strong></li>
              <li><span>03</span><strong>Preview and publish</strong></li>
            </ol>
            <Action to="/create?type=photoswap">Create a Photo Swap</Action>
          </Reveal>
          <Reveal className="v-ps-settings-card" delay={0.08}>
            <div className="v-ps-settings-top"><span>PHOTO SWAP SETTINGS</span><strong>Ready to publish</strong></div>
            <div className="v-ps-settings-photo">
              <img src={samplePhotos[2].src} alt="A sample birthday portrait" loading="lazy" />
              <span>01 <i>FIRST PHOTO</i></span>
            </div>
            <div className="v-ps-settings-list">
              <p><Check size={15} /> Your photo order</p>
              <p><Check size={15} /> Background and type</p>
              <p><Check size={15} /> Optional soundtrack</p>
              <p><Check size={15} /> PIN, expiry, and downloads</p>
            </div>
            <footer><span><LockKeyhole size={14} /> PRIVATE CLIENT LINK</span><span>VEYLO</span></footer>
          </Reveal>
        </div>
      </section>

      <section className="v-ps-compare-section">
        <div className="v-wrap v-ps-compare">
          <Reveal><Eyebrow>Choose how the set opens</Eyebrow><h2>Photo Swap is one of<br /><em>three delivery types.</em></h2></Reveal>
          <Reveal className="v-ps-other-types" delay={0.08}>
            <TextLink to="/formats">Compare all delivery types</TextLink>
            <TextLink to="/gridboard">See GridBoard</TextLink>
          </Reveal>
        </div>
      </section>

      <section className="v-ps-final-cta">
        <div className="v-wrap">
          <Reveal>
            <Eyebrow>See it for yourself</Eyebrow>
            <h2>Try a Photo Swap<br /><em>with the sample set.</em></h2>
            <p>Swipe through the live demo, then make one for your next finished shoot.</p>
            <div className="v-actions">
              <Action to="/demo/photoswap">Open the live demo</Action>
              <Action to="/create?type=photoswap" secondary>Create a Photo Swap</Action>
            </div>
          </Reveal>
        </div>
      </section>
    </Page>
  );
}
