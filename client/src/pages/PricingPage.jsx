import { ProPrice } from '../components/ProPricing.jsx';
import React from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Camera, Check, ShieldCheck } from 'lucide-react';
import { Page, Reveal, Plans, Questions, Eyebrow, TextLink, EndNote } from '../components/PublicDesign.jsx';

const priceSummary = [
  [Camera, 'FREE', '₦0 / month', '3 final photo deliveries'],
  [BadgeCheck, 'PRO', <><ProPrice /> / month</>, 'Unlimited deliveries under fair use']
];

const comparison = [
  ['Final photo deliveries', '3 each month', 'Unlimited under fair use'],
  ['Delivery types', 'Showcase (8 formats) + GridBoard + Photo Swap', 'Showcase (8 formats) + GridBoard + Photo Swap'],
  ['Photos in one delivery', 'Up to 100', 'Up to 500'],
  ['Complete gallery and downloads', 'Included', 'Included'],
  ['Veylo Portfolio', '—', 'Included'],
  ['Brand shown to your client', 'Veylo', 'Your studio'],
  ['Client photo preselection', '—', 'Private selection links'],
  ['Editor handoff', '—', 'Password-protected links'],
  ['Personal image storage', '—', '100 GB'],
  ['Delivery hosting', 'Included', 'Included outside your 100 GB']
];

const faqs = [
  { q: 'How does Veylo Free work?', a: 'You can publish three final photo deliveries each month for ₦0. Photo Swap, GridBoard, and all eight Showcase formats are included, with Veylo branding on the client experience.' },
  { q: 'What counts as one delivery?', a: 'One published client project counts as one delivery, whichever format you choose. The complete downloadable gallery is included in that project.' },
  { q: 'How many photos can I add?', a: 'Free allows up to 100 finished photographs in one delivery. Pro allows up to 500. Veylo uses the photographs you upload and leaves the original files untouched.' },
  { q: 'Do I pay separately for a Photo Story, Album, GridBoard, or Photo Swap?', a: 'No. GridBoard, Photo Swap, and all eight Showcase formats are included on both plans.' },
  { q: 'What does unlimited under fair use mean?', a: 'Normal client delivery work for one photographer or studio is included. Fair use prevents automated bulk use and unrelated studios sharing one account.' },
  { q: 'How do client preselection and editor handoff work?', a: 'With Pro, send a private link so a client can choose the photographs they want edited. Give your editor a password-protected link to download camera originals and upload finished edits. The originals, previews, and returned edits use your 100 GB Image Library.' },
  { q: 'How does the 100 GB Image Library work?', a: 'Pro includes 100 GB for photographs you keep in the Image Library. Camera originals, their paired previews, and returned edits count toward that space. Photos hosted in published client deliveries use separate hosting.' },
  { q: 'What changes when I remove Veylo branding?', a: 'Your photographer or studio name leads the published delivery. Veylo branding can be removed from the experience your client receives.' },
  { q: 'Is Veylo Portfolio included?', a: 'Yes. Pro includes a public portfolio made from selected photographs and completed Veylo projects.' },
  { q: 'What happens if I cancel Pro?', a: 'Your Pro access continues until the end of the month you already paid for. Your personal library and portfolio then stay private for 30 days, giving you time to renew, download, or remove your work.' },
  { q: 'What happens when a renewal fails?', a: 'Veylo keeps Pro open for three days from the failed invoice due date. Because Paystack does not retry a failed subscription charge automatically, you may need to complete a new checkout after that grace period.' }
];

