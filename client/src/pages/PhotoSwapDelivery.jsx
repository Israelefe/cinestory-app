import React from 'react';
import {
  ArrowDownToLine,
  Check,
  Heart,
  Image,
  LockKeyhole,
  MoveHorizontal,
  Music2,
  Type
} from 'lucide-react';
import { Action, Eyebrow, Page, Reveal, TextLink } from '../components/PublicDesign.jsx';
import './PhotoSwapDelivery.css';

const samplePhotos = [
  { src: '/veylo/web/demo-sharon-1-480.webp', alt: "Sharon's studio portrait against a cobalt backdrop" },
  { src: '/veylo/web/demo-sharon-2-480.webp', alt: "A second portrait from Sharon's session" },
  { src: '/veylo/web/demo-sharon-3-480.webp', alt: "A closer portrait from Sharon's session" },
  { src: '/veylo/web/demo-sharon-4-480.webp', alt: "The final portrait from Sharon's session" }
];

const features = [
  { icon: MoveHorizontal, label: 'Swipe to move on', copy: 'Swipe the card either way. Each gesture brings the next finished photo into view.' },
  { icon: Image, label: 'Your order stays yours', copy: 'Arrange every finished photo before publishing. The client swipes through that order, with the next cards waiting behind.' },
  { icon: Type, label: 'Captions written for each photo', copy: 'Veylo uses the photo and your shoot details to draft a caption. Review or rewrite each one before publishing.' },
  { icon: Music2, label: 'Soundtrack starts on open', copy: 'Add a catalogue track or music you can share. It starts automatically when the browser allows playback.' },
  { icon: Heart, label: 'Likes and individual downloads', copy: 'Clients can like a photo or save that finished image from the card.' },
  { icon: LockKeyhole, label: 'Private link controls', copy: 'Set a PIN or expiry date, and choose whether clients can like or download each photo.' }
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
            <span className="v-ps-art-count">01 <i>/</i> 04</span>
          </div>
          <div className="v-ps-art-top"><span>PHOTO SWAP</span><span>01 / 04</span></div>
          <div className="v-ps-art-progress"><i /><i /><i /><i /></div>
          <div className="v-ps-art-dock"><span><Heart size={14} /></span><b>01 <i>/</i> 04</b><span><ArrowDownToLine size={14} /></span></div>
          <p className="v-ps-art-caption">Sharon’s portraits, one card at a time.</p>
        </Reveal>
      </header>

      <section className="v-ps-intro-section">
        <div className="v-wrap v-ps-intro-grid">
          <Reveal>
            <Eyebrow number="01">A different first look</Eyebrow>
            <h2>Let each finished photo<br /><em>have its turn.</em></h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p>Photo Swap gives your client one finished photograph at a time, with its caption and simple photo actions close by. They swipe through the order you chose.</p>
            <TextLink to="/demo/photoswap">See the stack in action</TextLink>
          </Reveal>
        </div>
      </section>

      <section className="v-ps-features-section">
        <div className="v-wrap">
          <Reveal className="v-ps-section-head">
            <Eyebrow number="02">Made for the client’s thumb</Eyebrow>
            <h2>Easy to pick up.<br /><em>Made around the photographs.</em></h2>
            <p>Swipe the card either way. The photos and their captions stay in front.</p>
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
            <p>Photo Swap is for finished work. Add the final photographs, review their captions, set the order and access, then send your client a private link.</p>
            <ol>
              <li><span>01</span><strong>Add the finished set</strong></li>
              <li><span>02</span><strong>Review each caption</strong></li>
              <li><span>03</span><strong>Choose the order and style</strong></li>
              <li><span>04</span><strong>Preview and publish</strong></li>
            </ol>
            <Action to="/create?type=photoswap">Create a Photo Swap</Action>
          </Reveal>
          <Reveal className="v-ps-settings-card" delay={0.08}>
            <div className="v-ps-settings-top"><span>PHOTO SWAP SETTINGS</span><strong>Ready to publish</strong></div>
            <div className="v-ps-settings-photo">
            <img src={samplePhotos[2].src} alt={samplePhotos[2].alt} loading="lazy" />
              <span>01 <i>FIRST PHOTO</i></span>
            </div>
            <div className="v-ps-settings-list">
              <p><Check size={15} /> Your photo order</p>
              <p><Check size={15} /> Reviewed photo captions</p>
              <p><Check size={15} /> Optional auto-start soundtrack</p>
              <p><Check size={15} /> Individual likes and downloads</p>
              <p><Check size={15} /> PIN and expiry</p>
            </div>
            <footer><span><LockKeyhole size={14} /> PRIVATE CLIENT LINK</span><span>VEYLO</span></footer>
          </Reveal>
        </div>
      </section>

      <section className="v-ps-compare-section">
        <div className="v-wrap v-ps-compare">
          <Reveal><Eyebrow>Choose how the set opens</Eyebrow><h2>A swipe-first way to<br /><em>view every finished photo.</em></h2></Reveal>
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
