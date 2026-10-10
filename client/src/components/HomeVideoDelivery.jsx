import React from 'react';
import { Film, LockKeyhole, Download, BadgeCheck } from 'lucide-react';
import { Action, Eyebrow, Reveal, TextLink } from './PublicDesign.jsx';
import './HomeVideoDelivery.css';

export default function HomeVideoDelivery() {
  return <div className="v-wrap hv-layout">
    <Reveal className="hv-heading">
      <Eyebrow><Film size={15} />Video delivery / Pro</Eyebrow>
      <h2 className="v-heading">Your finished films.<br /><em>Your studio’s name.</em></h2>
    </Reveal>

    <Reveal className="hv-player" delay={.08}>
      <div className="hv-player-header"><span><Film size={18} /><strong>VEYLO MEDIA</strong></span><small>CLIENT PLAYER / DEMO</small></div>
      <video
        src="/veylo/video/light-study.mp4"
        poster="/veylo/video/light-study.webp"
        controls
        playsInline
        preload="none"
        aria-label="Video delivery preview: A study in light"
      />
      <div className="hv-player-caption"><div><span>SAMPLE FILM</span><h3>A study in light</h3><p>An original Veylo animation. Press play to try the player.</p></div><span className="hv-film-length">00:10</span></div>
      <div className="hv-player-access"><span><LockKeyhole size={14} />Private client link</span><span><Download size={14} />You control downloads</span></div>
    </Reveal>

    <Reveal className="hv-copy" delay={.12}>
      <p className="v-copy">Send the wedding film, highlights and vertical edits in one private video link. Your client chooses a film, presses play and hears its original audio, with your studio’s name above the player.</p>
      <dl className="hv-limits"><div><dt>Up to 10</dt><dd>films per delivery</dd></div><div><dt>5 GB</dt><dd>per finished film</dd></div><div><dt>100 GB</dt><dd>shared Pro storage</dd></div></dl>
      <p className="hv-plan"><BadgeCheck size={17} />Included with Veylo Pro</p>
      <div className="hv-actions"><Action to="/video-delivery">Explore video delivery</Action><TextLink to="/demo/video">Open the client demo</TextLink></div>
      <p className="hv-note">Films get their own delivery. Your photos keep their own gallery.</p>
    </Reveal>
  </div>;
}
