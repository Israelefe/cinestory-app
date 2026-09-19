import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  Camera,
  Check,
  Clapperboard,
  Images,
  Layers3,
  MessageCircle,
  MousePointer2,
  Send,
  Smartphone
} from 'lucide-react';
import DeliveryFormatVisual from '../components/DeliveryFormatVisual.jsx';
import { Action, EndNote, Eyebrow, Page, Photo, Reveal, TextLink } from '../components/PublicDesign.jsx';

const sharedFlowIcons = [Camera, Clapperboard, Check, Send];

const pages = {
  'portrait-photographers': {
    theme: 'portrait',
    label: 'For portrait photographers',
    title: 'The portraits are ready.',
    accent: 'Make the first look personal.',
    copy: 'Your client has waited to see the finished retouching. Give them a private first viewing that feels considered from the opening screen to the full gallery.',
    heroPhoto: 'portrait-marvis',
    heroAlt: 'A finished studio portrait of a woman seated against a painted backdrop',
    heroNote: 'One private link · Ready for WhatsApp',
    recommendation: {
      name: 'Photo Reveal',
      verb: 'Let them take their time',
      heading: 'Each tap brings them to the next finished portrait.',
      copy: 'Veylo decides the reveal order, which portraits deserve the full screen, and which images belong together. Your client controls the pace, so every reaction has room to happen.',
      demo: '/demo/reveal',
      demoLabel: 'Begin Sharon’s Photo Reveal',
      format: {
        id: 'photo-reveal',
        photos: ['niche-camera'],
        revealCount: '01 / 04',
        photoAlt: 'A smiling woman holding a camera during a portrait session'
      }
    },
    caseEyebrow: 'A portrait client’s first viewing',
    caseHeading: 'Sharon has never seen the finished retouching.',
    caseIntro: 'That first reaction only happens once. Photo Reveal gives each portrait its own moment and lets Sharon decide when she is ready for the next one.',
    flow: [
      ['The message arrives', 'Sharon sees her name and the studio she already knows. She does not have to register or request access.'],
      ['One portrait opens', 'The strongest opening photograph appears by itself, before a grid can turn it into another thumbnail.'],
      ['She controls the pace', 'A tap reveals the next portrait. She can stop, look properly, and continue when she is ready.'],
      ['The whole set follows', 'After the final reveal, all of Sharon’s finished portraits are ready to browse and download.']
    ],
    quote: 'I have been waiting to see these.',
    collectionHeading: 'One portrait session can arrive differently.',
    collectionCopy: 'A beauty client may want a slow first reveal. A personal brand shoot may work better as an Editorial Page. The delivery should follow the work in front of you.',
    gallery: [
      ['portrait-ghana', 'Clean studio portrait'],
      ['portrait-reaching', 'Expressive personal portrait'],
      ['portrait-striking', 'Close beauty portrait']
    ],
    otherFormats: [
      ['Editorial Page', 'For fashion, beauty, and personal branding that should read like a feature.', '/demo/editorial', BookOpen],
      ['Canvas', 'For multi-look sessions where the client should explore expressions freely.', '/demo/canvas', Images],
      ['Photo Story', 'For maternity, graduation, and portraits with a personal story.', '/demo?preset=lora', Clapperboard]
    ],
    optionsHeading: 'Not every portrait session should open the same way.',
    optionsAccent: 'Choose around the person in front of you.',
    optionsCopy: 'Use Reveal when the first reaction matters. Choose another format when styling, movement, or a longer personal story should lead.',
    shootTypes: ['Studio portraits and beauty sessions', 'Graduation and maternity portraits', 'Personal branding and corporate headshots', 'Fashion and multi-look sessions'],
    closing: 'Your client is ready to see themselves.',
    closingAccent: 'Make that first look count.'
  },
  'wedding-studios': {
    theme: 'wedding',
    label: 'For wedding studios',
    title: 'A whole wedding day.',
    accent: 'Easy to enter. Hard to forget.',
    copy: 'Preparation, ceremony, portraits, family, and celebration should not arrive as one endless grid. Give the couple a clear, beautiful way into every part of their day.',
    heroPhoto: 'demo-wedding-4',
    heroAlt: 'Folake and Tunde together in traditional wedding attire',
    heroNote: 'Complete wedding · Organised by the moments inside it',
    recommendation: {
      name: 'Chapters',
      verb: 'Give the day a clear shape',
      heading: 'Let the couple choose where they want to begin.',
      copy: 'Veylo studies the complete collection and finds the natural parts of the day. Each chapter gets its own cover and presentation, while every finished photograph remains together in the full gallery.',
      demo: '/demo/chapters',
      demoLabel: 'Open Folake & Tunde’s Chapters',
      format: {
        id: 'chapters',
        photos: ['demo-wedding-1', 'demo-wedding-2', 'demo-wedding-5'],
        chapterNames: ['The Arrival', 'Just Us', 'The Celebration'],
        chapterLines: [
          'The greetings, details, and first moments that opened the day.',
          'A quiet place for the portraits of the two of you.',
          'Everyone was ready when the music started.'
        ]
      }
    },
    caseEyebrow: 'A wedding collection with a clear shape',
    caseHeading: '148 photographs. Four parts of the day they already remember.',
    caseIntro: 'Folake and Tunde should not have to search an endless grid for the ceremony, their portraits, or the dancing. Chapters gives each part of the wedding a clear entrance.',
    flow: [
      ['Getting ready', 'The clothes, details, and quiet minutes before everyone arrived open the collection.'],
      ['The ceremony', 'The vows, family, and moments people travelled to witness stay together.'],
      ['Just us', 'Their couple portraits have room away from the pace and crowd of the day.'],
      ['The celebration', 'Entrances, dancing, and the people who filled the room close the wedding on the right energy.']
    ],
    quote: 'Let us start with the two of us.',
    collectionHeading: 'Hundreds of photographs. No folder maze.',
    collectionCopy: 'A large wedding collection can still feel calm. Veylo organises it around the day the couple remembers, while your final files stay exactly as you delivered them.',
    gallery: [
      ['demo-wedding-2', 'The couple'],
      ['demo-wedding-3', 'The celebration'],
      ['demo-wedding-5', 'The closing portrait']
    ],
    otherFormats: [
      ['Photo Story', 'For a directed first viewing that carries the emotion of the day.', '/demo?preset=wedding', Clapperboard],
      ['Album', 'For a page-by-page keepsake the couple can return to together.', '/demo/album', BookOpen],
      ['Canvas', 'For exploring people, details, and moments through visual clusters.', '/demo/canvas', Images]
    ],
    optionsHeading: 'One wedding can be remembered in different ways.',
    optionsAccent: 'Choose what the couple needs first.',
    optionsCopy: 'Chapters makes a large collection easier to enter. Story, Album, and Canvas offer different ways to return to the same finished work.',
    shootTypes: ['Traditional weddings and introductions', 'White weddings and receptions', 'Pre-wedding sessions and bridal showers', 'Owambe celebrations and family events'],
    closing: 'They trusted you with the whole day.',
    closingAccent: 'Deliver all of it with care.'
  },
  'birthday-shoots': {
    theme: 'birthday',
    label: 'For birthday photographers',
    title: 'They planned every look.',
    accent: 'Make the delivery feel like them.',
    copy: 'The outfits, mood, and details were chosen for this birthday. The finished photographs deserve an opening that feels just as personal as the session.',
    heroPhoto: 'niche-blue',
    heroAlt: 'An expressive birthday portrait in a bright blue suit and glasses',
    heroNote: 'Birthday portraits · Made for this client',
    recommendation: {
      name: 'Photo Story',
      verb: 'Turn the session into their story',
      heading: 'Begin with their energy. Build towards the portrait they will remember.',
      copy: 'Veylo uses the photographer’s description and the finished photographs to plan the order, captions, colour, typography, movement, transitions, pacing, music, opening, and finale. You approve every choice.',
      demo: '/demo?preset=lora',
      demoLabel: 'Watch Lora’s Photo Story',
      format: {
        id: 'photo-story',
        photos: ['portrait-striking'],
        photoAlt: 'A smiling woman in a birthday portrait',
        storyEyebrow: 'YOUR DAY, YOUR LOOK',
        storyCaption: 'Lora, you walked into this session ready for thirty, and every frame showed it.'
      }
    },
    caseEyebrow: 'Lora’s 30th birthday session',
    caseHeading: 'Two looks. One birthday. A delivery that sounds like her.',
    caseIntro: 'Lora’s session moves from quiet confidence to the smile everyone knows. The story should follow that change and speak to her as a person, not describe a generic birthday shoot.',
    flow: [
      ['Open with confidence', 'The first portrait introduces Lora at thirty without rushing straight into a gallery.'],
      ['Let the details speak', 'The cake, styling, and expressions shape the captions and the way the story moves.'],
      ['Change with the mood', 'As the session becomes lighter, the pacing and movement can loosen with it.'],
      ['Save her smile for the end', 'The finale lands on the frame that feels most like Lora, then opens the full birthday gallery.']
    ],
    quote: 'This feels like my birthday.',
    collectionHeading: 'Their age is not the whole story.',
    collectionCopy: 'A good birthday delivery should notice the confidence, humour, outfits, and little details that made the session personal. It should sound like it was made for one person.',
    gallery: [
      ['portrait-shay', 'The confident look'],
      ['portrait-espresso', 'The quieter frame'],
      ['portrait-casual', 'The relaxed close']
    ],
    otherFormats: [
      ['Photo Reveal', 'For building anticipation one finished portrait at a time.', '/demo/reveal', MousePointer2],
      ['Editorial Page', 'For a fashion-led birthday shoot with strong styling.', '/demo/editorial', BookOpen],
      ['Album', 'For a milestone keepsake the client can turn through later.', '/demo/album', Images]
    ],
    optionsHeading: 'The age does not choose the format.',
    optionsAccent: 'The person and the pictures do.',
    optionsCopy: 'A lively birthday may suit a Story. A fashion-led set may read better as Editorial, while a quiet portrait session may deserve a Reveal.',
    shootTypes: ['30th, 40th, and 50th birthday portraits', 'Children’s and family birthday sessions', 'Outdoor birthday shoots', 'Multi-outfit studio sessions'],
    closing: 'The birthday photographs are finished.',
    closingAccent: 'Send something made for them.'
  },
  'media-companies': {
    theme: 'commercial',
    label: 'For commercial and media teams',
    title: 'The campaign is approved.',
    accent: 'Present it like finished work.',
    copy: 'A campaign, lookbook, or brand shoot should not lose its direction inside a download folder. Give clients and collaborators a clear presentation of the approved photographs.',
    heroPhoto: 'audience-commercial',
    heroAlt: 'A woman in a green suit presenting a campaign portfolio beside a display table',
    heroNote: 'Approved campaign · Presentation and files in one link',
    recommendation: {
      name: 'Editorial Page',
      verb: 'Publish the visual direction',
      heading: 'Let the campaign read like the work your team set out to make.',
      copy: 'Veylo builds a scrollable editorial around the finished photographs. Image scale, type, colour, spacing, and movement follow the campaign instead of forcing every production into the same layout.',
      demo: '/demo/editorial',
      demoLabel: 'Explore Ada’s Editorial Page',
      format: {
        id: 'editorial-page',
        photos: ['portrait-brand', 'portrait-motion'],
        photoAlt: 'A polished personal brand portrait in an editorial layout',
        detailAlt: 'An expressive campaign portrait',
        editorialMast: 'THE CAMPAIGN EDIT',
        editorialIssue: '01',
        editorialTag: 'APPROVED SERIES',
        editorialTitle: <>Brief.<br />Image.<br /><em>Final.</em></>
      }
    },
    caseEyebrow: 'The approved campaign handover',
    caseHeading: 'The final set has to make sense beyond the creative team.',
    caseIntro: 'The client, marketing lead, and publishing partner may all open the same delivery. An Editorial Page keeps the campaign’s visual direction clear before anyone reaches the files.',
    flow: [
      ['The lead image sets the brief', 'The strongest campaign frame and title establish what was approved before the rest of the set appears.'],
      ['The series keeps its hierarchy', 'Hero portraits, supporting frames, and details do not all arrive with the same visual weight.'],
      ['Stakeholders follow the work', 'The scroll gives collaborators a clear path through the campaign without needing a separate presentation deck.'],
      ['The approved files stay together', 'When the review is done, the complete final set is ready to browse and download from the same place.']
    ],
    quote: 'The presentation still feels like the campaign.',
    collectionHeading: 'Keep the brief visible in the final handover.',
    collectionCopy: 'The delivery can carry the same restraint, colour, and hierarchy as the campaign itself. Stakeholders see the thinking before they reach the files.',
    gallery: [
      ['portrait-red', 'Campaign portrait'],
      ['portrait-green', 'Colour-led series'],
      ['portrait-fashion', 'Editorial look']
    ],
    otherFormats: [
      ['Canvas', 'For seeing relationships across a campaign or lookbook.', '/demo/canvas', Images],
      ['Chapters', 'For a production with several products, locations, or teams.', '/demo/chapters', Layers3],
      ['Photo Reveal', 'For a controlled first review with clients and stakeholders.', '/demo/reveal', MousePointer2]
    ],
    optionsHeading: 'The brief should decide the handover.',
    optionsAccent: 'Different productions need different rooms.',
    optionsCopy: 'Editorial suits a campaign with a strong visual system. Canvas, Chapters, or Reveal may fit better when relationships, production groups, or a controlled review matter most.',
    shootTypes: ['Fashion campaigns and lookbooks', 'Personal branding and founder portraits', 'Corporate events and conferences', 'Product launches and editorial commissions'],
    closing: 'The final set carries your name.',
    closingAccent: 'Make the handover feel complete.'
  }
};

