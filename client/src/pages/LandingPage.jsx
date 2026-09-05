import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  Download,
  Folder,
  Image as ImageIcon,
  Layers,
  Lock,
  Mic2,
  Music2,
  Pause,
  Play,
  Share2,
  ShieldCheck,
  Sliders,
  Smartphone,
  Sparkles,
  Type,
  Volume2,
  WandSparkles,
  Zap
} from 'lucide-react';

const storyFrames = [
  { image: '/veylo/pv-red-phone.jpeg', chapter: 'THE ARRIVAL', line: 'Thirty enters the room before she says a word.' },
  { image: '/veylo/pv-espresso.jpeg', chapter: 'AFTER HOURS', line: 'She built this version of herself in rooms no one applauded.' },
  { image: '/veylo/pv-white-suit.jpeg', chapter: 'OWN TERMS', line: 'Soft voice. Clear boundaries. A life with her name on it.' },
  { image: '/veylo/pv-motion.jpeg', chapter: 'UNREHEARSED', line: 'The best part was the laugh that came after the pose.' },
  { image: '/veylo/pv-luxury.jpeg', chapter: 'THE YEAR AHEAD', line: 'No shrinking. No asking. No waiting for permission.' },
  { image: '/veylo/pv-hero.jpeg', chapter: 'THIRTY', line: 'Here. Whole. And only just beginning.' }
];

const themes = [
  {
    name: 'Luxury Editorial',
    fit: 'Portraits · Birthdays · Fashion',
    image: '/veylo/pv-luxury.jpeg',
    color: '#ff5a47',
    desc: 'High-contrast typography, velvet dark aesthetics, and haute couture pacing.'
  },
  {
    name: 'Romantic Grace',
    fit: 'Weddings · Maternity · Love',
    image: '/veylo/pv-soft.jpeg',
    color: '#f3a89e',
    desc: 'Soft warm light, gentle transitions, and heartfelt emotional narration.'
  },
  {
    name: 'Celebration Energy',
    fit: 'Milestones · Graduations · Events',
    image: '/veylo/pv-hero.jpeg',
    color: '#f0a33a',
    desc: 'Dynamic pacing, energetic soundtrack synchronization, and bold celebratory chaptering.'
  }
];

const portfolioImages = [
  { src: '/veylo/pv-red-phone.jpeg', label: 'Fashion' },
  { src: '/veylo/pv-bnw.jpeg', label: 'Editorial' },
  { src: '/veylo/pv-green-portrait.jpeg', label: 'Portrait' },
  { src: '/veylo/pv-motion.jpeg', label: 'Lifestyle' },
  { src: '/veylo/pv-soft.jpeg', label: 'Beauty' },
  { src: '/veylo/pv-white-suit.jpeg', label: 'Branding' },
  { src: '/veylo/pv-reaching.jpeg', label: 'Editorial' },
  { src: '/veylo/pv-luxury.jpeg', label: 'Celebration' },
  { src: '/veylo/pv-casual.jpeg', label: 'Portrait' },
  { src: '/veylo/pv-editorial.jpeg', label: 'Fashion' },
  { src: '/veylo/pv-playful-scale.jpeg', label: 'Conceptual' },
  { src: '/veylo/pv-hero.jpeg', label: 'Birthday' },
  { src: '/veylo/pv-photographer.jpeg', label: 'Creator' },
  { src: '/veylo/pv-brand.jpeg', label: 'Personal brand' },
  { src: '/veylo/pv-espresso.jpeg', label: 'Editorial' },
  { src: '/veylo/pv-male-portrait.jpeg', label: 'Portrait' },
  { src: '/veylo/pv-shay.jpeg', label: 'Fashion' },
  { src: '/veylo/pv-striking.jpeg', label: 'Beauty' },
  { src: '/veylo/pv-marvis.jpeg', label: 'Portrait' },
  { src: '/veylo/pv-ghana.jpeg', label: 'Studio' },
  { src: '/veylo/pv-white-fashion.jpeg', label: 'Lifestyle' }
];

const aiDirectorFeatures = [
  {
    icon: WandSparkles,
    title: 'Crowns the Best Opening Photo',
    text: 'Identifies the single most captivating frame to hook the client before they scroll. First impressions decide how the work is felt.'
  },
  {
    icon: Layers,
    title: 'Intelligent Photo Sequencing',
    text: 'Sequences photos by narrative cadence, visual emotion, and energy—never by arbitrary camera timestamps or file numbers.'
  },
  {
    icon: Type,
    title: 'Editorial Storytelling',
    text: 'Crafts bespoke, magazine-grade chapter titles and narrative lines that honor the milestone without cheese or generic clichés.'
  },
  {
    icon: Music2,
    title: 'Music Timing & Pacing',
    text: 'Synchronizes photo transitions and subtle Ken Burns movement to the heartbeat of hand-picked cinema soundtracks.'
  },
  {
    icon: Mic2,
    title: 'Optional Voice Narration (TTS)',
    text: 'Choose between pure music + typography or warm spoken narration written using your client and occasion notes.'
  },
  {
    icon: Sliders,
    title: 'You Remain in Full Creative Control',
    text: 'Veylo directs the draft in seconds. You have 1-click control to reorder photos, edit captions, swap soundtracks, or change themes.'
  }
];

const faqs = [
  {
    q: 'Who pays for Veylo?',
    a: 'The photographer or media studio pays for the platform. Your clients receive their Photo Story and gallery 100% free with no login or app installation required.'
  },
  {
    q: 'How does the Free plan work?',
    a: 'You get 2 full Photo Stories every single month for ₦0. It includes the AI Director, music, sequencing, and the full client download gallery so you can test it on real client sessions before upgrading.'
  },
  {
    q: 'What does "Unlimited under fair use" mean?',
    a: 'Normal photographer usage is completely unlimited. Shoot 10, 30, or 60 sessions a month for your clients—it is all covered. Fair use simply protects against automated bot abuse, scraping, or multiple unrelated studios sharing a single account.'
  },
  {
    q: 'Do clients need to install an app or create an account?',
    a: 'Never. Veylo stories open instantly in any mobile or desktop browser (Safari, Chrome, etc.). It is optimized for direct WhatsApp and Instagram delivery.'
  },
  {
    q: 'Can clients still download their high-resolution photos?',
    a: 'Yes, absolutely. Veylo puts an experience before the gallery—not instead of it. Right after the cinematic premiere, the client enters "Your Photos", where they can browse full-screen, download individual photos, or tap "Download All" for the entire high-res package.'
  },
  {
    q: 'Does Veylo alter, retouch, or compress my photos?',
    a: 'No. Veylo does not generate fake pixels, retouch faces, or alter your color grade. Your finished photographs are honored and presented in crisp, pristine resolution.'
  }
];

