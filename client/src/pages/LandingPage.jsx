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
  RotateCcw,
  Share2,
  ShieldCheck,
  Sliders,
  Smartphone,
  Sparkles,
  Type,
  Volume2,
  VolumeX,
  WandSparkles,
  Zap
} from 'lucide-react';

const heroPresets = [
  {
    id: 'ada',
    label: 'Birthday Premiere',
    icon: '🎂',
    client: 'Ada',
    tag: 'Ada at 30',
    occasion: 'Birthday Portrait Premiere',
    soundtrack: 'Golden Hour Reverie',
    bpm: '92 BPM',
    duration: '0:28',
    coverImage: '/veylo/pv-red-phone.jpeg',
    coverChapter: 'THE ARRIVAL',
    frames: [
      { image: '/veylo/pv-red-phone.jpeg', chapter: 'THE ARRIVAL', line: 'Thirty enters the room before she says a word.' },
      { image: '/veylo/pv-espresso.jpeg', chapter: 'AFTER HOURS', line: 'She built this version of herself in rooms no one applauded.' },
      { image: '/veylo/pv-white-suit.jpeg', chapter: 'OWN TERMS', line: 'Soft voice. Clear boundaries. A life with her name on it.' },
      { image: '/veylo/pv-motion.jpeg', chapter: 'UNREHEARSED', line: 'The best part was the laugh that came after the pose.' },
      { image: '/veylo/pv-luxury.jpeg', chapter: 'THE YEAR AHEAD', line: 'No shrinking. No asking. No waiting for permission.' },
      { image: '/veylo/pv-hero.jpeg', chapter: 'THIRTY', line: 'Here. Whole. And only just beginning.' }
    ]
  },
  {
    id: 'wedding',
    label: 'Wedding Story',
    icon: '💍',
    client: 'Tobi & Kemi',
    tag: 'Tobi & Kemi',
    occasion: 'Wedding Premiere',
    soundtrack: 'Whispering Skies',
    bpm: '84 BPM',
    duration: '0:32',
    coverImage: '/veylo/pv-soft.jpeg',
    coverChapter: 'THE PROMISE',
    frames: [
      { image: '/veylo/pv-soft.jpeg', chapter: 'THE MORNING OF', line: 'A calm that only comes when you are completely sure.' },
      { image: '/veylo/pv-reaching.jpeg', chapter: 'FIRST LOOK', line: 'Ten years of friendship, one breath before forever.' },
      { image: '/veylo/pv-bnw.jpeg', chapter: 'THE PROMISE', line: 'Two families. One covenant. Zero doubts.' },
      { image: '/veylo/pv-ghana.jpeg', chapter: 'TRADITION', line: 'Carrying forward the grace of everyone before us.' },
      { image: '/veylo/pv-casual.jpeg', chapter: 'CELEBRATION', line: 'Dance until the shoes come off and only joy remains.' },
      { image: '/veylo/pv-hero.jpeg', chapter: 'FOREVER', line: 'Not the end of the day. The start of the lifetime.' }
    ]
  },
  {
    id: 'editorial',
    label: 'Fashion Lookbook',
    icon: '👗',
    client: 'The Studio',
    tag: 'The September Issue',
    occasion: 'Editorial Lookbook',
    soundtrack: 'Aura of Eternity',
    bpm: '98 BPM',
    duration: '0:30',
    coverImage: '/veylo/pv-editorial.jpeg',
    coverChapter: 'PROLOGUE',
    frames: [
      { image: '/veylo/pv-editorial.jpeg', chapter: 'PROLOGUE', line: 'Sharp tailoring. Architectural light. Unapologetic presence.' },
      { image: '/veylo/pv-white-fashion.jpeg', chapter: 'IN TRANSIT', line: 'Between flights, fittings, and the next collection.' },
      { image: '/veylo/pv-striking.jpeg', chapter: 'HIGH CONTRAST', line: 'Light sculpts what confidence already built.' },
      { image: '/veylo/pv-shay.jpeg', chapter: 'THE STATEMENT', line: 'The most striking piece is always the woman wearing it.' },
      { image: '/veylo/pv-playful-scale.jpeg', chapter: 'COMPOSITION', line: 'Fashion that refuses to sit quietly in the background.' },
      { image: '/veylo/pv-brand.jpeg', chapter: 'THE ARCHIVE', line: 'A body of work that defines the current era.' }
    ]
  }
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
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }
};