export default function PricingPage() {
  return <Page className="v-pricing-page">
    <header className="v-wrap v-pricing-hero">
      <Reveal className="v-pricing-hero-copy">
        <Eyebrow>Pricing / Monthly in Nigerian naira</Eyebrow>
        <h1 className="v-title">Start free.<br /><em>Move to Pro when work gets busy.</em></h1>
      </Reveal>

      <Reveal className="v-pricing-format-board" delay={.1}>
        <header><div><span>THE SHORT VERSION</span><strong>Pick the plan that matches your delivery volume.</strong></div><BadgeCheck size={22} /></header>
        <div>{priceSummary.map(([Icon, label, price, note], index) => <article key={label}><span>0{index + 1}</span><Icon size={18} /><div><strong>{label} · {price}</strong><small>{note}</small></div><Check size={15} /></article>)}</div>
        <footer><Check size={18} /><p>Monthly billing. No annual commitment.</p></footer>
      </Reveal>
      <Reveal className="v-pricing-hero-copy v-pricing-hero-after">
        <p className="v-lead">Choose based on how often you deliver and whether your studio needs its own branding, portfolio, and storage. Pro also includes private links for client photo selection and password-protected editor handoffs. Photo Swap, GridBoard, and all eight Showcase formats are available on both plans.</p>
        <div className="v-pricing-early-actions"><a href="#pricing-plans">Compare Free and Pro</a><Link to="/signup">Start free</Link></div>
        <div className="v-pricing-monthly"><span>MONTHLY PRICING</span><strong>No annual plan</strong><small>Free stays free. Pro is <ProPrice /> each month.</small></div>
      </Reveal>
    </header>

    <section className="v-pricing-plans" id="pricing-plans"><div className="v-wrap">
      <Reveal className="v-pricing-section-intro"><Eyebrow number="01">Choose by volume</Eyebrow><h2 className="v-heading">Three deliveries to begin.<br /><em>Unlimited when you need it.</em></h2><p className="v-copy">Free is enough to send real client work and understand how Veylo fits your studio. Pro is for the month when three deliveries are no longer enough.</p></Reveal>
      <Plans /><Link className="v-fine" to="/refund-policy">Read the refund policy</Link>
      <Reveal className="v-pricing-fair-use"><ShieldCheck size={19} /><div><strong>Delivery hosting stays separate from your 100 GB.</strong><p>Camera originals, paired previews, and edits returned through editor links use Image Library space. Published client deliveries use separate hosting.</p></div><TextLink to="/fair-use">Read the fair use policy</TextLink></Reveal>
    </div></section>

    <section className="v-section v-pricing-compare"><div className="v-wrap">
      <Reveal className="v-pricing-section-intro"><Eyebrow number="02">Free and Pro</Eyebrow><h2 className="v-heading">What changes when<br /><em>you move to Pro.</em></h2><p className="v-copy">Photo Swap, GridBoard, and the eight Showcase formats are on both plans. Pro adds more delivery room, your studio branding, a 100 GB Image Library, and private links for client selections and editor handoffs.</p></Reveal>
      <Reveal className="v-pricing-table" delay={.08}>
        <header><span>Plan detail</span><strong>Free</strong><strong>Pro</strong></header>
        {comparison.map(([label, free, pro]) => <div className="v-pricing-row" key={label}><span>{label}</span><p>{free === 'Included' && <Check size={15} />}{free}</p><p>{pro === 'Included' && <Check size={15} />}{pro}</p></div>)}
        <footer><span>Monthly price</span><strong>₦0</strong><strong><ProPrice /></strong></footer>
      </Reveal>
    </div></section>

    <section className="v-section v-pricing-questions"><div className="v-wrap v-spread items-start"><Reveal><Eyebrow number="03">Before you choose</Eyebrow><h2 className="v-heading">Clear answers.<br /><em>No hidden format fees.</em></h2><p className="v-copy">Choose the format that suits the shoot. Your plan does not change the creative options available to you.</p><TextLink to="/formats">Read the delivery formats guide</TextLink></Reveal><Reveal><Questions items={faqs} /></Reveal></div></section>

    <EndNote title="Ready to try Veylo on a real shoot?" accent="Start with the free plan." description="No payment card is needed to create your account and prepare your first delivery." />
  </Page>;
}