const reveal = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } }
};

export default function LandingPage({ onOpenAuth }) {
  const previewRef = useRef(null);
  const [activeFrame, setActiveFrame] = useState(0);
  const [storyStatus, setStoryStatus] = useState('cover');
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeWorkflowTab, setActiveWorkflowTab] = useState('photographer');
  const [openFaq, setOpenFaq] = useState(null);

  useEffect(() => {
    if (storyStatus !== 'playing' || !isPlaying) return undefined;
    const timer = window.setTimeout(() => {
      if (activeFrame === storyFrames.length - 1) {
        setStoryStatus('ending');
        setIsPlaying(false);
        return;
      }
      setActiveFrame((frame) => frame + 1);
    }, 4600);
    return () => window.clearTimeout(timer);
  }, [activeFrame, isPlaying, storyStatus]);

  const startStory = () => {
    setActiveFrame(0);
    setStoryStatus('playing');
    setIsPlaying(true);
    previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className='min-h-screen overflow-hidden bg-[#09090b] text-white selection:bg-[#ff5a47] selection:text-white'>
      {/* ─── HERO SECTION ─── */}
      <section className='relative min-h-[100svh] px-5 pb-16 pt-32 sm:px-8 lg:pt-36'>
        <div className='absolute left-[-15%] top-[-20%] h-[650px] w-[650px] rounded-full bg-[#ff5a47]/15 blur-[150px]' />
        <div className='absolute right-[-10%] top-[10%] h-[500px] w-[500px] rounded-full bg-[#ff9b8e]/10 blur-[140px]' />

        <div className='relative mx-auto grid min-h-[calc(100svh-11rem)] max-w-7xl items-center gap-14 lg:grid-cols-[.96fr_1.04fr]'>
          <motion.div
            initial='hidden'
            animate='show'
            variants={{ show: { transition: { staggerChildren: 0.12 } } }}
            className='relative z-10 max-w-2xl'>
            <motion.div
              variants={reveal}
              className='mb-6 inline-flex items-center gap-2.5 rounded-full border border-[#ff5a47]/30 bg-[#ff5a47]/10 px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-[.22em] text-[#ff9b8e]'>
              <span className='h-2 w-2 rounded-full bg-[#ff5a47] shadow-[0_0_12px_#ff5a47]' />
              The Photo Delivery Platform for Photographers
            </motion.div>

            <motion.h1
              variants={reveal}
              className='font-display text-[clamp(3.2rem,6.8vw,7rem)] font-extrabold leading-[.92] tracking-[-.055em]'>
              Don't just deliver photos.
              <span className='mt-2 block text-transparent bg-clip-text bg-gradient-to-r from-[#ff7b69] via-[#ff5a47] to-[#ff9b8e]'>
                Premiere them.
              </span>
            </motion.h1>

            <p className='mt-7 max-w-xl text-base leading-7 text-zinc-300 sm:text-lg'>
              Transform completed photoshoots into cinematic, interactive Photo Stories your clients can experience,
              share and download. Built for photographers and media studios who want final delivery to feel as premium as the photography itself.
            </p>

            <div className='mt-9 flex flex-col gap-3 sm:flex-row'>
              <Link
                to='/create'
                className='group inline-flex items-center justify-center gap-4 rounded-2xl bg-[#ff5a47] px-7 py-4 text-sm font-extrabold shadow-[0_18px_50px_rgba(255,90,71,.28)] transition hover:-translate-y-0.5 hover:bg-[#ff7564]'>
                Create Your First Photo Story <ArrowRight size={17} className='transition-transform group-hover:translate-x-1' />
              </Link>
              <a
                href='#how-it-works'
                className='inline-flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[.04] px-6 py-4 text-sm font-bold text-zinc-200 transition hover:bg-white/[.08]'>
                See How It Works
              </a>
            </div>

            <div className='mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs font-medium text-zinc-400'>
              <span className='flex items-center gap-2'>
                <Check size={14} className='text-[#ff6b57]' /> 2 Photo Stories free / month
              </span>
              <span className='flex items-center gap-2'>
                <Check size={14} className='text-[#ff6b57]' /> Opens in any browser (WhatsApp-ready)
              </span>
              <span className='flex items-center gap-2'>
                <Check size={14} className='text-[#ff6b57]' /> Full gallery + downloads at the end
              </span>
            </div>
          </motion.div>

          {/* ─── INTERACTIVE PHONE PREVIEW ─── */}
          <motion.div
            ref={previewRef}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.25, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className='relative mx-auto w-full max-w-[580px] lg:mr-0'>
            <div className='absolute -left-5 top-10 h-[78%] w-[46%] rotate-[-8deg] overflow-hidden rounded-[2rem] border border-white/10 opacity-40 shadow-2xl sm:-left-8'>
              <img src='/veylo/pv-editorial.jpeg' alt='' className='h-full w-full object-cover' />
            </div>
            <div className='absolute -right-2 bottom-12 h-[68%] w-[40%] rotate-[7deg] overflow-hidden rounded-[2rem] border border-white/10 opacity-50 shadow-2xl sm:-right-6'>
              <img src='/veylo/pv-motion.jpeg' alt='' className='h-full w-full object-cover' />
            </div>

            <div className='relative mx-auto aspect-[9/16] w-[70%] overflow-hidden rounded-[2.6rem] border border-white/15 bg-zinc-950 p-2 shadow-[0_40px_100px_rgba(0,0,0,.75)]'>
              <div className='relative h-full overflow-hidden rounded-[2.1rem] bg-black'>
                <AnimatePresence mode='wait'>
                  {storyStatus === 'cover' && (
                    <motion.div
                      key='cover'
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className='absolute inset-0'>
                      <img
                        src='/veylo/pv-red-phone.jpeg'
                        alt='Ada at 30 Photo Story cover'
                        className='absolute inset-0 h-full w-full object-cover'
                      />
                      <div className='absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,.2),rgba(15,7,9,.2)_35%,rgba(0,0,0,.92))]' />
                      <div className='absolute inset-x-0 top-[16%] flex flex-col items-center px-6 text-center'>
                        <img src='/veylo/veylo-mark.svg' alt='' className='h-12 w-12 rounded-2xl shadow-xl' />
                        <span className='mt-4 rounded-full border border-white/25 bg-black/35 px-4 py-1.5 text-[8px] font-black uppercase tracking-[.22em] backdrop-blur-xl'>
                          A Veylo Photo Story
                        </span>
                      </div>
                      <div className='absolute inset-x-0 bottom-0 px-6 pb-7 text-center sm:px-8 sm:pb-9'>
                        <p className='font-serif text-4xl font-semibold sm:text-5xl'>Ada at 30</p>
                        <p className='mt-2 text-xs font-semibold text-white/75'>Birthday Portrait Premiere</p>
                        <div className='mt-3 flex items-center justify-center gap-2'>
                          <span className='inline-flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1 text-[9px] font-bold text-white/80'>
                            <Music2 size={10} className='text-[#ff7b69]' /> Cinematic Score
                          </span>
                          <span className='inline-flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1 text-[9px] font-bold text-white/80'>
                            <Mic2 size={10} className='text-[#ff7b69]' /> Voice Narration
                          </span>
                        </div>
                        <button
                          onClick={startStory}
                          className='mt-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#ff5a47] px-5 py-4 text-xs font-extrabold shadow-[0_14px_40px_rgba(255,90,71,.35)]'>
                          <Play size={14} fill='currentColor' /> Watch Ada's Premiere
                        </button>
                        <p className='mt-3 text-[8px] font-bold uppercase tracking-[.18em] text-white/45'>
                          Tap to premiere
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {storyStatus === 'playing' && (
                    <motion.div
                      key={`frame-${activeFrame}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.65 }}
                      className='absolute inset-0'>
                      <motion.img
                        src={storyFrames[activeFrame].image}
                        alt='Veylo Photo Story preview'
                        initial={{ scale: 1.02 }}
                        animate={{ scale: activeFrame % 2 === 0 ? 1.11 : 1.07, x: activeFrame % 2 === 0 ? 0 : -6 }}
                        transition={{ duration: 6, ease: 'linear' }}
                        className='absolute inset-0 h-full w-full object-cover'
                      />
                      <div className='absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/55' />
                      <div className='absolute inset-x-0 bottom-0 p-4 sm:p-5'>
                        <motion.div
                          initial={{ opacity: 0, y: 18 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.25 }}
                          className='rounded-[1.3rem] border border-[#ff7b69]/25 bg-black/80 p-4 text-left backdrop-blur-xl sm:p-5'>
                          <div className='flex items-center justify-between'>
                            <p className='inline-flex rounded-md border border-[#ff7b69]/30 px-2 py-0.5 text-[8px] font-black uppercase tracking-[.16em] text-[#ff9b8e]'>
                              {storyFrames[activeFrame].chapter}
                            </p>
                            <span className='text-[8px] font-bold uppercase tracking-[.16em] text-white/50'>
                              Frame {activeFrame + 1} of {storyFrames.length}
                            </span>
                          </div>
                          <p className='mt-3 text-sm font-semibold leading-5 text-white sm:text-base sm:leading-6'>
                            {storyFrames[activeFrame].line}
                          </p>
                        </motion.div>
                      </div>
                    </motion.div>
                  )}

                  {storyStatus === 'ending' && (
                    <motion.div
                      key='ending'
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className='absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_top,#57211f_0%,#190e10_45%,#050505_100%)] px-6 text-center'>
                      <div className='relative mb-8 h-28 w-40'>
                        {['/veylo/pv-white-suit.jpeg', '/veylo/pv-red-phone.jpeg', '/veylo/pv-motion.jpeg'].map(
                          (image, index) => (
                            <img
                              key={image}
                              src={image}
                              alt=''
                              className={`absolute left-1/2 top-1/2 h-24 w-16 rounded-xl border-2 object-cover shadow-2xl ${
                                index === 0
                                  ? '-translate-x-[125%] -translate-y-1/2 -rotate-12 border-white/20'
                                  : index === 1
                                  ? 'z-10 -translate-x-1/2 -translate-y-1/2 border-[#ff7b69]'
                                  : 'translate-x-[25%] -translate-y-1/2 rotate-12 border-white/20'
                              }`}
                            />
                          )
                        )}
                      </div>
                      <p className='text-[8px] font-black uppercase tracking-[.18em] text-[#ff9b8e]'>
                        The Experience Ends · The Gallery Begins
                      </p>
                      <p className='mt-3 font-serif text-3xl font-semibold'>Your Photos Are Ready</p>
                      <p className='mt-3 max-w-[260px] text-[11px] leading-5 text-white/60'>
                        Browse all 48 finished photographs, view full-screen, or download in high resolution.
                      </p>
                      <div className='mt-6 w-full space-y-2.5'>
                        <button className='flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff5a47] px-4 py-3 text-[10px] font-extrabold'>
                          <ImageIcon size={13} /> View full photo gallery
                        </button>
                        <button className='flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-[10px] font-extrabold'>
                          <Download size={13} /> Download all (High-Res)
                        </button>
                        <button className='flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-[10px] font-extrabold'>
                          <Share2 size={13} /> Share Photo Story
                        </button>
                      </div>
                      <button
                        onClick={startStory}
                        className='mt-4 text-[8px] font-black uppercase tracking-[.18em] text-white/40 hover:text-white'>
                        Replay premiere
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {storyStatus === 'playing' && (
                  <div className='absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/80 to-transparent px-4 pb-8 pt-4'>
                    <div className='flex gap-1'>
                      {storyFrames.map((_, index) => (
                        <button
                          key={index}
                          onClick={() => {
                            setActiveFrame(index);
                            setIsPlaying(true);
                          }}
                          aria-label={`Show story frame ${index + 1}`}
                          className='h-[3px] flex-1 overflow-hidden rounded-full bg-white/25'>
                          <span
                            className={`block h-full bg-white transition-all duration-500 ${
                              index <= activeFrame ? 'w-full' : 'w-0'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                    <div className='mt-3 flex items-center justify-between'>
                      <div className='flex items-center gap-2.5 text-left'>
                        <img src='/veylo/veylo-mark.svg' alt='' className='h-7 w-7 rounded-lg' />
                        <div>
                          <p className='text-[10px] font-extrabold leading-none'>Ada</p>
                          <p className='mt-1 text-[8px] font-medium text-white/60'>Birthday Premiere</p>
                        </div>
                      </div>
                      <div className='flex items-center gap-1.5'>
                        <span className='grid h-7 w-7 place-items-center rounded-full bg-black/40 text-white/80'>
                          <Volume2 size={11} />
                        </span>
                        <button
                          onClick={() => setIsPlaying(!isPlaying)}
                          className='grid h-7 w-7 place-items-center rounded-full bg-black/40 text-white'
                          aria-label={isPlaying ? 'Pause preview' : 'Play preview'}>
                          {isPlaying ? <Pause size={11} /> : <Play size={11} fill='currentColor' />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── TICKER / VALUE PILLARS ─── */}
      <section className='border-y border-white/10 bg-[#0c0c10] px-5 py-7 sm:px-8'>
        <div className='mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-4 text-center text-[11px] font-extrabold uppercase tracking-[.22em] text-zinc-400 md:justify-between'>
          <span>✦ Photos Stay Photos</span>
          <span>✦ Veylo AI Director</span>
          <span>✦ Editorial Storytelling</span>
          <span>✦ Music & Narration</span>
          <span>✦ Gallery + High-Res Downloads</span>
        </div>
      </section>

      {/* ─── THE TRANSFORMATION: BEFORE VS AFTER (VIRAL HOOK) ─── */}
      <section className='px-5 py-28 sm:px-8 lg:py-36'>
        <div className='mx-auto max-w-7xl'>
          <div className='grid gap-8 lg:grid-cols-2 lg:items-end'>
            <div>
              <p className='mb-4 text-xs font-extrabold uppercase tracking-[.24em] text-[#ff6b57]'>
                The Client Reaction Is Your Brand
              </p>
              <h2 className='font-display text-[clamp(2.8rem,5.5vw,5.5rem)] font-extrabold leading-[.92] tracking-[-.055em]'>
                Photographers still delivering shoots like this?
              </h2>
            </div>
            <p className='max-w-lg text-lg leading-8 text-zinc-400 lg:pb-2'>
              After weeks of planning, directing, lighting, and meticulous retouching, the way your photographs arrive
              either flattens the work—or creates a client for life.
            </p>
          </div>

          <div className='mt-16 grid gap-6 lg:grid-cols-2'>
            {/* The Cold Delivery */}
            <div className='relative flex flex-col justify-between rounded-[2.2rem] border border-white/10 bg-zinc-950 p-8 sm:p-11'>
              <div>
                <div className='flex items-center justify-between text-xs font-black uppercase tracking-[.18em] text-zinc-500'>
                  <span>THE OLD WAY</span>
                  <span className='rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-400'>
                    184 RAW / JPG FILES
                  </span>
                </div>

                <div className='mt-14 inline-flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-zinc-900 text-zinc-500'>
                  <Folder size={44} strokeWidth={1.2} />
                </div>

                <h3 className='mt-8 font-display text-2xl font-bold text-zinc-300 sm:text-3xl'>
                  “Hi, here is your Google Drive link.”
                </h3>
                <p className='mt-4 text-sm leading-6 text-zinc-400'>
                  Opened on a phone. Pinched, zoomed, scrolled in silence. Downloaded frantically. Closed. Zero emotional
                  crescendo. Your art ends in a spreadsheet of filenames.
                </p>
              </div>

              <div className='mt-10 rounded-2xl border border-white/5 bg-black/40 p-4 text-xs font-mono text-zinc-500'>
                <p className='truncate'>drive.google.com/drive/folders/7xK9... · 184 items · 4.8 GB</p>
              </div>
            </div>

            {/* The Veylo Premiere */}
            <div className='relative flex flex-col justify-between overflow-hidden rounded-[2.2rem] border border-[#ff5a47]/40 bg-[#ff5a47]/[.06] p-8 sm:p-11'>
              <div className='absolute -right-16 -top-16 h-80 w-80 rounded-full bg-[#ff5a47]/20 blur-[100px]' />

              <div className='relative z-10'>
                <div className='flex items-center justify-between text-xs font-black uppercase tracking-[.18em] text-[#ff9b8e]'>
                  <span className='flex items-center gap-1.5'>
                    <Sparkles size={14} className='text-[#ff5a47]' /> THE VEYLO PREMIERE
                  </span>
                  <span className='rounded-full border border-[#ff5a47]/30 bg-[#ff5a47]/15 px-3 py-1 font-bold text-[#ff9b8e]'>
                    EXPERIENCE FIRST
                  </span>
                </div>

                <p className='mt-12 font-serif text-3xl font-semibold leading-tight sm:text-5xl'>
                  Her name. Her soundtrack. Her photographs, revealed one moment at a time.
                </p>

                <p className='mt-6 text-sm leading-7 text-zinc-300'>
                  Music begins. Editorial chapter lines appear. Subtle motion brings each portrait alive. Then, the full
                  gallery unlocks for high-resolution individual and bulk downloads.
                </p>
              </div>

              <div className='relative z-10 mt-10 rounded-2xl border border-[#ff5a47]/30 bg-black/60 p-4 text-xs font-medium text-[#ff9b8e] backdrop-blur-xl'>
                <div className='flex items-center justify-between'>
                  <span className='font-mono font-bold'>veylo.com.ng/s/ada-at-30</span>
                  <span className='text-[10px] font-black uppercase tracking-wider text-white/80'>Ready to send via WhatsApp</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── VEYLO AI DIRECTOR: THE BIG CONCEPT ─── */}
      <section id='ai-director' className='border-y border-white/10 bg-[#0c0c10] px-5 py-28 sm:px-8 lg:py-36'>
        <div className='mx-auto max-w-7xl'>
          <div className='mx-auto max-w-3xl text-center'>
            <div className='inline-flex items-center gap-2 rounded-full border border-[#ff5a47]/30 bg-[#ff5a47]/10 px-4 py-1.5 text-xs font-extrabold uppercase tracking-[.22em] text-[#ff9b8e]'>
              <WandSparkles size={14} /> The Veylo AI Director
            </div>
            <h2 className='mt-6 font-display text-[clamp(2.6rem,5vw,5.2rem)] font-extrabold leading-[.94] tracking-[-.05em]'>
              Veylo directs the delivery.
            </h2>
            <p className='mt-6 text-base leading-7 text-zinc-400 sm:text-lg'>
              Instead of presenting Veylo as just “captions + a gallery + music”, we built an AI Director.
              It understands the emotional arc of your shoot, chooses the strongest hook, and stages the premiere automatically.
            </p>
          </div>

          <div className='mt-16 grid gap-5 md:grid-cols-2 lg:grid-cols-3'>
            {aiDirectorFeatures.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className='group relative rounded-[2rem] border border-white/10 bg-white/[.02] p-8 transition duration-300 hover:border-[#ff5a47]/40 hover:bg-white/[.04]'>
                  <div className='flex items-center justify-between'>
                    <div className='grid h-12 w-12 place-items-center rounded-2xl bg-[#ff5a47]/10 text-[#ff7b69] transition group-hover:scale-110 group-hover:bg-[#ff5a47]/20'>
                      <Icon size={22} />
                    </div>
                    <span className='text-xs font-mono font-bold text-zinc-600'>0{index + 1}</span>
                  </div>
                  <h3 className='mt-8 text-xl font-extrabold text-white'>{feature.title}</h3>
                  <p className='mt-3 text-sm leading-6 text-zinc-400'>{feature.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── THE TWO SIDES OF VEYLO: STUDIO FLOW VS CLIENT PREMIERE ─── */}
      <section id='how-it-works' className='px-5 py-28 sm:px-8 lg:py-36'>
        <div className='mx-auto max-w-7xl'>
          <div className='mx-auto max-w-2xl text-center'>
            <p className='text-xs font-extrabold uppercase tracking-[.24em] text-[#ff6b57]'>End-To-End Experience</p>
            <h2 className='mt-4 font-display text-5xl font-extrabold leading-[.95] tracking-[-.05em] sm:text-6xl'>
              Built for the studio.<br />
              <span className='text-zinc-500'>Felt by the client.</span>
            </h2>
            <div className='mt-8 flex justify-center'>
              <div className='inline-flex rounded-2xl border border-white/15 bg-white/5 p-1.5 backdrop-blur-xl'>
                <button
                  onClick={() => setActiveWorkflowTab('photographer')}
                  className={`rounded-xl px-5 py-2.5 text-xs font-extrabold transition ${
                    activeWorkflowTab === 'photographer'
                      ? 'bg-[#ff5a47] text-white shadow-lg shadow-[#ff5a47]/25'
                      : 'text-zinc-400 hover:text-white'
                  }`}>
                  Photographer Workflow (3 Mins)
                </button>
                <button
                  onClick={() => setActiveWorkflowTab('client')}
                  className={`rounded-xl px-5 py-2.5 text-xs font-extrabold transition ${
                    activeWorkflowTab === 'client'
                      ? 'bg-[#ff5a47] text-white shadow-lg shadow-[#ff5a47]/25'
                      : 'text-zinc-400 hover:text-white'
                  }`}>
                  Client Premiere & Gallery
                </button>
              </div>
            </div>
          </div>

          <div className='mt-16'>
            {activeWorkflowTab === 'photographer' ? (
              <div className='grid gap-5 md:grid-cols-3'>
                {[
                  {
                    step: '01',
                    title: 'Enter Shoot Details',
                    subtitle: 'Client: Ada · Occasion: Birthday · Mood: Luxury',
                    desc: 'Add quick shoot notes. Veylo uses the context to write poetic chapter headlines and emotional narrative lines.'
                  },
                  {
                    step: '02',
                    title: 'Upload Finished Work',
                    subtitle: 'Your selected & retouched photos',
                    desc: 'The AI Director analyzes visual harmony, selects the opening hook, sequences the flow, and pairs the soundtrack.'
                  },
                  {
                    step: '03',
                    title: 'Publish & WhatsApp Link',
                    subtitle: 'veylo.com.ng/s/ada-at-30',
                    desc: 'Preview the story, make any quick adjustments, click publish, and send one branded premiere link directly to your client.'
                  }
                ].map((item) => (
                  <div
                    key={item.step}
                    className='rounded-[2rem] border border-white/10 bg-[#111115] p-8 transition hover:border-white/20'>
                    <span className='text-xs font-mono font-bold text-[#ff6b57]'>{item.step}</span>
                    <h3 className='mt-6 text-2xl font-extrabold text-white'>{item.title}</h3>
                    <p className='mt-2 text-xs font-bold uppercase tracking-wider text-[#ff9b8e]'>{item.subtitle}</p>
                    <p className='mt-4 text-sm leading-6 text-zinc-400'>{item.desc}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className='grid gap-5 md:grid-cols-3'>
                {[
                  {
                    step: '01',
                    title: 'The Cinematic Cover',
                    subtitle: 'Opens instantly in any mobile browser',
                    desc: 'Client taps the link on WhatsApp. Ambient music begins. Their name and occasion appear in bespoke editorial typography.'
                  },
                  {
                    step: '02',
                    title: 'Storytelling Premiere',
                    subtitle: 'Motion, chapters & optional narration',
                    desc: 'Each photo glides with gentle Ken Burns motion. Heartfelt editorial captions appear at emotional moments with optional voice narration.'
                  },
                  {
                    step: '03',
                    title: 'Your Photos Gallery',
                    subtitle: 'Full-screen view + 1-click downloads',
                    desc: 'After the emotional finale, the complete gallery unfolds. Clients browse, view full-screen, download individual favorites, or download all in high-res.'
                  }
                ].map((item) => (
                  <div
                    key={item.step}
                    className='rounded-[2rem] border border-white/10 bg-[#111115] p-8 transition hover:border-white/20'>
                    <span className='text-xs font-mono font-bold text-[#ff6b57]'>{item.step}</span>
                    <h3 className='mt-6 text-2xl font-extrabold text-white'>{item.title}</h3>
                    <p className='mt-2 text-xs font-bold uppercase tracking-wider text-[#ff9b8e]'>{item.subtitle}</p>
                    <p className='mt-4 text-sm leading-6 text-zinc-400'>{item.desc}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─── MOVING REEL: VISUAL RICHNESS ─── */}
      <section className='overflow-hidden border-y border-white/10 bg-[#0c0c10] py-24'>
        <div className='mx-auto mb-12 max-w-7xl px-5 sm:px-8'>
          <p className='text-xs font-extrabold uppercase tracking-[.24em] text-[#ff6b57]'>
            Every Shoot Has Its Own Pulse
          </p>
          <div className='mt-4 grid gap-6 lg:grid-cols-[1fr_420px] lg:items-end'>
            <h2 className='font-display text-4xl font-extrabold leading-[.94] tracking-[-.05em] sm:text-6xl'>
              Veylo doesn't force every story to feel the same.
            </h2>
            <p className='text-base leading-7 text-zinc-400'>
              A quiet portrait needs room to breathe. A 30th birthday needs lift. A fashion lookbook needs nerve. The AI
              Director follows the photographs.
            </p>
          </div>
        </div>

        {[portfolioImages.slice(0, 11), portfolioImages.slice(11)].map((row, rowIndex) => (
          <div key={rowIndex} className={rowIndex === 0 ? 'mb-4 flex' : 'flex'}>
            <motion.div
              className='flex shrink-0 gap-4 px-2'
              animate={{ x: rowIndex === 0 ? ['0%', '-50%'] : ['-50%', '0%'] }}
              transition={{ duration: rowIndex === 0 ? 54 : 46, repeat: Infinity, ease: 'linear' }}>
              {[...row, ...row].map((image, index) => (
                <div
                  key={`${image.src}-${index}`}
                  className='group relative h-[300px] w-[220px] shrink-0 overflow-hidden rounded-[1.5rem] border border-white/10 sm:h-[380px] sm:w-[280px]'>
                  <img
                    src={image.src}
                    alt=''
                    loading='lazy'
                    className='h-full w-full object-cover transition duration-700 group-hover:scale-105'
                  />
                  <div className='absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-75' />
                  <span className='absolute bottom-4 left-4 text-[9px] font-extrabold uppercase tracking-[.2em] text-white/80'>
                    {image.label}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>
        ))}
      </section>

      {/* ─── PHILOSOPHY: YOUR PHOTOS STAY YOUR PHOTOS ─── */}
      <section className='px-5 py-28 sm:px-8 lg:py-36'>
        <div className='relative mx-auto min-h-[700px] max-w-7xl overflow-hidden rounded-[2.5rem] border border-white/10'>
          <img
            src='/veylo/pv-photographer.jpeg'
            alt='Photographer at work'
            className='absolute inset-0 h-full w-full object-cover object-center'
          />
          <div className='absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent lg:bg-gradient-to-r lg:from-black lg:via-black/60 lg:to-transparent' />
          <div className='relative z-10 flex min-h-[700px] max-w-2xl flex-col justify-end p-8 sm:p-14 lg:justify-center lg:p-16'>
            <div className='inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.24em] text-[#ff9b8e]'>
              <Camera size={15} /> Your Art Stays Untouched
            </div>
            <h2 className='mt-5 font-display text-4xl font-extrabold leading-[.94] tracking-[-.05em] sm:text-6xl'>
              You craft the photographs.<br />
              <span className='text-[#ff9b8e]'>Veylo premieres them.</span>
            </h2>
            <p className='mt-6 text-base leading-7 text-zinc-300'>
              Veylo does not generate synthetic pixels, crop your compositions, or modify your color grading.
              We don't build bloated CRMs, invoicing tools, or website builders.
            </p>
            <p className='mt-3 text-base leading-7 text-zinc-300 font-semibold'>
              Veylo does ONE thing: turns finished photoshoots into unforgettable client experiences.
            </p>
            <div className='mt-8 flex flex-wrap gap-4'>
              <div className='rounded-xl border border-white/15 bg-black/50 px-4 py-2 text-xs font-bold text-white backdrop-blur-md'>
                ✓ No AI face altering
              </div>
              <div className='rounded-xl border border-white/15 bg-black/50 px-4 py-2 text-xs font-bold text-white backdrop-blur-md'>
                ✓ Original color grading preserved
              </div>
              <div className='rounded-xl border border-white/15 bg-black/50 px-4 py-2 text-xs font-bold text-white backdrop-blur-md'>
                ✓ Pristine high-resolution files
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── SOUND & VOICE: TYPOGRAPHY OR VOICE NARRATION ─── */}
      <section className='border-y border-white/10 bg-[#0c0c10] px-5 py-28 sm:px-8 lg:py-36'>
        <div className='mx-auto max-w-7xl'>
          <div className='mb-14 grid gap-6 lg:grid-cols-[1fr_420px] lg:items-end'>
            <div>
              <p className='text-xs font-extrabold uppercase tracking-[.24em] text-[#ff6b57]'>Sound & Storytelling</p>
              <h2 className='mt-4 font-display text-5xl font-extrabold leading-[.92] tracking-[-.055em] sm:text-6xl'>
                Words that know when to speak.
              </h2>
            </div>
            <p className='text-base leading-7 text-zinc-400'>
              Keep it minimalist with music + typography, or let Veylo voice the story out loud. The photographer chooses.
            </p>
          </div>

          <div className='grid gap-6 md:grid-cols-2'>
            <div className='rounded-[2.2rem] border border-white/10 bg-[#111115] p-8 sm:p-10'>
              <div className='grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-[#ff6b57]'>
                <Type size={24} />
              </div>
              <h3 className='mt-8 text-2xl font-extrabold text-white'>Mode A: Music + Typography</h3>
              <p className='mt-4 text-sm leading-6 text-zinc-400'>
                Sleek editorial typography appears at key frames over an ambient cinema score. Subtle, understated, and
                sophisticated—perfect for high-fashion lookbooks and quiet personal portraits.
              </p>
              <div className='mt-8 rounded-xl border border-white/10 bg-black/40 p-4 text-xs italic text-zinc-300'>
                “Thirty enters the room before she says a word.”
              </div>
            </div>

            <div className='rounded-[2.2rem] border border-[#ff5a47]/30 bg-[#ff5a47]/[.05] p-8 sm:p-10'>
              <div className='grid h-12 w-12 place-items-center rounded-2xl bg-[#ff5a47]/15 text-[#ff7b69]'>
                <Mic2 size={24} />
              </div>
              <h3 className='mt-8 text-2xl font-extrabold text-white'>Mode B: Music + Voice Narration (TTS)</h3>
              <p className='mt-4 text-sm leading-6 text-zinc-300'>
                Veylo automatically crafts and speaks a warm voiceover that narrates the client's milestone. A feature
                built for viral TikTok and Instagram client reactions.
              </p>
              <div className='mt-8 rounded-xl border border-[#ff5a47]/30 bg-black/60 p-4 text-xs font-semibold text-[#ff9b8e]'>
                ✦ Spoken aloud: “She built this version of herself in rooms no one applauded...”
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── THEMES SHOWCASE ─── */}
      <section id='themes' className='px-5 py-28 sm:px-8 lg:py-36'>
        <div className='mx-auto max-w-7xl'>
          <div className='flex flex-col justify-between gap-6 md:flex-row md:items-end'>
            <div>
              <p className='text-xs font-extrabold uppercase tracking-[.24em] text-[#ff6b57]'>Start With The Feeling</p>
              <h2 className='mt-4 font-display text-5xl font-extrabold tracking-[-.05em] sm:text-6xl'>
                Cinematic themes.<br />
                <span className='text-zinc-500'>Zero blank canvas.</span>
              </h2>
            </div>
            <p className='max-w-sm text-sm leading-6 text-zinc-400'>
              Enough aesthetic variety to match any shoot. Fast enough to publish in minutes without needing design skills.
            </p>
          </div>

          <div className='mt-14 grid gap-6 md:grid-cols-3'>
            {themes.map((theme) => (
              <Link
                to='/create'
                key={theme.name}
                className='group relative aspect-[4/5] overflow-hidden rounded-[2.2rem] border border-white/10 transition duration-500 hover:border-white/30'>
                <img
                  src={theme.image}
                  alt=''
                  loading='lazy'
                  className='h-full w-full object-cover transition duration-700 group-hover:scale-105'
                />
                <div className='absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent' />
                <div className='absolute inset-x-0 bottom-0 p-7'>
                  <span className='mb-3 block h-1 w-10 rounded-full' style={{ backgroundColor: theme.color }} />
                  <h3 className='text-2xl font-extrabold text-white'>{theme.name}</h3>
                  <p className='mt-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#ff9b8e]'>{theme.fit}</p>
                  <p className='mt-2 text-xs leading-5 text-zinc-300 opacity-85'>{theme.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PRICING: FREE VS PRO (NO CREDITS, JUST SIMPLE DELIVERY) ─── */}
      <section id='pricing' className='border-y border-white/10 bg-[#0c0c10] px-5 py-28 sm:px-8 lg:py-36'>
        <div className='mx-auto max-w-7xl'>
          <div className='mx-auto max-w-3xl text-center'>
            <p className='text-xs font-extrabold uppercase tracking-[.24em] text-[#ff6b57]'>Transparent Pricing</p>
            <h2 className='mt-4 font-display text-5xl font-extrabold leading-[.94] tracking-[-.055em] sm:text-7xl'>
              No credits. No token math.<br />
              <span className='text-transparent bg-clip-text bg-gradient-to-r from-[#ff7b69] via-[#ff5a47] to-[#ff9b8e]'>
                Just unlimited delivery.
              </span>
            </h2>
            <p className='mt-6 text-base leading-7 text-zinc-400 sm:text-lg'>
              No wondering if you have “15 tokens remaining.” Pay once a month and run your photography deliveries with total peace of mind.
            </p>
          </div>

          <div className='mt-16 grid gap-8 md:mx-auto md:max-w-5xl md:grid-cols-2 lg:gap-10'>
            {/* ─── TIER 1: VEYLO FREE ─── */}
            <div className='relative flex flex-col justify-between rounded-[2.5rem] border border-white/15 bg-[#111115] p-8 sm:p-12'>
              <div>
                <div className='flex items-center justify-between'>
                  <span className='text-xs font-black uppercase tracking-[.2em] text-zinc-400'>Veylo Free</span>
                  <span className='rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold text-zinc-400'>
                    TEST DRIVE
                  </span>
                </div>

                <div className='mt-6 flex items-baseline gap-2'>
                  <span className='text-5xl font-extrabold tracking-[-.05em] text-white'>₦0</span>
                  <span className='text-sm font-bold text-zinc-500'>/ month</span>
                </div>

                <p className='mt-4 text-sm font-semibold text-zinc-300'>
                  Give real value so you can genuinely experience Veylo with real clients.
                </p>

                <div className='mt-8 space-y-3.5 border-t border-white/10 pt-8 text-sm'>
                  {[
                    '2 Photo Stories every month',
                    'Veylo AI Director & photo sequencing',
                    'Cinematic presentation & subtle motion',
                    'Curated soundtrack library',
                    'AI-written editorial storytelling',
                    'Basic TTS voice narration',
                    'Complete client photo gallery',
                    'Individual & bulk photo downloads',
                    'Shareable link (WhatsApp-ready)',
                    'Standard processing priority',
                    'Veylo watermark branding'
                  ].map((feat) => (
                    <div key={feat} className='flex items-start gap-3 text-zinc-300'>
                      <Check size={16} className='mt-0.5 shrink-0 text-[#ff6b57]' />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className='mt-10'>
                <Link
                  to='/create'
                  className='flex w-full items-center justify-center gap-3 rounded-2xl border border-white/20 bg-white/5 py-4 text-sm font-extrabold text-white transition hover:bg-white/10'>
                  Start Free — 2 Stories/mo
                </Link>
                <p className='mt-3 text-center text-xs text-zinc-500'>No credit card required. Free forever.</p>
              </div>
            </div>

            {/* ─── TIER 2: VEYLO PRO (FEATURED) ─── */}
            <div className='relative flex flex-col justify-between overflow-hidden rounded-[2.5rem] border-2 border-[#ff5a47] bg-[#ff5a47]/[.08] p-8 shadow-[0_20px_80px_rgba(255,90,71,.2)] sm:p-12'>
              <div className='absolute -right-16 -top-16 h-72 w-72 rounded-full bg-[#ff5a47]/25 blur-[90px]' />

              <div className='relative z-10'>
                <div className='flex items-center justify-between'>
                  <span className='text-xs font-black uppercase tracking-[.2em] text-[#ff9b8e]'>Veylo Pro</span>
                  <span className='rounded-full bg-[#ff5a47] px-3.5 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-md'>
                    STUDIO STANDARD
                  </span>
                </div>

                <div className='mt-6 flex items-baseline gap-2'>
                  <span className='text-5xl font-extrabold tracking-[-.05em] text-white'>₦20,000</span>
                  <span className='text-sm font-bold text-zinc-400'>/ month</span>
                </div>

                <p className='mt-4 text-sm font-semibold text-white'>
                  The main product for working photographers and media studios.
                </p>

                <div className='mt-8 space-y-3.5 border-t border-white/15 pt-8 text-sm'>
                  {[
                    'Unlimited Photo Stories (fair use)',
                    'Full AI Director & photo understanding',
                    'Intelligent photo sequencing & pacing',
                    'All cinematic themes & audio sync',
                    'AI editorial storytelling & custom copy',
                    'Full TTS voice narration',
                    'Photographer & studio branding (custom logo)',
                    'High-resolution client gallery & bulk downloads',
                    'Private / unlisted stories & password protection',
                    'Story editing & reasonable regeneration',
                    'Remove or greatly reduce Veylo branding',
                    'Extended media hosting & cloud storage',
                    'Priority generation & rendering'
                  ].map((feat) => (
                    <div key={feat} className='flex items-start gap-3 text-white'>
                      <Check size={16} className='mt-0.5 shrink-0 text-[#ff7b69]' />
                      <span className='font-medium'>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className='relative z-10 mt-10'>
                <Link
                  to='/create'
                  className='flex w-full items-center justify-center gap-3 rounded-2xl bg-[#ff5a47] py-4 text-sm font-extrabold text-white shadow-[0_12px_35px_rgba(255,90,71,.35)] transition hover:bg-[#ff7564]'>
                  Get Veylo Pro — ₦20,000/mo
                </Link>
                <p className='mt-3 text-center text-xs text-zinc-400'>
                  One client referral covers your entire year. Cancel anytime.
                </p>
              </div>
            </div>
          </div>

          {/* ─── FAIR USE ASSURANCE CALLOUT ─── */}
          <div className='mx-auto mt-12 max-w-4xl rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur-md'>
            <div className='flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left'>
              <div className='grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#ff5a47]/15 text-[#ff7b69]'>
                <ShieldCheck size={24} />
              </div>
              <div className='text-xs leading-6 text-zinc-400'>
                <strong className='text-white'>Fair-Use Protection: </strong>
                Normal photographer and studio usage is completely unlimited. Fair use simply protects against automated
                scraping, multi-studio account pooling, or bot-generated bulk spam. Built for professional photographers
                who deliver real shoots.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FREQUENTLY ASKED QUESTIONS (FAQ) ─── */}
      <section className='px-5 py-28 sm:px-8 lg:py-36'>
        <div className='mx-auto max-w-4xl'>
          <div className='text-center'>
            <p className='text-xs font-extrabold uppercase tracking-[.24em] text-[#ff6b57]'>Clarity For Studios</p>
            <h2 className='mt-4 font-display text-4xl font-extrabold sm:text-5xl'>Frequently Asked Questions</h2>
          </div>

          <div className='mt-14 space-y-4'>
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={faq.q}
                  className='overflow-hidden rounded-2xl border border-white/10 bg-[#111115] transition'>
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className='flex w-full items-center justify-between p-6 text-left text-base font-bold text-white hover:text-[#ff7b69]'>
                    <span>{faq.q}</span>
                    <ChevronDown
                      size={18}
                      className={`shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180 text-[#ff5a47]' : 'text-zinc-500'}`}
                    />
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}>
                        <div className='border-t border-white/10 px-6 pb-6 pt-4 text-sm leading-7 text-zinc-400'>
                          {faq.a}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── BOTTOM HERO CTA ─── */}
      <section className='px-5 pb-28 sm:px-8 lg:pb-36'>
        <div className='relative mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] border border-[#ff7b69]/30 bg-gradient-to-br from-[#d94738] via-[#ad3138] to-[#541f32] px-6 py-20 text-center shadow-[0_30px_100px_rgba(255,90,71,.25)] sm:px-12 lg:py-28'>
          <div className='absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-[#ffc1b8]/20 blur-[100px]' />
          <div className='relative z-10'>
            <img src='/veylo/veylo-mark.svg' alt='' className='mx-auto h-16 w-16 rounded-2xl shadow-xl' />
            <p className='mt-7 text-xs font-extrabold uppercase tracking-[.24em] text-[#ffd4ce]'>
              Don't just deliver it. Premiere it.
            </p>
            <h2 className='mx-auto mt-4 max-w-4xl font-display text-5xl font-extrabold leading-[.92] tracking-[-.05em] sm:text-7xl'>
              “Are my pictures ready?”<br />
              <span className='text-white'>Make the answer worth opening.</span>
            </h2>
            <p className='mx-auto mt-6 max-w-xl text-base leading-7 text-white/80'>
              Premiere your next shoot with 2 free stories every month. When you're ready to make it your studio standard,
              upgrade to Unlimited for ₦20,000/month.
            </p>
            <div className='mt-10 flex flex-col justify-center gap-4 sm:flex-row'>
              <Link
                to='/create'
                className='group inline-flex items-center justify-center gap-4 rounded-2xl bg-white px-8 py-4 text-sm font-extrabold text-[#7c2027] transition hover:-translate-y-0.5 hover:bg-zinc-100'>
                Premiere my next shoot <ArrowRight size={17} className='transition-transform group-hover:translate-x-1' />
              </Link>
              <Link
                to='/create'
                className='inline-flex items-center justify-center gap-3 rounded-2xl border border-white/30 bg-black/20 px-8 py-4 text-sm font-extrabold text-white backdrop-blur-md transition hover:bg-black/30'>
                Get Veylo Pro (₦20k/mo)
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