function HeroArtwork({ item }) {
  const reduced = useReducedMotion();
  return (
    <Reveal className="v-niche-hero-art" delay={0.06}>
      <span className="v-niche-hero-word" aria-hidden="true">{item.recommendation.name}</span>
      <motion.figure
        className="v-niche-hero-frame"
        initial={reduced ? false : { clipPath: 'inset(9% 0 0 0)', y: 22 }}
        animate={{ clipPath: 'inset(0% 0 0 0)', y: 0 }}
        transition={{ duration: reduced ? 0 : 1, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          className="v-niche-hero-photo-motion"
          animate={reduced ? undefined : { scale: [1.02, 1.065], y: ['0%', '-1.4%'] }}
          transition={reduced ? undefined : { duration: 9, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
        >
          <Photo name={item.heroPhoto} alt={item.heroAlt} eager sizes="(max-width: 767px) 100vw, 48vw" />
        </motion.div>
      </motion.figure>
      <div className="v-niche-hero-note">
        <span><Check size={14} aria-hidden="true" /></span>
        <div><small>READY TO DELIVER</small><strong>{item.heroNote}</strong></div>
      </div>
      <div className="v-niche-hero-formats" aria-label="All Veylo delivery formats">
        <span>STORY</span><span>EDITORIAL</span><span>REVEAL</span><span>CANVAS</span><span>CHAPTERS</span><span>ALBUM</span>
      </div>
    </Reveal>
  );
}

function RecommendedFormat({ item, slug }) {
  const reverse = item.theme === 'wedding' || item.theme === 'commercial';
  const returnTo = `/for/${slug}#recommended`;
  const openDemo = () => window.history.replaceState(window.history.state, '', returnTo);
  return (
    <section id="recommended" className="v-niche-recommended">
      <div className={`v-wrap v-niche-recommended-grid${reverse ? ' is-reverse' : ''}`}>
        <Reveal className="v-niche-format-copy">
          <Eyebrow>Best first choice · {item.recommendation.name}</Eyebrow>
          <p className="v-niche-format-verb">{item.recommendation.verb}</p>
          <h2>{item.recommendation.heading}</h2>
          <p>{item.recommendation.copy}</p>
          <Action
            to={item.recommendation.demo}
            state={{ from: 'niche', sectionId: 'recommended', returnTo }}
            onClick={openDemo}
            className="v-niche-format-desktop-action"
          >
            {item.recommendation.demoLabel}
          </Action>
        </Reveal>
        <Reveal className="v-niche-format-art" delay={0.08}>
          <DeliveryFormatVisual format={item.recommendation.format} />
        </Reveal>
        <Action
          to={item.recommendation.demo}
          state={{ from: 'niche', sectionId: 'recommended', returnTo }}
          onClick={openDemo}
          className="v-niche-format-mobile-action"
        >
          {item.recommendation.demoLabel}
        </Action>
      </div>
    </section>
  );
}

function DeliveryFlow({ item }) {
  return (
    <section className="v-section v-niche-flow">
      <div className="v-wrap">
        <Reveal className="v-niche-section-head">
          <div><Eyebrow>{item.caseEyebrow}</Eyebrow><h2 className="v-heading">{item.caseHeading}</h2></div>
          <p className="v-copy">{item.caseIntro}</p>
        </Reveal>
        <div className="v-niche-flow-grid">
          {item.flow.map(([title, copy], index) => {
            const Icon = sharedFlowIcons[index];
            return <Reveal className="v-niche-flow-step" key={title} delay={index * 0.045}>
              <div><Icon size={18} aria-hidden="true" /><span>0{index + 1}</span></div>
              <h3>{title}</h3>
              <p>{copy}</p>
              {index < item.flow.length - 1 && <ArrowRight className="v-niche-flow-arrow" size={17} aria-hidden="true" />}
            </Reveal>;
          })}
        </div>
        <Reveal className="v-niche-client-quote">
          <MessageCircle size={18} aria-hidden="true" />
          <div><small>WHAT THE CLIENT SHOULD FEEL</small><blockquote>“{item.quote}”</blockquote></div>
          <Smartphone size={20} aria-hidden="true" />
        </Reveal>
      </div>
    </section>
  );
}

function CollectionSection({ item }) {
  return (
    <section className="v-section v-niche-collection">
      <div className="v-wrap">
        <Reveal className="v-niche-collection-intro">
          <Eyebrow>Made for the work you already shoot</Eyebrow>
          <h2>{item.collectionHeading}</h2>
          <p>{item.collectionCopy}</p>
        </Reveal>
        <div className="v-niche-photo-triptych">
          {item.gallery.map(([photo, label], index) => <Reveal key={photo} className={`v-niche-gallery-photo is-${index + 1}`} delay={index * 0.06}>
            <figure><Photo name={photo} alt={label} sizes="(max-width: 640px) 92vw, (max-width: 1024px) 48vw, 34vw" /></figure>
            <div><span>0{index + 1}</span><p>{label}</p></div>
          </Reveal>)}
        </div>
        <Reveal className="v-niche-shoot-list">
          <p>COMMON SHOOTS</p>
          <div>{item.shootTypes.map((shoot, index) => <span key={shoot}><i>0{index + 1}</i>{shoot}</span>)}</div>
        </Reveal>
      </div>
    </section>
  );
}

function OtherFormats({ item }) {
  return (
    <section className="v-section v-niche-options">
      <div className="v-wrap">
        <Reveal className="v-niche-options-head">
          <div><Eyebrow>Other ways to present this work</Eyebrow><h2 className="v-heading">{item.optionsHeading}<br /><em>{item.optionsAccent}</em></h2></div>
          <p className="v-copy">{item.optionsCopy}</p>
        </Reveal>
        <div className="v-niche-option-grid">
          {item.otherFormats.map(([name, copy, to, Icon], index) => <Reveal className="v-niche-option-card" key={name} delay={index * 0.055}>
            <div><Icon size={20} aria-hidden="true" /><span>0{index + 1}</span></div>
            <h3>{name}</h3>
            <p>{copy}</p>
            <Link to={to} className="v-niche-option-link"><span>Open the live demo</span><ArrowRight size={16} aria-hidden="true" /></Link>
          </Reveal>)}
        </div>
        <Reveal className="v-niche-all-formats"><TextLink to="/formats">Compare all eight delivery formats</TextLink></Reveal>
      </div>
    </section>
  );
}

export default function NichePage() {
  const { slug } = useParams();
  const resolved = ['commercial-agencies', 'commercial-and-agencies'].includes(slug) ? 'media-companies' : slug;
  const item = pages[resolved];
  if (!item) return <Navigate to="/not-found" replace />;

  return (
    <Page className={`v-niche-page is-${item.theme}`}>
      <header className="v-niche-hero">
        <div className="v-wrap v-niche-hero-grid">
          <Reveal className="v-niche-hero-copy">
            <Eyebrow>{item.label}</Eyebrow>
            <h1>{item.title}<br /><em>{item.accent}</em></h1>
            <p>{item.copy}</p>
            <div className="v-actions">
              <Action to="#recommended">See the best format for this work</Action>
              <Action to="/signup" secondary>Get started</Action>
            </div>
          </Reveal>
          <HeroArtwork item={item} />
        </div>
      </header>
      <RecommendedFormat item={item} slug={resolved} />
      <DeliveryFlow item={item} />
      <CollectionSection item={item} />
      <OtherFormats item={item} />
      <EndNote title={item.closing} accent={item.closingAccent} />
    </Page>
  );
}