export default function LandingPage({ onOpenAuth }) {
  const previewRef = useRef(null);
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0);
  const [activeFrame, setActiveFrame] = useState(0);
  const [storyStatus, setStoryStatus] = useState('cover'); // 'cover' | 'playing' | 'ending'
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [activeWorkflowTab, setActiveWorkflowTab] = useState('photographer');
  const [openFaq, setOpenFaq] = useState(null);

  const currentPreset = heroPresets[selectedPresetIndex];
  const frames = currentPreset.frames;

  // Auto-advance frames when playing
  useEffect(() => {
    if (storyStatus !== 'playing' || !isPlaying) return undefined;
    const timer = window.setTimeout(() => {
      if (activeFrame >= frames.length - 1) {
        setStoryStatus('ending');
        setIsPlaying(false);
        return;
      }
      setActiveFrame((f) => f + 1);
    }, 4400);
    return () => window.clearTimeout(timer);
  }, [activeFrame, isPlaying, storyStatus, frames.length]);

  const handleSelectPreset = (index) => {
    setSelectedPresetIndex(index);
    setActiveFrame(0);
    setStoryStatus('cover');
    setIsPlaying(false);
  };

  const startStory = () => {
    setActiveFrame(0);
    setStoryStatus('playing');
    setIsPlaying(true);
    previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const togglePlayPause = (e) => {
    e?.stopPropagation();
    setIsPlaying((prev) => !prev);
  };

  const restartStory = (e) => {
    e?.stopPropagation();
    setActiveFrame(0);
    setStoryStatus('playing');
    setIsPlaying(true);
  };

  return (
    <div className='min-h-screen w-full overflow-x-hidden bg-[#070709] text-white selection:bg-[#ff5a47] selection:text-white'>
      {/* ─── HERO SECTION ─── */}
      <section className='relative min-h-[100svh] px-4 pb-16 pt-28 sm:px-8 sm:pb-24 sm:pt-36 lg:pt-40'>
        {/* Ambient atmospheric glows */}
        <div className='pointer-events-none absolute left-[-15%] top-[-15%] h-[550px] w-[550px] rounded-full bg-[#ff5a47]/18 blur-[160px] sm:h-[700px] sm:w-[700px]' />
        <div className='pointer-events-none absolute right-[-10%] top-[10%] h-[400px] w-[400px] rounded-full bg-[#ff8c7a]/12 blur-[140px] sm:h-[550px] sm:w-[550px]' />
        <div className='pointer-events-none absolute bottom-0 left-1/2 h-[350px] w-[700px] -translate-x-1/2 rounded-full bg-[#ff5a47]/10 blur-[180px]' />

        {/* Subtle background grid lines with mask */}
        <div className='pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_15%,#000_65%,transparent_100%)]' />

        <div className='relative mx-auto grid max-w-7xl items-center gap-12 lg:min-h-[calc(100svh-12rem)] lg:grid-cols-[1fr_1fr] lg:gap-14'>
          {/* Left Column: Headline & Positioning */}
          <motion.div
            initial='hidden'
            animate='show'
            variants={{ show: { transition: { staggerChildren: 0.1 } } }}
            className='relative z-10 w-full max-w-2xl text-center lg:text-left'>
            
            {/* Live Eyebrow Badge */}
            <motion.div
              variants={reveal}
              className='mb-5 inline-flex items-center gap-2.5 rounded-full border border-[#ff5a47]/30 bg-[#ff5a47]/10 px-3.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[.22em] text-[#ff9b8e] sm:text-[11px]'>
              <span className='relative flex h-2 w-2'>
                <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff5a47] opacity-75'></span>
                <span className='relative inline-flex h-2 w-2 rounded-full bg-[#ff5a47] shadow-[0_0_10px_#ff5a47]'></span>
              </span>
              The Photo Delivery Platform for Photographers
            </motion.div>

            {/* Main Command H1 */}
            <motion.h1
              variants={reveal}
              className='font-display text-[clamp(2.7rem,6.2vw,6.5rem)] font-extrabold leading-[.92] tracking-[-.055em] text-white'>
              Don't just deliver photos.
              <span className='mt-2 block text-transparent bg-clip-text bg-gradient-to-r from-[#ff7b69] via-[#ff5a47] to-[#ffb2a8] drop-shadow-[0_12px_40px_rgba(255,90,71,0.35)]'>
                Premiere them.
              </span>
            </motion.h1>

            {/* Supporting Copy */}
            <motion.p
              variants={reveal}
              className='mx-auto mt-6 max-w-xl text-base leading-7 text-zinc-300 sm:text-lg sm:leading-8 lg:mx-0'>
              Transform completed photoshoots into cinematic, interactive Photo Stories your clients can experience,
              share and download. Built for photographers and media studios who want final delivery to feel as premium as the photography itself.
            </motion.p>

            {/* CTAs */}
            <motion.div
              variants={reveal}
              className='mt-8 flex flex-col justify-center gap-3.5 sm:flex-row lg:justify-start'>
              <Link
                to='/create'
                className='group relative inline-flex items-center justify-center gap-3.5 rounded-2xl bg-[#ff5a47] px-7 py-4 text-sm font-black text-white shadow-[0_18px_50px_rgba(255,90,71,0.3)] transition hover:-translate-y-0.5 hover:bg-[#ff7564] active:translate-y-0'>
                <span>Create Your First Photo Story</span>
                <ArrowRight size={17} className='transition-transform group-hover:translate-x-1' />
              </Link>
              <button
                onClick={startStory}
                className='inline-flex items-center justify-center gap-2.5 rounded-2xl border border-white/15 bg-white/[.05] px-6 py-4 text-sm font-bold text-zinc-200 backdrop-blur-xl transition hover:bg-white/[.1] hover:border-white/25'>
                <span className='grid h-6 w-6 place-items-center rounded-full bg-[#ff5a47]/20 text-[#ff7b69]'>
                  <Play size={11} fill='currentColor' />
                </span>
                <span>Watch Ada's Story</span>
              </button>
            </motion.div>

            {/* Value & Trust Badges */}
            <motion.div
              variants={reveal}
              className='mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2.5 text-xs font-medium text-zinc-400 lg:justify-start'>
              <span className='flex items-center gap-2'>
                <Check size={14} className='shrink-0 text-[#ff6b57]' /> 2 Photo Stories free / month
              </span>
              <span className='flex items-center gap-2'>
                <Check size={14} className='shrink-0 text-[#ff6b57]' /> Opens in any browser (WhatsApp-ready)
              </span>
              <span className='flex items-center gap-2'>
                <Check size={14} className='shrink-0 text-[#ff6b57]' /> Full gallery & downloads at the end
              </span>
              <span className='flex items-center gap-2'>
                <Check size={14} className='shrink-0 text-[#ff6b57]' /> No credit card required
              </span>
            </motion.div>
          </motion.div>

          {/* Right Column: Interactive Phone Simulator & Smart Badges */}
          <motion.div
            ref={previewRef}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className='relative mx-auto w-full max-w-[500px] lg:mr-0'>

            {/* Shoot Preset Tabs: Switcher */}
            <div className='mb-4 flex items-center justify-center gap-1.5 overflow-x-auto pb-1 sm:justify-start'>
              {heroPresets.map((preset, idx) => (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(idx)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                    selectedPresetIndex === idx
                      ? 'bg-[#ff5a47] text-white shadow-md shadow-[#ff5a47]/30'
                      : 'border border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-white'
                  }`}>
                  <span>{preset.icon}</span>
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>

            {/* Floating Intelligence Badges (Desktop & Tablet only to avoid mobile horizontal scroll) */}
            <div className='hidden sm:block'>
              {/* Floating Badge 1: Top Left */}
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
                className='absolute -left-8 top-16 z-30 flex items-center gap-2.5 rounded-2xl border border-white/15 bg-black/75 p-3 text-left shadow-2xl backdrop-blur-xl'>
                <div className='grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#ff5a47]/20 text-[#ff7b69]'>
                  <WandSparkles size={16} />
                </div>
                <div>
                  <p className='text-[10px] font-black uppercase tracking-wider text-[#ff9b8e]'>AI Director</p>
                  <p className='text-xs font-bold text-white'>Opening Hook Crowned</p>
                </div>
              </motion.div>

              {/* Floating Badge 2: Top Right */}
              <motion.div
                animate={{ y: [0, 6, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                className='absolute -right-6 top-32 z-30 flex items-center gap-2.5 rounded-2xl border border-white/15 bg-black/75 p-3 text-left shadow-2xl backdrop-blur-xl'>
                <div className='grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#ff5a47]/20 text-[#ff7b69]'>
                  <Music2 size={16} />
                </div>
                <div>
                  <p className='text-[10px] font-black uppercase tracking-wider text-[#ff9b8e]'>Soundtrack Sync</p>
                  <p className='text-xs font-bold text-white'>{currentPreset.soundtrack} · {currentPreset.bpm}</p>
                </div>
              </motion.div>

              {/* Floating Badge 3: Bottom Right */}
              <motion.div
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                className='absolute -right-4 bottom-20 z-30 flex items-center gap-2.5 rounded-2xl border border-white/15 bg-black/75 p-3 text-left shadow-2xl backdrop-blur-xl'>
                <div className='grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#ff5a47]/20 text-[#ff7b69]'>
                  <ImageIcon size={16} />
                </div>
                <div>
                  <p className='text-[10px] font-black uppercase tracking-wider text-[#ff9b8e]'>Pristine Delivery</p>
                  <p className='text-xs font-bold text-white'>High-Res Client Downloads</p>
                </div>
              </motion.div>
            </div>

            {/* Phone Chassis Mockup */}
            <div className='relative mx-auto aspect-[9/17] w-[82%] max-w-[340px] overflow-hidden rounded-[2.8rem] border-[3px] border-white/20 bg-zinc-950 p-2.5 shadow-[0_45px_120px_rgba(0,0,0,0.85)] ring-1 ring-white/10 sm:w-[74%]'>
              <div className='relative h-full w-full overflow-hidden rounded-[2.2rem] bg-black'>
                
                {/* Dynamic Island Pill Notch */}
                <div className='absolute left-1/2 top-2.5 z-40 flex h-4 w-20 -translate-x-1/2 items-center justify-between rounded-full bg-black px-2 ring-1 ring-white/10'>
                  <div className='h-1.5 w-1.5 rounded-full bg-white/20' />
                  <div className='h-2 w-2 rounded-full bg-emerald-500/80 shadow-[0_0_6px_#10b981]' />
                </div>

                <AnimatePresence mode='wait'>
                  {/* ─── STATE 1: COVER SCREEN ─── */}
                  {storyStatus === 'cover' && (
                    <motion.div
                      key={`cover-${currentPreset.id}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className='absolute inset-0'>
                      <img
                        src={currentPreset.coverImage}
                        alt=''
                        className='absolute inset-0 h-full w-full object-cover'
                      />
                      <div className='absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,.25),rgba(15,7,9,.25)_40%,rgba(0,0,0,.94))]' />
                      
                      {/* Veylo Logo Pill */}
                      <div className='absolute inset-x-0 top-[18%] flex flex-col items-center px-6 text-center'>
                        <img src='/veylo/veylo-mark.svg' alt='' className='h-12 w-12 rounded-2xl shadow-xl' />
                        <span className='mt-3.5 rounded-full border border-white/25 bg-black/40 px-3.5 py-1 text-[8px] font-black uppercase tracking-[.22em] text-white backdrop-blur-xl'>
                          A Veylo Photo Story
                        </span>
                      </div>

                      {/* Cover Details & CTA */}
                      <div className='absolute inset-x-0 bottom-0 px-6 pb-7 text-center sm:px-8 sm:pb-8'>
                        <p className='font-serif text-3xl font-semibold leading-tight text-white sm:text-4xl'>
                          {currentPreset.tag}
                        </p>
                        <p className='mt-1.5 text-xs font-semibold text-white/75'>
                          {currentPreset.occasion}
                        </p>

                        <div className='mt-3 flex items-center justify-center gap-2'>
                          <span className='inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/40 px-2.5 py-0.5 text-[8px] font-bold text-white/90 backdrop-blur-md'>
                            <Music2 size={9} className='text-[#ff7b69]' /> {currentPreset.soundtrack}
                          </span>
                          <span className='inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/40 px-2.5 py-0.5 text-[8px] font-bold text-white/90 backdrop-blur-md'>
                            <Mic2 size={9} className='text-[#ff7b69]' /> Voice
                          </span>
                        </div>

                        <button
                          onClick={startStory}
                          className='mt-5 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[#ff5a47] px-4 py-3.5 text-xs font-extrabold text-white shadow-[0_12px_35px_rgba(255,90,71,0.4)] transition hover:bg-[#ff7564] active:scale-95'>
                          <Play size={13} fill='currentColor' /> Watch Premiere
                        </button>
                        <p className='mt-2.5 text-[8px] font-bold uppercase tracking-[.18em] text-white/50'>
                          Tap to begin
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* ─── STATE 2: PLAYING ACTIVE FRAMES ─── */}
                  {storyStatus === 'playing' && (
                    <motion.div
                      key={`frame-${currentPreset.id}-${activeFrame}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.6 }}
                      className='absolute inset-0 cursor-pointer'
                      onClick={togglePlayPause}>
                      <motion.img
                        src={frames[activeFrame].image}
                        alt=''
                        initial={{ scale: 1.02 }}
                        animate={{ scale: activeFrame % 2 === 0 ? 1.1 : 1.06, x: activeFrame % 2 === 0 ? 0 : -6 }}
                        transition={{ duration: 6, ease: 'linear' }}
                        className='absolute inset-0 h-full w-full object-cover'
                      />
                      <div className='absolute inset-0 bg-gradient-to-t from-black/95 via-transparent to-black/60' />

                      {/* Caption Card */}
                      <div className='absolute inset-x-0 bottom-0 p-4'>
                        <motion.div
                          initial={{ opacity: 0, y: 14 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 }}
                          className='rounded-2xl border border-[#ff7b69]/30 bg-black/80 p-4 text-left shadow-2xl backdrop-blur-xl'>
                          <div className='flex items-center justify-between'>
                            <span className='inline-flex rounded-md border border-[#ff7b69]/40 bg-[#ff5a47]/15 px-2 py-0.5 text-[8px] font-black uppercase tracking-[.16em] text-[#ff9b8e]'>
                              {frames[activeFrame].chapter}
                            </span>
                            <span className='text-[8px] font-bold text-white/50'>
                              {activeFrame + 1} / {frames.length}
                            </span>
                          </div>
                          <p className='mt-2.5 text-xs font-semibold leading-5 text-white sm:text-sm'>
                            {frames[activeFrame].line}
                          </p>
                        </motion.div>
                      </div>
                    </motion.div>
                  )}

                  {/* ─── STATE 3: FINALE & DOWNLOAD GALLERY ─── */}
                  {storyStatus === 'ending' && (
                    <motion.div
                      key='ending'
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className='absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_top,#4a1a18_0%,#1a0f12_45%,#050505_100%)] px-5 text-center'>
                      {/* Fan of completed photographs */}
                      <div className='relative mb-6 h-24 w-36'>
                        {[frames[0].image, frames[1].image, frames[2].image].map((img, idx) => (
                          <img
                            key={img}
                            src={img}
                            alt=''
                            className={`absolute left-1/2 top-1/2 h-20 w-14 rounded-xl border-2 object-cover shadow-2xl ${
                              idx === 0
                                ? '-translate-x-[125%] -translate-y-1/2 -rotate-12 border-white/20'
                                : idx === 1
                                ? 'z-10 -translate-x-1/2 -translate-y-1/2 border-[#ff7b69]'
                                : 'translate-x-[25%] -translate-y-1/2 rotate-12 border-white/20'
                            }`}
                          />
                        ))}
                      </div>

                      <span className='text-[8px] font-black uppercase tracking-[.2em] text-[#ff9b8e]'>
                        Premiere Concluded
                      </span>
                      <p className='mt-2 font-serif text-2xl font-semibold text-white'>
                        Your Photos Are Ready
                      </p>
                      <p className='mt-1.5 text-[10px] leading-4 text-white/60'>
                        Browse all finished high-res photos, view full-screen, or download all.
                      </p>

                      <div className='mt-5 w-full space-y-2'>
                        <button className='flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff5a47] py-2.5 text-[10px] font-extrabold text-white'>
                          <ImageIcon size={12} /> View full photo gallery
                        </button>
                        <button className='flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 py-2.5 text-[10px] font-extrabold text-white'>
                          <Download size={12} /> Download all (High-Res)
                        </button>
                        <button className='flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 py-2.5 text-[10px] font-extrabold text-white'>
                          <Share2 size={12} /> Share Photo Story
                        </button>
                      </div>

                      <button
                        onClick={restartStory}
                        className='mt-3.5 flex items-center gap-1 text-[8px] font-black uppercase tracking-[.18em] text-white/50 hover:text-white'>
                        <RotateCcw size={10} /> Replay premiere
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Top Control Bar during Story Playback */}
                {storyStatus === 'playing' && (
                  <div className='absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-black/85 via-black/40 to-transparent px-3 pb-6 pt-7'>
                    {/* Segmented Story Progress Bar */}
                    <div className='flex gap-1'>
                      {frames.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveFrame(idx);
                            setIsPlaying(true);
                          }}
                          className='h-[2.5px] flex-1 overflow-hidden rounded-full bg-white/25'>
                          <span
                            className={`block h-full bg-white transition-all duration-300 ${
                              idx < activeFrame
                                ? 'w-full'
                                : idx === activeFrame
                                ? 'w-full'
                                : 'w-0'
                            }`}
                          />
                        </button>
                      ))}
                    </div>

                    {/* Metadata & Audio Equalizer Indicator */}
                    <div className='mt-2.5 flex items-center justify-between'>
                      <div className='flex items-center gap-2'>
                        <img src='/veylo/veylo-mark.svg' alt='' className='h-6 w-6 rounded-lg' />
                        <div className='text-left'>
                          <p className='text-[10px] font-black leading-none text-white'>{currentPreset.tag}</p>
                          <div className='mt-0.5 flex items-center gap-1 text-[7px] font-medium text-[#ff9b8e]'>
                            {/* Animated Audio Equalizer Bars */}
                            {isPlaying && (
                              <span className='flex h-2 items-end gap-[1.5px]'>
                                <span className='h-full w-[1.5px] animate-pulse bg-[#ff5a47]' />
                                <span className='h-1.5 w-[1.5px] animate-pulse bg-[#ff5a47] [animation-delay:0.2s]' />
                                <span className='h-2.5 w-[1.5px] animate-pulse bg-[#ff5a47] [animation-delay:0.4s]' />
                              </span>
                            )}
                            <span>{currentPreset.soundtrack}</span>
                          </div>
                        </div>
                      </div>

                      {/* Controls: Volume & Play/Pause */}
                      <div className='flex items-center gap-1'>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsMuted(!isMuted);
                          }}
                          className='grid h-6 w-6 place-items-center rounded-full bg-black/40 text-white/80 hover:text-white'>
                          {isMuted ? <VolumeX size={10} /> : <Volume2 size={10} />}
                        </button>
                        <button
                          onClick={togglePlayPause}
                          className='grid h-6 w-6 place-items-center rounded-full bg-black/40 text-white'>
                          {isPlaying ? <Pause size={10} /> : <Play size={10} fill='currentColor' />}
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

      {/* ─── VALUE PILLARS TICKER (RESPONSIVE AUTO-MARQUEE / WRAP) ─── */}
      <section className='border-y border-white/10 bg-[#0c0c10] py-4 sm:py-5'>
        <div className='mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 text-center text-[10px] font-extrabold uppercase tracking-[.2em] text-zinc-400 sm:text-[11px] md:justify-between'>
          <span className='flex items-center gap-2 text-white'><span className='text-[#ff5a47]'>✦</span> Photos Stay Photos</span>
          <span className='flex items-center gap-2 text-white'><span className='text-[#ff5a47]'>✦</span> Veylo AI Director</span>
          <span className='flex items-center gap-2 text-white'><span className='text-[#ff5a47]'>✦</span> Editorial Storytelling</span>
          <span className='flex items-center gap-2 text-white'><span className='text-[#ff5a47]'>✦</span> Music & Narration</span>
          <span className='flex items-center gap-2 text-white'><span className='text-[#ff5a47]'>✦</span> High-Res Client Downloads</span>
        </div>
      </section>

      {/* ─── THE TRANSFORMATION: BEFORE VS AFTER (VIRAL HOOK) ─── */}
      <section className='px-4 py-20 sm:px-8 sm:py-28 lg:py-36'>
        <div className='mx-auto max-w-7xl'>
          <div className='grid gap-6 lg:grid-cols-2 lg:items-end'>
            <div>
              <p className='mb-3 text-xs font-extrabold uppercase tracking-[.24em] text-[#ff6b57]'>
                The Client Reaction Is Your Brand
              </p>
              <h2 className='font-display text-[clamp(2.2rem,5vw,5rem)] font-extrabold leading-[.94] tracking-[-.055em]'>
                Photographers still delivering shoots like this?
              </h2>
            </div>
            <p className='max-w-lg text-base leading-7 text-zinc-400 sm:text-lg lg:pb-2'>
              After weeks of planning, directing, lighting, and meticulous retouching, the way your photographs arrive
              either flattens the work—or creates a client for life.
            </p>
          </div>

          <div className='mt-12 grid gap-6 lg:grid-cols-2'>
            {/* The Cold Delivery */}
            <div className='relative flex flex-col justify-between rounded-[2.2rem] border border-white/10 bg-zinc-950 p-6 sm:p-10'>
              <div>
                <div className='flex items-center justify-between text-xs font-black uppercase tracking-[.18em] text-zinc-500'>
                  <span>THE OLD WAY</span>
                  <span className='rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] text-zinc-400 sm:text-xs'>
                    184 RAW / JPG FILES
                  </span>
                </div>

                <div className='mt-10 inline-flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-zinc-900 text-zinc-500 sm:h-20 sm:w-20'>
                  <Folder size={36} strokeWidth={1.2} />
                </div>

                <h3 className='mt-6 font-display text-2xl font-bold text-zinc-300 sm:text-3xl'>
                  “Hi, here is your Google Drive link.”
                </h3>
                <p className='mt-3 text-sm leading-6 text-zinc-400'>
                  Opened on a phone. Pinched, zoomed, scrolled in silence. Downloaded frantically. Closed. Zero emotional
                  crescendo. Your art ends in a spreadsheet of filenames.
                </p>
              </div>

              <div className='mt-8 rounded-2xl border border-white/5 bg-black/40 p-3.5 text-xs font-mono text-zinc-500'>
                <p className='truncate'>drive.google.com/drive/folders/7xK9... · 184 items · 4.8 GB</p>
              </div>
            </div>

            {/* The Veylo Premiere */}
            <div className='relative flex flex-col justify-between overflow-hidden rounded-[2.2rem] border border-[#ff5a47]/40 bg-[#ff5a47]/[.06] p-6 sm:p-10'>
              <div className='absolute -right-16 -top-16 h-72 w-72 rounded-full bg-[#ff5a47]/20 blur-[100px]' />

              <div className='relative z-10'>
                <div className='flex items-center justify-between text-xs font-black uppercase tracking-[.18em] text-[#ff9b8e]'>
                  <span className='flex items-center gap-1.5'>
                    <Sparkles size={14} className='text-[#ff5a47]' /> THE VEYLO PREMIERE
                  </span>
                  <span className='rounded-full border border-[#ff5a47]/30 bg-[#ff5a47]/15 px-3 py-1 text-[10px] font-bold text-[#ff9b8e] sm:text-xs'>
                    EXPERIENCE FIRST
                  </span>
                </div>

                <p className='mt-10 font-serif text-2xl font-semibold leading-snug text-white sm:text-4xl'>
                  Her name. Her soundtrack. Her photographs, revealed one moment at a time.
                </p>

                <p className='mt-4 text-sm leading-6 text-zinc-300 sm:text-base sm:leading-7'>
                  Music begins. Editorial chapter lines appear. Subtle motion brings each portrait alive. Then, the full
                  gallery unlocks for high-resolution individual and bulk downloads.
                </p>
              </div>

              <div className='relative z-10 mt-8 rounded-2xl border border-[#ff5a47]/30 bg-black/60 p-3.5 text-xs font-medium text-[#ff9b8e] backdrop-blur-xl'>
                <div className='flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between'>
                  <span className='font-mono font-bold'>veylo.com.ng/s/ada-at-30</span>
                  <span className='text-[10px] font-black uppercase tracking-wider text-white/80'>Ready for WhatsApp</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── VEYLO AI DIRECTOR: THE CORE CONCEPT ─── */}
      <section id='ai-director' className='border-y border-white/10 bg-[#0c0c10] px-4 py-20 sm:px-8 sm:py-28 lg:py-36'>
        <div className='mx-auto max-w-7xl'>
          <div className='mx-auto max-w-3xl text-center'>
            <div className='inline-flex items-center gap-2 rounded-full border border-[#ff5a47]/30 bg-[#ff5a47]/10 px-4 py-1.5 text-xs font-extrabold uppercase tracking-[.22em] text-[#ff9b8e]'>
              <WandSparkles size={14} /> The Veylo AI Director
            </div>
            <h2 className='mt-5 font-display text-[clamp(2.4rem,5vw,5rem)] font-extrabold leading-[.94] tracking-[-.05em]'>
              Veylo directs the delivery.
            </h2>
            <p className='mt-4 text-base leading-7 text-zinc-400 sm:text-lg'>
              Instead of presenting Veylo as just “captions + a gallery + music”, we built an AI Director.
              It understands the emotional arc of your shoot, chooses the strongest hook, and stages the premiere automatically.
            </p>
          </div>

          <div className='mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3'>
            {aiDirectorFeatures.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className='group relative rounded-[2rem] border border-white/10 bg-white/[.02] p-6 transition duration-300 hover:border-[#ff5a47]/40 hover:bg-white/[.04] sm:p-8'>
                  <div className='flex items-center justify-between'>
                    <div className='grid h-12 w-12 place-items-center rounded-2xl bg-[#ff5a47]/10 text-[#ff7b69] transition group-hover:scale-110 group-hover:bg-[#ff5a47]/20'>
                      <Icon size={22} />
                    </div>
                    <span className='font-mono text-xs font-bold text-zinc-600'>0{index + 1}</span>
                  </div>
                  <h3 className='mt-6 text-xl font-extrabold text-white'>{feature.title}</h3>
                  <p className='mt-2.5 text-sm leading-6 text-zinc-400'>{feature.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── THE TWO SIDES OF VEYLO: STUDIO WORKFLOW VS CLIENT PREMIERE ─── */}
      <section id='how-it-works' className='px-4 py-20 sm:px-8 sm:py-28 lg:py-36'>
        <div className='mx-auto max-w-7xl'>
          <div className='mx-auto max-w-2xl text-center'>
            <p className='text-xs font-extrabold uppercase tracking-[.24em] text-[#ff6b57]'>End-To-End Experience</p>
            <h2 className='mt-3 font-display text-4xl font-extrabold leading-[.95] tracking-[-.05em] sm:text-6xl'>
              Built for the studio.<br />
              <span className='text-zinc-500'>Felt by the client.</span>
            </h2>
            
            {/* Responsive Tab Switcher */}
            <div className='mt-8 flex justify-center'>
              <div className='grid w-full max-w-md grid-cols-2 rounded-2xl border border-white/15 bg-white/5 p-1 backdrop-blur-xl'>
                <button
                  onClick={() => setActiveWorkflowTab('photographer')}
                  className={`rounded-xl py-2.5 text-center text-xs font-extrabold transition ${
                    activeWorkflowTab === 'photographer'
                      ? 'bg-[#ff5a47] text-white shadow-lg shadow-[#ff5a47]/25'
                      : 'text-zinc-400 hover:text-white'
                  }`}>
                  Photographer (3 Mins)
                </button>
                <button
                  onClick={() => setActiveWorkflowTab('client')}
                  className={`rounded-xl py-2.5 text-center text-xs font-extrabold transition ${
                    activeWorkflowTab === 'client'
                      ? 'bg-[#ff5a47] text-white shadow-lg shadow-[#ff5a47]/25'
                      : 'text-zinc-400 hover:text-white'
                  }`}>
                  Client Premiere
                </button>
              </div>
            </div>
          </div>

          <div className='mt-12'>
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
                    className='rounded-[2rem] border border-white/10 bg-[#111115] p-6 transition hover:border-white/20 sm:p-8'>
                    <span className='font-mono text-xs font-bold text-[#ff6b57]'>{item.step}</span>
                    <h3 className='mt-5 text-xl font-extrabold text-white sm:text-2xl'>{item.title}</h3>
                    <p className='mt-1.5 text-xs font-bold uppercase tracking-wider text-[#ff9b8e]'>{item.subtitle}</p>
                    <p className='mt-3.5 text-sm leading-6 text-zinc-400'>{item.desc}</p>
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
                    className='rounded-[2rem] border border-white/10 bg-[#111115] p-6 transition hover:border-white/20 sm:p-8'>
                    <span className='font-mono text-xs font-bold text-[#ff6b57]'>{item.step}</span>
                    <h3 className='mt-5 text-xl font-extrabold text-white sm:text-2xl'>{item.title}</h3>
                    <p className='mt-1.5 text-xs font-bold uppercase tracking-wider text-[#ff9b8e]'>{item.subtitle}</p>
                    <p className='mt-3.5 text-sm leading-6 text-zinc-400'>{item.desc}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─── MOVING REEL: VISUAL RICHNESS (MOBILE OPTIMIZED) ─── */}
      <section className='overflow-hidden border-y border-white/10 bg-[#0c0c10] py-20'>
        <div className='mx-auto mb-10 max-w-7xl px-4 sm:px-8'>
          <p className='text-xs font-extrabold uppercase tracking-[.24em] text-[#ff6b57]'>
            Every Shoot Has Its Own Pulse
          </p>
          <div className='mt-3 grid gap-4 lg:grid-cols-[1fr_420px] lg:items-end'>
            <h2 className='font-display text-3xl font-extrabold leading-[.95] tracking-[-.05em] sm:text-5xl'>
              Veylo doesn't force every story to feel the same.
            </h2>
            <p className='text-sm leading-6 text-zinc-400 sm:text-base'>
              A quiet portrait needs room to breathe. A 30th birthday needs lift. A fashion lookbook needs nerve. The AI
              Director follows the photographs.
            </p>
          </div>
        </div>

        {[portfolioImages.slice(0, 11), portfolioImages.slice(11)].map((row, rowIndex) => (
          <div key={rowIndex} className={rowIndex === 0 ? 'mb-3.5 flex' : 'flex'}>
            <motion.div
              className='flex shrink-0 gap-3 px-2 sm:gap-4'
              animate={{ x: rowIndex === 0 ? ['0%', '-50%'] : ['-50%', '0%'] }}
              transition={{ duration: rowIndex === 0 ? 50 : 44, repeat: Infinity, ease: 'linear' }}>
              {[...row, ...row].map((image, index) => (
                <div
                  key={`${image.src}-${index}`}
                  className='group relative h-[240px] w-[170px] shrink-0 overflow-hidden rounded-2xl border border-white/10 sm:h-[350px] sm:w-[260px] sm:rounded-[1.5rem]'>
                  <img
                    src={image.src}
                    alt=''
                    loading='lazy'
                    className='h-full w-full object-cover transition duration-700 group-hover:scale-105'
                  />
                  <div className='absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80' />
                  <span className='absolute bottom-3 left-3 text-[8px] font-extrabold uppercase tracking-[.2em] text-white/80 sm:bottom-4 sm:left-4 sm:text-[9px]'>
                    {image.label}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>
        ))}
      </section>

      {/* ─── PHILOSOPHY: YOUR PHOTOS STAY YOUR PHOTOS ─── */}
      <section className='px-4 py-20 sm:px-8 sm:py-28 lg:py-36'>
        <div className='relative mx-auto min-h-[580px] max-w-7xl overflow-hidden rounded-[2.5rem] border border-white/10 sm:min-h-[660px]'>
          <img
            src='/veylo/pv-photographer.jpeg'
            alt='Photographer at work'
            className='absolute inset-0 h-full w-full object-cover object-center'
          />
          <div className='absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/40 lg:bg-gradient-to-r lg:from-black lg:via-black/70 lg:to-transparent' />
          <div className='relative z-10 flex min-h-[580px] max-w-2xl flex-col justify-end p-6 sm:min-h-[660px] sm:p-12 lg:justify-center'>
            <div className='inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.24em] text-[#ff9b8e]'>
              <Camera size={15} /> Your Art Stays Untouched
            </div>
            <h2 className='mt-4 font-display text-3xl font-extrabold leading-[.95] tracking-[-.05em] sm:text-5xl lg:text-6xl'>
              You craft the photographs.<br />
              <span className='text-[#ff9b8e]'>Veylo premieres them.</span>
            </h2>
            <p className='mt-5 text-sm leading-6 text-zinc-300 sm:text-base sm:leading-7'>
              Veylo does not generate synthetic pixels, crop your compositions, or modify your color grading.
              We don't build bloated CRMs, invoicing tools, or website builders.
            </p>
            <p className='mt-2 text-sm font-semibold leading-6 text-white sm:text-base'>
              Veylo does ONE thing: turns finished photoshoots into unforgettable client experiences.
            </p>
            <div className='mt-6 flex flex-wrap gap-2.5 sm:gap-4'>
              <div className='rounded-xl border border-white/15 bg-black/60 px-3.5 py-2 text-[11px] font-bold text-white backdrop-blur-md sm:text-xs'>
                ✓ No AI face altering
              </div>
              <div className='rounded-xl border border-white/15 bg-black/60 px-3.5 py-2 text-[11px] font-bold text-white backdrop-blur-md sm:text-xs'>
                ✓ Color grading preserved
              </div>
              <div className='rounded-xl border border-white/15 bg-black/60 px-3.5 py-2 text-[11px] font-bold text-white backdrop-blur-md sm:text-xs'>
                ✓ Pristine high-resolution
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── SOUND & VOICE: TYPOGRAPHY OR VOICE NARRATION ─── */}
      <section className='border-y border-white/10 bg-[#0c0c10] px-4 py-20 sm:px-8 sm:py-28 lg:py-36'>
        <div className='mx-auto max-w-7xl'>
          <div className='mb-12 grid gap-4 lg:grid-cols-[1fr_420px] lg:items-end'>
            <div>
              <p className='text-xs font-extrabold uppercase tracking-[.24em] text-[#ff6b57]'>Sound & Storytelling</p>
              <h2 className='mt-3 font-display text-4xl font-extrabold leading-[.94] tracking-[-.055em] sm:text-6xl'>
                Words that know when to speak.
              </h2>
            </div>
            <p className='text-sm leading-6 text-zinc-400 sm:text-base'>
              Keep it minimalist with music + typography, or let Veylo voice the story out loud. The photographer chooses.
            </p>
          </div>

          <div className='grid gap-6 md:grid-cols-2'>
            <div className='rounded-[2.2rem] border border-white/10 bg-[#111115] p-6 sm:p-10'>
              <div className='grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-[#ff6b57]'>
                <Type size={24} />
              </div>
              <h3 className='mt-6 text-2xl font-extrabold text-white'>Mode A: Music + Typography</h3>
              <p className='mt-3 text-sm leading-6 text-zinc-400'>
                Sleek editorial typography appears at key frames over an ambient cinema score. Subtle, understated, and
                sophisticated—perfect for high-fashion lookbooks and quiet personal portraits.
              </p>
              <div className='mt-6 rounded-xl border border-white/10 bg-black/40 p-3.5 text-xs italic text-zinc-300'>
                “Thirty enters the room before she says a word.”
              </div>
            </div>

            <div className='rounded-[2.2rem] border border-[#ff5a47]/30 bg-[#ff5a47]/[.05] p-6 sm:p-10'>
              <div className='grid h-12 w-12 place-items-center rounded-2xl bg-[#ff5a47]/15 text-[#ff7b69]'>
                <Mic2 size={24} />
              </div>
              <h3 className='mt-6 text-2xl font-extrabold text-white'>Mode B: Music + Voice Narration (TTS)</h3>
              <p className='mt-3 text-sm leading-6 text-zinc-300'>
                Veylo automatically crafts and speaks a warm voiceover that narrates the client's milestone. A feature
                built for viral TikTok and Instagram client reactions.
              </p>
              <div className='mt-6 rounded-xl border border-[#ff5a47]/30 bg-black/60 p-3.5 text-xs font-semibold text-[#ff9b8e]'>
                ✦ Spoken aloud: “She built this version of herself in rooms no one applauded...”
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── THEMES SHOWCASE ─── */}
      <section id='themes' className='px-4 py-20 sm:px-8 sm:py-28 lg:py-36'>
        <div className='mx-auto max-w-7xl'>
          <div className='flex flex-col justify-between gap-4 md:flex-row md:items-end'>
            <div>
              <p className='text-xs font-extrabold uppercase tracking-[.24em] text-[#ff6b57]'>Start With The Feeling</p>
              <h2 className='mt-3 font-display text-4xl font-extrabold tracking-[-.05em] sm:text-6xl'>
                Cinematic themes.<br />
                <span className='text-zinc-500'>Zero blank canvas.</span>
              </h2>
            </div>
            <p className='max-w-sm text-sm leading-6 text-zinc-400'>
              Enough aesthetic variety to match any shoot. Fast enough to publish in minutes without needing design skills.
            </p>
          </div>

          <div className='mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3'>
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
                <div className='absolute inset-x-0 bottom-0 p-6'>
                  <span className='mb-2.5 block h-1 w-10 rounded-full' style={{ backgroundColor: theme.color }} />
                  <h3 className='text-xl font-extrabold text-white sm:text-2xl'>{theme.name}</h3>
                  <p className='mt-1.5 text-[10px] font-bold uppercase tracking-[.18em] text-[#ff9b8e]'>{theme.fit}</p>
                  <p className='mt-1.5 text-xs leading-5 text-zinc-300 opacity-85'>{theme.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PRICING: FREE VS PRO (NO CREDITS, JUST UNLIMITED DELIVERY) ─── */}
      <section id='pricing' className='border-y border-white/10 bg-[#0c0c10] px-4 py-20 sm:px-8 sm:py-28 lg:py-36'>
        <div className='mx-auto max-w-7xl'>
          <div className='mx-auto max-w-3xl text-center'>
            <p className='text-xs font-extrabold uppercase tracking-[.24em] text-[#ff6b57]'>Transparent Pricing</p>
            <h2 className='mt-3 font-display text-[clamp(2.4rem,5vw,5.5rem)] font-extrabold leading-[.94] tracking-[-.055em]'>
              No credits. No token math.<br />
              <span className='text-transparent bg-clip-text bg-gradient-to-r from-[#ff7b69] via-[#ff5a47] to-[#ff9b8e]'>
                Just unlimited delivery.
              </span>
            </h2>
            <p className='mt-4 text-base leading-7 text-zinc-400 sm:text-lg'>
              No wondering if you have “15 tokens remaining.” Pay once a month and run your photography deliveries with total peace of mind.
            </p>
          </div>

          <div className='mt-14 grid gap-6 md:mx-auto md:max-w-5xl md:grid-cols-2 lg:gap-10'>
            {/* ─── TIER 1: VEYLO FREE ─── */}
            <div className='relative flex flex-col justify-between rounded-[2.5rem] border border-white/15 bg-[#111115] p-6 sm:p-10'>
              <div>
                <div className='flex items-center justify-between'>
                  <span className='text-xs font-black uppercase tracking-[.2em] text-zinc-400'>Veylo Free</span>
                  <span className='rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold text-zinc-400'>
                    TEST DRIVE
                  </span>
                </div>

                <div className='mt-5 flex items-baseline gap-2'>
                  <span className='text-4xl font-extrabold tracking-[-.05em] text-white sm:text-5xl'>₦0</span>
                  <span className='text-sm font-bold text-zinc-500'>/ month</span>
                </div>

                <p className='mt-3 text-sm font-semibold text-zinc-300'>
                  Give real value so you can genuinely experience Veylo with real clients.
                </p>

                <div className='mt-6 space-y-3 border-t border-white/10 pt-6 text-sm'>
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
                    <div key={feat} className='flex items-start gap-2.5 text-zinc-300'>
                      <Check size={15} className='mt-0.5 shrink-0 text-[#ff6b57]' />
                      <span className='text-xs sm:text-sm'>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className='mt-8'>
                <Link
                  to='/create'
                  className='flex w-full items-center justify-center gap-2.5 rounded-2xl border border-white/20 bg-white/5 py-4 text-sm font-extrabold text-white transition hover:bg-white/10'>
                  Start Free — 2 Stories/mo
                </Link>
                <p className='mt-2.5 text-center text-xs text-zinc-500'>No credit card required. Free forever.</p>
              </div>
            </div>

            {/* ─── TIER 2: VEYLO PRO (FEATURED) ─── */}
            <div className='relative flex flex-col justify-between overflow-hidden rounded-[2.5rem] border-2 border-[#ff5a47] bg-[#ff5a47]/[.08] p-6 shadow-[0_20px_80px_rgba(255,90,71,.2)] sm:p-10'>
              <div className='absolute -right-16 -top-16 h-72 w-72 rounded-full bg-[#ff5a47]/25 blur-[90px]' />

              <div className='relative z-10'>
                <div className='flex items-center justify-between'>
                  <span className='text-xs font-black uppercase tracking-[.2em] text-[#ff9b8e]'>Veylo Pro</span>
                  <span className='rounded-full bg-[#ff5a47] px-3.5 py-1 text-[10px] font-black uppercase tracking-wider text-white shadow-md'>
                    STUDIO STANDARD
                  </span>
                </div>

                <div className='mt-5 flex items-baseline gap-2'>
                  <span className='text-4xl font-extrabold tracking-[-.05em] text-white sm:text-5xl'>₦20,000</span>
                  <span className='text-sm font-bold text-zinc-400'>/ month</span>
                </div>

                <p className='mt-3 text-sm font-semibold text-white'>
                  The main product for working photographers and media studios.
                </p>

                <div className='mt-6 space-y-3 border-t border-white/15 pt-6 text-sm'>
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
                    <div key={feat} className='flex items-start gap-2.5 text-white'>
                      <Check size={15} className='mt-0.5 shrink-0 text-[#ff7b69]' />
                      <span className='text-xs font-medium sm:text-sm'>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className='relative z-10 mt-8'>
                <Link
                  to='/create'
                  className='flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[#ff5a47] py-4 text-sm font-extrabold text-white shadow-[0_12px_35px_rgba(255,90,71,.35)] transition hover:bg-[#ff7564]'>
                  Get Veylo Pro — ₦20,000/mo
                </Link>
                <p className='mt-2.5 text-center text-xs text-zinc-400'>
                  One client referral covers your entire year. Cancel anytime.
                </p>
              </div>
            </div>
          </div>

          {/* ─── FAIR USE ASSURANCE CALLOUT ─── */}
          <div className='mx-auto mt-10 max-w-4xl rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-md sm:p-6'>
            <div className='flex flex-col items-center gap-3.5 text-center sm:flex-row sm:text-left'>
              <div className='grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#ff5a47]/15 text-[#ff7b69]'>
                <ShieldCheck size={22} />
              </div>
              <div className='text-xs leading-5 text-zinc-400 sm:leading-6'>
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
      <section className='px-4 py-20 sm:px-8 sm:py-28 lg:py-36'>
        <div className='mx-auto max-w-4xl'>
          <div className='text-center'>
            <p className='text-xs font-extrabold uppercase tracking-[.24em] text-[#ff6b57]'>Clarity For Studios</p>
            <h2 className='mt-3 font-display text-3xl font-extrabold sm:text-5xl'>Frequently Asked Questions</h2>
          </div>

          <div className='mt-12 space-y-3.5'>
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={faq.q}
                  className='overflow-hidden rounded-2xl border border-white/10 bg-[#111115] transition'>
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className='flex w-full items-center justify-between p-5 text-left text-sm font-bold text-white hover:text-[#ff7b69] sm:p-6 sm:text-base'>
                    <span className='pr-4'>{faq.q}</span>
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
                        <div className='border-t border-white/10 px-5 pb-5 pt-3.5 text-xs leading-6 text-zinc-400 sm:px-6 sm:pb-6 sm:text-sm sm:leading-7'>
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
      <section className='px-4 pb-20 sm:px-8 sm:pb-28 lg:pb-36'>
        <div className='relative mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] border border-[#ff7b69]/30 bg-gradient-to-br from-[#d94738] via-[#ad3138] to-[#541f32] px-5 py-16 text-center shadow-[0_30px_100px_rgba(255,90,71,.25)] sm:px-12 sm:py-24 lg:py-28'>
          <div className='absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-[#ffc1b8]/20 blur-[100px]' />
          <div className='relative z-10'>
            <img src='/veylo/veylo-mark.svg' alt='' className='mx-auto h-14 w-14 rounded-2xl shadow-xl sm:h-16 sm:w-16' />
            <p className='mt-6 text-xs font-extrabold uppercase tracking-[.24em] text-[#ffd4ce]'>
              Don't just deliver photos. Premiere them.
            </p>
            <h2 className='mx-auto mt-3 max-w-4xl font-display text-4xl font-extrabold leading-[.94] tracking-[-.05em] text-white sm:text-6xl lg:text-7xl'>
              “Are my pictures ready?”<br />
              <span className='text-white'>Make the answer worth opening.</span>
            </h2>
            <p className='mx-auto mt-5 max-w-xl text-sm leading-6 text-white/80 sm:text-base sm:leading-7'>
              Premiere your next shoot with 2 free stories every month. When you're ready to make it your studio standard,
              upgrade to Unlimited for ₦20,000/month.
            </p>
            <div className='mt-8 flex flex-col justify-center gap-3.5 sm:flex-row'>
              <Link
                to='/create'
                className='group inline-flex items-center justify-center gap-3.5 rounded-2xl bg-white px-8 py-4 text-sm font-extrabold text-[#7c2027] transition hover:-translate-y-0.5 hover:bg-zinc-100'>
                <span>Create Your First Photo Story</span>
                <ArrowRight size={17} className='transition-transform group-hover:translate-x-1' />
              </Link>
              <Link
                to='/create'
                className='inline-flex items-center justify-center gap-2.5 rounded-2xl border border-white/30 bg-black/20 px-8 py-4 text-sm font-extrabold text-white backdrop-blur-md transition hover:bg-black/30'>
                Get Veylo Pro (₦20k/mo)
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
