import React from 'react';
import { BadgeCheck, Camera, Check, ShieldCheck } from 'lucide-react';
import { Page, Reveal, Plans, Questions, Eyebrow, TextLink, EndNote } from '../components/PublicDesign.jsx';

const priceSummary = [
  [Camera, 'FREE', '₦0 / month', '3 final photo deliveries'],
  [BadgeCheck, 'PRO', '₦25,000 / month', 'Unlimited deliveries under fair use']
];

const comparison = [
  ['Final photo deliveries', '3 each month', 'Unlimited under fair use'],
  ['Delivery formats', 'All six', 'All six'],
  ['Photos in one delivery', 'Up to 100', 'Up to 500'],
  ['Complete gallery and downloads', 'Included', 'Included'],
  ['Veylo Portfolio', '—', 'Included'],
  ['Brand shown to your client', 'Veylo', 'Your studio'],
  ['Personal image storage', '—', '50 GB'],
  ['Delivery hosting', 'Included', 'Included outside your 50 GB']
];

const faqs = [
  { q: 'How does Veylo Free work?', a: 'You can publish three final photo deliveries each month for ₦0. All six formats are included, and Veylo branding remains on the client experience.' },
  { q: 'What counts as one delivery?', a: 'One published client project counts as one delivery, whichever format you choose. The complete downloadable gallery is included in that project.' },
  { q: 'How many photos can I add?', a: 'Free allows up to 100 finished photographs in one delivery. Pro allows up to 500. Veylo uses the photographs you upload and leaves the original files untouched.' },
  { q: 'Do I pay separately for a Photo Story, Album, or another format?', a: 'No. Photo Story, Editorial Page, Photo Reveal, Canvas, Chapters, and Album are included on both plans.' },
  { q: 'What does unlimited under fair use mean?', a: 'Normal client delivery work for one photographer or studio is included. Fair use prevents automated bulk use and unrelated studios sharing one account.' },
  { q: 'How does the 50 GB storage work?', a: 'Pro includes 50 GB for your personal image storage. Photographs hosted inside client deliveries do not reduce that allowance.' },
  { q: 'What changes when I remove Veylo branding?', a: 'Your photographer or studio name leads the published delivery. Veylo branding can be removed from the experience your client receives.' },
  { q: 'Is Veylo Portfolio included?', a: 'Yes. Pro includes a public portfolio made from selected photographs and completed Veylo projects.' },
  { q: 'What happens if I cancel Pro?', a: 'Your Pro access continues until the end of the month you already paid for. Your personal library and portfolio then stay private for 30 days, giving you time to renew, download, or remove your work.' },
  { q: 'What happens when a renewal fails?', a: 'Veylo keeps Pro open for three days. Because Paystack does not retry a failed subscription charge automatically, you may need to complete a new checkout after that grace period.' }
];

export default function PricingPage() {
  return <Page className="v-pricing-page">
    <header className="v-wrap v-pricing-hero">
      <Reveal className="v-pricing-hero-copy">
        <Eyebrow>Pricing / Monthly in Nigerian naira</Eyebrow>
        <h1 className="v-title">Start free.<br /><em>Move to Pro when work gets busy.</em></h1>
        <p className="v-lead">Choose based on how often you deliver and whether your studio needs its own branding, portfolio, and storage. Every creative format is available on both plans.</p>
        <div className="v-pricing-monthly"><span>MONTHLY PRICING</span><strong>No annual plan</strong><small>Free stays free. Pro is ₦25,000 each month.</small></div>
      </Reveal>

      <Reveal className="v-pricing-format-board" delay={.1}>
        <header><div><span>THE SHORT VERSION</span><strong>Pick the plan that matches your delivery volume.</strong></div><BadgeCheck size={22} /></header>
        <div>{priceSummary.map(([Icon, label, price, note], index) => <article key={label}><span>0{index + 1}</span><Icon size={18} /><div><strong>{label} · {price}</strong><small>{note}</small></div><Check size={15} /></article>)}</div>
        <footer><Check size={18} /><p>Monthly billing. No annual commitment.</p></footer>
      </Reveal>
    </header>

    <section className="v-pricing-plans"><div className="v-wrap">
      <Reveal className="v-pricing-section-intro"><Eyebrow number="01">Choose by volume</Eyebrow><h2 className="v-heading">Three deliveries to begin.<br /><em>Unlimited when you need it.</em></h2><p className="v-copy">Free is enough to send real client work and understand how Veylo fits your studio. Pro is for the month when three deliveries are no longer enough.</p></Reveal>
      <Plans />
      <Reveal className="v-pricing-fair-use"><ShieldCheck size={19} /><div><strong>Delivery hosting stays separate from your 50 GB.</strong><p>The 50 GB on Pro is personal image storage. Photographs inside published client deliveries do not use it.</p></div><TextLink to="/fair-use">Read the fair use policy</TextLink></Reveal>
    </div></section>

    <section className="v-section v-pricing-compare"><div className="v-wrap">
      <Reveal className="v-pricing-section-intro"><Eyebrow number="02">Free and Pro</Eyebrow><h2 className="v-heading">What changes when<br /><em>you move to Pro.</em></h2><p className="v-copy">The delivery formats stay the same. Pro removes the monthly delivery limit and gives your studio more control over how clients see your name.</p></Reveal>
      <Reveal className="v-pricing-table" delay={.08}>
        <header><span>Plan detail</span><strong>Free</strong><strong>Pro</strong></header>
        {comparison.map(([label, free, pro]) => <div className="v-pricing-row" key={label}><span>{label}</span><p>{free === 'Included' && <Check size={15} />}{free}</p><p>{pro === 'Included' && <Check size={15} />}{pro}</p></div>)}
        <footer><span>Monthly price</span><strong>₦0</strong><strong>₦25,000</strong></footer>
      </Reveal>
    </div></section>

    <section className="v-section v-pricing-questions"><div className="v-wrap v-spread items-start"><Reveal><Eyebrow number="03">Before you choose</Eyebrow><h2 className="v-heading">Clear answers.<br /><em>No hidden format fees.</em></h2><p className="v-copy">Choose the format that suits the shoot. Your plan does not change the creative options available to you.</p><TextLink to="/formats">Read the delivery formats guide</TextLink></Reveal><Reveal><Questions items={faqs} /></Reveal></div></section>

    <EndNote title="Ready to try Veylo on a real shoot?" accent="Start with the free plan." description="No payment card is needed to create your account and prepare your first delivery." />
  </Page>;
}
