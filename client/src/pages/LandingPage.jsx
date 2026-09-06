import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Footer from '../components/Footer.jsx';
import {
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Folder,
  Image as ImageIcon,
  Layers,
  Mic2,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Share2,
  ShieldCheck,
  Sliders,
  Sparkles,
  Type,
  Volume2,
  VolumeX,
  WandSparkles
} from 'lucide-react';

const heroPresets = [
  {
    id: 'ada',
    label: 'Birthday',
    icon: '🎂',
    client: 'Ada',
    tag: 'Ada at 30',
    occasion: '30th Birthday Portrait Premiere',
    photographer: 'Lumière Studios · Lagos',
    soundtrack: 'Golden Hour Reverie',
    audioUrl: '/audio/soundtrack-1.mp3',
    themeColor: '#ff5a47',
    coverImage: '/veylo/ada/ada-1.jpg',
    frames: [
      {
        image: '/veylo/ada/ada-1.jpg',
        act: 'ACT I',
        chapter: 'THE REVEAL',
        title: 'Thirty Enters the Room',
        line: 'Poised, radiant, and welcoming thirty on her own terms.',
        motion: 'zoom-in'
      },
      {
        image: '/veylo/ada/ada-2.jpg',
        act: 'ACT II',
        chapter: 'THE TOAST',
        title: 'Pour the Vintage',
        line: 'A glass raised to every quiet season that built this unwavering confidence.',
        motion: 'pan-down'
      },
      {
        image: '/veylo/ada/ada-3.jpg',
        act: 'ACT III',
        chapter: 'UNREHEARSED JOY',
        title: 'The Real Smile',
        line: 'The photograph that made everyone stop scrolling. Pure, effortless happiness.',
        motion: 'pan-right'
      },
      {
        image: '/veylo/ada/ada-4.jpg',
        act: 'ACT IV',
        chapter: 'THE CELEBRATION',
        title: 'A Life With Her Name On It',
        line: 'Surrounded by golden light, warmth, and the celebration she earned.',
        motion: 'zoom-in'
      },
      {
        image: '/veylo/ada/ada-5.jpg',
        act: 'ACT V',
        chapter: 'NOIR MASTERWORK',
        title: 'Timeless in Monochrome',
        line: 'Thirty. Whole, unapologetic, and only just beginning.',
        motion: 'zoom-out'
      }
    ]
  },
  {
    id: 'wedding',
    label: 'Wedding',
    icon: '💍',
    client: 'Tobi & Kemi',
    tag: 'Tobi & Kemi',
    occasion: 'Wedding Day Premiere',
    photographer: 'The Covenant Studios',
    soundtrack: 'Whispering Skies',
    audioUrl: '/audio/soundtrack-2.mp3',
    themeColor: '#f3a89e',
    coverImage: '/veylo/wedding/wedding-1.jpg',
    frames: [
      {
        image: '/veylo/wedding/wedding-1.jpg',
        act: 'ACT I',
        chapter: 'THE COVENANT',
        title: 'Before the World Arrives',
        line: 'Forehead to forehead, breathing in the quiet before forever begins.',
        motion: 'zoom-in'
      },
      {
        image: '/veylo/wedding/wedding-2.jpg',
        act: 'ACT II',
        chapter: 'FIRST LOOK',
        title: 'Ten Years in One Breath',
        line: 'From best friends to husband and wife. Zero doubts in the room.',
        motion: 'pan-down'
      },
      {
        image: '/veylo/wedding/wedding-3.jpg',
        act: 'ACT III',
        chapter: 'THE PROMISE',
        title: 'Two Hands, One Life',
        line: 'Held tight in velvet and silk. A sacred promise sealed.',
        motion: 'pan-right'
      },
      {
        image: '/veylo/wedding/wedding-4.jpg',
        act: 'ACT IV',
        chapter: 'THE VEIL',
        title: 'Radiance in Glass',
        line: 'Afternoon sunlight pouring through the pavilion onto the bride.',
        motion: 'zoom-in'
      },
      {
        image: '/veylo/wedding/wedding-5.jpg',
        act: 'ACT V',
        chapter: 'FINE ART NOIR',
        title: 'An Heirloom for Decades',
        line: 'Not just photo delivery. The heirloom story of where it all started.',
        motion: 'zoom-out'
      }
    ]
  },
  {
    id: 'editorial',
    label: 'Lookbook',
    icon: '👗',
    client: 'Studio Lookbook',
    tag: 'The September Issue',
    occasion: 'Haute Couture Lookbook',
    photographer: 'Vogue Africa Collective',
    soundtrack: 'Aura of Eternity',
    audioUrl: '/audio/soundtrack-3.mp3',
    themeColor: '#e0a96d',
    coverImage: '/veylo/editorial/editorial-1.jpg',
    frames: [
      {
        image: '/veylo/editorial/editorial-1.jpg',
        act: 'ACT I',
        chapter: 'PROLOGUE',
        title: 'The Polaroid Master',
        line: 'Instant film meets architectural framing. The face of the new collection.',
        motion: 'zoom-in'
      },
      {
        image: '/veylo/editorial/editorial-2.jpg',
        act: 'ACT II',
        chapter: 'THE GAZE',
        title: 'Commanding the Lens',
        line: 'Light sculpts what confidence built. The gaze speaks before the garment.',
        motion: 'pan-down'
      },
      {
        image: '/veylo/editorial/editorial-3.jpg',
        act: 'ACT III',
        chapter: 'TACTILE SOUL',
        title: 'Analog In High Contrast',
        line: 'Every grain and texture intentional. Refusing to sit quietly in the archive.',
        motion: 'pan-right'
      },
      {
        image: '/veylo/editorial/editorial-4.jpg',
        act: 'ACT IV',
        chapter: 'SHADOW & SILK',
        title: 'High Contrast Form',
        line: 'Sculptural lines that elevate commercial delivery into gallery art.',
        motion: 'zoom-in'
      },
      {
        image: '/veylo/editorial/editorial-5.jpg',
        act: 'ACT V',
        chapter: 'THE ARCHIVE',
        title: 'Signed & Delivered',
        line: 'Final campaign frames curated, sequenced, and ready for publication.',
        motion: 'zoom-out'
      }
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

export default function LandingPage({ onOpenAuth }) {
  const previewRef = useRef(null);
  const audioRef = useRef(null);
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0);
  const [activeFrame, setActiveFrame] = useState(0);
  const [storyStatus, setStoryStatus] = useState('cover'); // 'cover' | 'playing' | 'ending'
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [flashKey, setFlashKey] = useState(0);
  const [tapSide, setTapSide] = useState(null); // 'left' | 'right' | null
  const [activeWorkflowTab, setActiveWorkflowTab] = useState('photographer');
  const [openFaq, setOpenFaq] = useState(null);

  const currentPreset = heroPresets[selectedPresetIndex];
  const frames = currentPreset.frames;

  // Synchronize audio mute state
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Synchronize audio playback with story state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (storyStatus === 'playing' && isPlaying && !isHolding) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [storyStatus, isPlaying, isHolding]);

  // Synchronize track src when preset changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = heroPresets[selectedPresetIndex].audioUrl;
    audio.currentTime = 0;
    if (storyStatus === 'playing' && isPlaying) {
      audio.play().catch(() => {});
    }
  }, [selectedPresetIndex]);

  // Auto-advance frames during playback (pauses while holding down)
  useEffect(() => {
    if (storyStatus !== 'playing' || !isPlaying || isHolding) return undefined;
    const timer = window.setTimeout(() => {
      if (activeFrame >= frames.length - 1) {
        setStoryStatus('ending');
        setIsPlaying(false);
        if (audioRef.current) {
          audioRef.current.pause();
        }
        return;
      }
      setActiveFrame((f) => f + 1);
      setFlashKey((k) => k + 1);
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [activeFrame, isPlaying, isHolding, storyStatus, frames.length]);

  const handleSelectPreset = (index) => {
    setSelectedPresetIndex(index);
    setActiveFrame(0);
    setStoryStatus('cover');
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const startStory = () => {
    setActiveFrame(0);
    setStoryStatus('playing');
    setIsPlaying(true);
    setFlashKey(1);
    const audio = audioRef.current;
    if (audio) {
      audio.src = heroPresets[selectedPresetIndex].audioUrl;
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
    previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const togglePlayPause = (e) => {
    e?.stopPropagation();
    setIsPlaying((prev) => !prev);
  };

  const toggleMute = (e) => {
    e?.stopPropagation();
    setIsMuted((prev) => !prev);
  };

  const restartStory = (e) => {
    e?.stopPropagation();
    setActiveFrame(0);
    setStoryStatus('playing');
    setIsPlaying(true);
    setFlashKey((k) => k + 1);
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
  };

  const handlePrevFrame = (e) => {
    e?.stopPropagation();
    if (activeFrame > 0) {
      setActiveFrame((f) => f - 1);
      setFlashKey((k) => k + 1);
    } else {
      setActiveFrame(0);
      setFlashKey((k) => k + 1);
    }
    setTapSide('left');
    setTimeout(() => setTapSide(null), 280);
  };

  const handleNextFrame = (e) => {
    e?.stopPropagation();
    if (activeFrame < frames.length - 1) {
      setActiveFrame((f) => f + 1);
      setFlashKey((k) => k + 1);
    } else {
      setStoryStatus('ending');
      setIsPlaying(false);
      if (audioRef.current) audioRef.current.pause();
    }
    setTapSide('right');
    setTimeout(() => setTapSide(null), 280);
  };

  const getMotionAnimation = (motionType) => {
    switch (motionType) {
      case 'pan-down':
        return {
          initial: { scale: 1.15, y: -16, x: 0 },
          animate: { scale: 1.05, y: 10, x: 0 },
          transition: { duration: 5.5, ease: 'linear' }
        };
      case 'pan-right':
        return {
          initial: { scale: 1.06, x: -14, y: 0 },
          animate: { scale: 1.16, x: 10, y: 0 },
          transition: { duration: 5.5, ease: 'linear' }
        };
      case 'zoom-out':
        return {
          initial: { scale: 1.18, x: 0, y: 0 },
          animate: { scale: 1.02, x: 0, y: 0 },
          transition: { duration: 5.5, ease: 'linear' }
        };
      case 'zoom-in':
      default:
        return {
          initial: { scale: 1.02, x: 0, y: 0 },
          animate: { scale: 1.16, x: -6, y: -4 },
          transition: { duration: 5.5, ease: 'linear' }
        };
    }
  };

  // Reusable Luxury Interactive Story Simulator
  const renderPhoneSimulator = () => (
    <div className='relative mx-auto w-full max-w-[320px] sm:max-w-[360px]'>
      
      {/* Hidden Real HTML5 Audio Element */}
      <audio
        ref={audioRef}
        src={currentPreset.audioUrl}
        loop
        playsInline
        preload='auto'
        className='hidden'
      />

      {/* Editorial Story Switcher */}
      <div className='mb-4 flex items-center justify-center gap-1.5 sm:gap-2'>
        {heroPresets.map((preset, idx) => (
          <button
            key={preset.id}
            onClick={() => handleSelectPreset(idx)}
            className={`rounded-full px-3.5 py-1 text-[10.5px] sm:text-[11.5px] font-semibold tracking-wide transition ${
              selectedPresetIndex === idx
                ? 'bg-white text-black shadow-[0_2px_14px_rgba(255,255,255,0.25)]'
                : 'border border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white hover:border-white/20'
            }`}>
            {preset.tag}
          </button>
        ))}
      </div>

      {/* Showcase Device Container with Glow & Background Prints */}
      <div className='relative mx-auto w-full max-w-[275px] sm:max-w-[315px]'>
        
        {/* Dynamic Studio Backlight Glow that breathes with playback */}
        <div
          className='pointer-events-none absolute -inset-6 rounded-[3.5rem] opacity-40 blur-2xl transition-all duration-1000 -z-10'
          style={{
            background: isPlaying
              ? `radial-gradient(circle, ${currentPreset.themeColor} 0%, transparent 70%)`
              : 'transparent'
          }}
        />

        {/* Cohesive Shoot Prints in Background (Belonging to the EXACT SAME photoshoot) */}
        <div className='pointer-events-none absolute -left-4 top-8 h-[82%] w-[48%] -rotate-6 overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 opacity-35 shadow-2xl sm:-left-7'>
          <img
            src={frames[1]?.image || currentPreset.coverImage}
            alt=''
            className='h-full w-full object-cover contrast-110'
          />
          <div className='absolute inset-0 bg-black/40' />
        </div>
        <div className='pointer-events-none absolute -right-4 bottom-8 h-[74%] w-[44%] rotate-6 overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 opacity-35 shadow-2xl sm:-right-6'>
          <img
            src={frames[2]?.image || currentPreset.coverImage}
            alt=''
            className='h-full w-full object-cover contrast-110'
          />
          <div className='absolute inset-0 bg-black/40' />
        </div>

        {/* Central Premiere Screen Mockup */}
        <div className='relative mx-auto aspect-[9/16] w-full overflow-hidden rounded-[2.5rem] sm:rounded-[2.8rem] border-[2.5px] sm:border-[3px] border-white/20 bg-zinc-950 p-2 sm:p-2.5 shadow-[0_30px_100px_rgba(0,0,0,0.95)] ring-1 ring-white/10'>
          <div className='relative h-full w-full overflow-hidden rounded-[2.1rem] sm:rounded-[2.3rem] bg-black'>
            
            {/* Dynamic Island Pill Notch */}
            <div className='absolute left-1/2 top-2 z-40 flex h-3.5 w-20 -translate-x-1/2 items-center justify-between rounded-full bg-black px-2.5 ring-1 ring-white/10'>
              <div className='h-1.5 w-1.5 rounded-full bg-white/20' />
              <div className={`h-1.5 w-1.5 rounded-full transition-colors ${isPlaying ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-zinc-600'}`} />
            </div>

            {/* Camera Strobe Flash Transition on frame changes */}
            <AnimatePresence>
              {flashKey > 0 && storyStatus === 'playing' && (
                <motion.div
                  key={`flash-${flashKey}`}
                  initial={{ opacity: 0.85 }}
                  animate={{ opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.38, ease: 'easeOut' }}
                  className='pointer-events-none absolute inset-0 z-30 bg-gradient-to-t from-white/95 via-amber-100/70 to-transparent mix-blend-screen'
                />
              )}
            </AnimatePresence>

            {/* Tap Navigation Feedback Indicators */}
            <AnimatePresence>
              {tapSide === 'left' && (
                <motion.div
                  initial={{ opacity: 0.8, x: 4 }}
                  animate={{ opacity: 0, x: -10 }}
                  exit={{ opacity: 0 }}
                  className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 z-40 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md border border-white/20'>
                  <ChevronLeft size={18} />
                </motion.div>
              )}
              {tapSide === 'right' && (
                <motion.div
                  initial={{ opacity: 0.8, x: -4 }}
                  animate={{ opacity: 0, x: 10 }}
                  exit={{ opacity: 0 }}
                  className='pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 z-40 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md border border-white/20'>
                  <ChevronRight size={18} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Paused Indicator When Finger/Mouse is Held Down */}
            <AnimatePresence>
              {isHolding && storyStatus === 'playing' && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className='pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 rounded-full border border-white/20 bg-black/85 px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-white backdrop-blur-md shadow-2xl'>
                  <Pause size={10} fill='currentColor' /> Paused
                </motion.div>
              )}
            </AnimatePresence>

            {/* Story State Renderer */}
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
                  <div className='absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/30' />
                  
                  {/* Subtle film grain & vignette */}
                  <div className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.75)_100%)]' />

                  {/* Veylo Logo */}
                  <div className='absolute inset-x-0 top-[15%] flex flex-col items-center px-4 text-center'>
                    <img src='/veylo/veylo-mark.svg' alt='' className='h-10 w-10 rounded-xl shadow-lg' />
                    <span className='mt-2.5 rounded-full border border-white/20 bg-black/50 px-3 py-0.5 text-[8px] font-black uppercase tracking-[.22em] text-[#ff9b8e] backdrop-blur-md'>
                      {currentPreset.photographer}
                    </span>
                  </div>

                  {/* Cover Details & Play Button */}
                  <div className='absolute inset-x-0 bottom-0 p-5 text-center'>
                    <span className='inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[8px] font-extrabold uppercase tracking-widest text-white/90 backdrop-blur-md'>
                      Client Premiere
                    </span>
                    <p className='mt-2 font-serif text-2xl font-bold text-white sm:text-3xl drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]'>
                      {currentPreset.tag}
                    </p>
                    <p className='mt-0.5 text-[11px] font-medium text-white/80'>
                      {currentPreset.occasion}
                    </p>

                    <div className='mt-2.5 flex items-center justify-center gap-1.5 text-[8.5px] font-semibold text-white/85'>
                      <span className='inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/50 px-2 py-0.5'>
                        <Music2 size={9} className='text-[#ff7b69]' /> {currentPreset.soundtrack}
                      </span>
                    </div>

                    <button
                      onClick={startStory}
                      className='mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff5a47] py-3 text-xs font-black text-white shadow-xl shadow-[#ff5a47]/35 transition hover:bg-[#ff7564] active:scale-95 cursor-pointer'>
                      <Play size={12} fill='currentColor' /> Watch Premiere
                    </button>
                    <p className='mt-2 text-[8px] font-bold uppercase tracking-wider text-white/50'>
                      Music & photographs synced
                    </p>
                  </div>
                </motion.div>
              )}

              {/* ─── STATE 2: PLAYING STORY FRAMES ─── */}
              {storyStatus === 'playing' && (
                <motion.div
                  key={`frame-${currentPreset.id}-${activeFrame}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.55 }}
                  className='absolute inset-0 select-none'>
                  
                  {/* Photo with Ken Burns Motion Effect */}
                  {(() => {
                    const m = getMotionAnimation(frames[activeFrame].motion);
                    return (
                      <motion.img
                        src={frames[activeFrame].image}
                        alt=''
                        initial={m.initial}
                        animate={m.animate}
                        transition={m.transition}
                        className='absolute inset-0 h-full w-full object-cover will-change-transform'
                      />
                    );
                  })()}

                  {/* Golden Dust / Sparkle Particle Overlay */}
                  <div className='pointer-events-none absolute inset-0 z-10 overflow-hidden opacity-35'>
                    <div className='absolute top-1/4 left-1/4 h-1.5 w-1.5 rounded-full bg-amber-300 blur-[0.6px] animate-pulse' />
                    <div className='absolute top-2/3 right-1/4 h-2 w-2 rounded-full bg-amber-100 blur-[1px] animate-pulse' style={{ animationDelay: '1.2s' }} />
                    <div className='absolute bottom-1/3 left-1/5 h-1 w-1 rounded-full bg-amber-200 blur-[0.4px] animate-pulse' style={{ animationDelay: '0.6s' }} />
                  </div>

                  {/* Cinematic Darkroom Lens Vignette */}
                  <div className='pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_center,transparent_42%,rgba(0,0,0,0.8)_100%)]' />

                  {/* 50/50 Interactive Tap Navigation Zones (Tap Left: Prev, Tap Right: Next, Hold: Pause) */}
                  <div
                    className='absolute inset-0 z-20 flex'
                    onMouseDown={() => setIsHolding(true)}
                    onMouseUp={() => setIsHolding(false)}
                    onTouchStart={() => setIsHolding(true)}
                    onTouchEnd={() => setIsHolding(false)}>
                    <button
                      type='button'
                      onClick={handlePrevFrame}
                      className='h-full w-1/2 cursor-pointer select-none outline-none'
                      aria-label='Previous frame'
                    />
                    <button
                      type='button'
                      onClick={handleNextFrame}
                      className='h-full w-1/2 cursor-pointer select-none outline-none'
                      aria-label='Next frame'
                    />
                  </div>

                  {/* High-Fashion Editorial Typography Overlay */}
                  <div className='pointer-events-none absolute inset-x-0 bottom-0 z-25 bg-gradient-to-t from-black via-black/80 to-transparent px-4 pb-4 pt-14 text-left'>
                    <motion.div
                      key={`caption-${selectedPresetIndex}-${activeFrame}`}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.45, ease: 'easeOut', delay: 0.1 }}
                      className='space-y-1.5'>
                      <div className='flex items-center justify-between'>
                        <span className='inline-flex items-center gap-1 rounded-md border border-[#ff7b69]/40 bg-[#ff5a47]/20 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] text-[#ff9b8e] backdrop-blur-md'>
                          <Sparkles size={8} className='text-[#ff7b69]' />
                          {frames[activeFrame].act} · {frames[activeFrame].chapter}
                        </span>
                        <span className='text-[8.5px] font-mono font-bold tracking-widest text-white/50'>
                          0{activeFrame + 1} / 0{frames.length}
                        </span>
                      </div>

                      <h3 className='font-serif text-lg font-bold leading-snug text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]'>
                        {frames[activeFrame].title}
                      </h3>

                      <p className='text-[11px] leading-relaxed text-zinc-200 drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]'>
                        {frames[activeFrame].line}
                      </p>

                      <div className='flex items-center justify-between pt-1 text-[7.5px] font-medium text-white/45 tracking-wider'>
                        <span>{currentPreset.photographer}</span>
                        <span className='italic opacity-80'>Tap sides to navigate</span>
                      </div>
                    </motion.div>
                  </div>
                </motion.div>
              )}

              {/* ─── STATE 3: FINALE & GALLERY REVEAL ─── */}
              {storyStatus === 'ending' && (
                <motion.div
                  key='ending'
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className='absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_top,#4a1a18_0%,#180e11_45%,#050505_100%)] p-5 text-center'>
                  
                  {/* Fan of completed photos from this exact shoot */}
                  <div className='relative mb-5 h-20 w-32'>
                    {[frames[0].image, frames[1].image, frames[2].image].map((img, idx) => (
                      <img
                        key={img}
                        src={img}
                        alt=''
                        className={`absolute left-1/2 top-1/2 h-16 w-12 rounded-lg border-2 object-cover shadow-2xl ${
                          idx === 0
                            ? '-translate-x-[125%] -translate-y-1/2 -rotate-12 border-white/20'
                            : idx === 1
                            ? 'z-10 -translate-x-1/2 -translate-y-1/2 border-[#ff7b69]'
                            : 'translate-x-[25%] -translate-y-1/2 rotate-12 border-white/20'
                        }`}
                      />
                    ))}
                  </div>

                  <span className='rounded-full border border-[#ff7b69]/40 bg-[#ff5a47]/15 px-2.5 py-0.5 text-[8px] font-black uppercase tracking-[.2em] text-[#ff9b8e]'>
                    Premiere Concluded
                  </span>
                  <p className='mt-2 font-serif text-xl font-bold text-white'>
                    {currentPreset.client}'s Photos Are Ready
                  </p>
                  <p className='mt-1 text-[10px] leading-relaxed text-zinc-300'>
                    All high-resolution retouched photographs unlocked in the client gallery.
                  </p>

                  <div className='mt-4 w-full space-y-2'>
                    <button className='flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#ff5a47] py-2.5 text-[10px] font-black text-white shadow-lg shadow-[#ff5a47]/30 transition hover:bg-[#ff7564]'>
                      <ImageIcon size={11} /> Open Client Photo Gallery
                    </button>
                    <button className='flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 py-2 text-[10px] font-bold text-white transition hover:bg-white/10'>
                      <Download size={11} /> Download All (High-Res ZIP)
                    </button>
                    <button className='flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 py-2 text-[10px] font-bold text-white transition hover:bg-white/10'>
                      <Share2 size={11} /> Share Photo Story
                    </button>
                  </div>

                  <button
                    onClick={restartStory}
                    className='mt-3.5 flex items-center gap-1 text-[8.5px] font-black uppercase tracking-wider text-white/50 hover:text-white transition cursor-pointer'>
                    <RotateCcw size={9} /> Replay premiere
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Top Bar: Progress Segments, Live Audio Equalizer & Controls */}
            {storyStatus === 'playing' && (
              <div className='pointer-events-auto absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-black/90 via-black/50 to-transparent px-3 pb-4 pt-6'>
                
                {/* Progress Segments */}
                <div className='flex gap-1'>
                  {frames.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveFrame(idx);
                        setFlashKey((k) => k + 1);
                        setIsPlaying(true);
                      }}
                      className='h-[2.5px] flex-1 overflow-hidden rounded-full bg-white/25 cursor-pointer'>
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

                {/* Metadata & Audio Equalizer */}
                <div className='mt-2 flex items-center justify-between'>
                  <div className='flex items-center gap-1.5'>
                    <img src='/veylo/veylo-mark.svg' alt='' className='h-5 w-5 rounded-md' />
                    <div className='text-left'>
                      <p className='text-[9px] font-black leading-none text-white'>{currentPreset.tag}</p>
                      <div className='mt-0.5 flex items-center gap-1 text-[7.5px] font-semibold text-[#ff9b8e]'>
                        {/* Live Soundwave Bars */}
                        <div className='flex items-end gap-[1.5px] h-2.5'>
                          <span className={`w-[1.5px] bg-[#ff5a47] rounded-full transition-all ${isPlaying && !isMuted ? 'animate-pulse h-2.5' : 'h-1'}`} />
                          <span className={`w-[1.5px] bg-[#ff7b69] rounded-full transition-all ${isPlaying && !isMuted ? 'animate-pulse h-2' : 'h-1.5'}`} style={{ animationDelay: '0.15s' }} />
                          <span className={`w-[1.5px] bg-[#ff9b8e] rounded-full transition-all ${isPlaying && !isMuted ? 'animate-pulse h-2.5' : 'h-1'}`} style={{ animationDelay: '0.3s' }} />
                          <span className={`w-[1.5px] bg-[#ff5a47] rounded-full transition-all ${isPlaying && !isMuted ? 'animate-pulse h-1.5' : 'h-1'}`} style={{ animationDelay: '0.2s' }} />
                        </div>
                        <span className='truncate max-w-[110px]'>{currentPreset.soundtrack}</span>
                      </div>
                    </div>
                  </div>

                  <div className='flex items-center gap-1.5'>
                    <button
                      onClick={toggleMute}
                      className='grid h-6 w-6 place-items-center rounded-full bg-black/50 text-white/90 border border-white/10 hover:bg-black/80 transition cursor-pointer'
                      title={isMuted ? 'Unmute audio' : 'Mute audio'}>
                      {isMuted ? <VolumeX size={10} /> : <Volume2 size={10} />}
                    </button>
                    <button
                      onClick={togglePlayPause}
                      className='grid h-6 w-6 place-items-center rounded-full bg-black/50 text-white border border-white/10 hover:bg-black/80 transition cursor-pointer'
                      title={isPlaying ? 'Pause' : 'Play'}>
                      {isPlaying ? <Pause size={10} /> : <Play size={10} fill='currentColor' />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className='min-h-screen w-full overflow-x-hidden bg-[#070709] text-white selection:bg-[#ff5a47] selection:text-white'>
      
      {/* ─── HERO SECTION ─── */}
      <section className='relative px-4 pb-12 pt-20 sm:px-8 sm:pb-20 sm:pt-32 lg:min-h-[100svh] lg:pt-36'>
        {/* Ambient atmospheric glows */}
        <div className='pointer-events-none absolute left-[-15%] top-[-15%] h-[400px] w-[400px] rounded-full bg-[#ff5a47]/15 blur-[140px] sm:h-[650px] sm:w-[650px]' />
        <div className='pointer-events-none absolute right-[-10%] top-[10%] h-[350px] w-[350px] rounded-full bg-[#ff8c7a]/10 blur-[130px] sm:h-[500px] sm:w-[500px]' />

        {/* Subtle grid lines */}
        <div className='pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_75%_65%_at_50%_15%,#000_60%,transparent_100%)]' />

        <div className='relative mx-auto max-w-7xl md:min-h-[calc(100svh-11rem)] md:grid md:grid-cols-2 lg:grid-cols-[1.05fr_0.95fr] md:items-center md:gap-8 lg:gap-12'>
          
          {/* Main Content Column */}
          <div className='relative z-10 w-full text-center md:text-left'>
            
            {/* 1. Editorial Category Positioning (Desktop only) */}
            <div className='hidden md:inline-flex items-center gap-2 mb-4'>
              <span className='h-1.5 w-1.5 rounded-full bg-[#ff5a47]' />
              <span className='text-[11px] font-bold uppercase tracking-[0.24em] text-[#ff8c7a]'>
                The Photo Delivery Platform for Photographers
              </span>
            </div>

            {/* 2. Master Command H1 (Architectural Sans + High-Fashion Serif Italic) */}
            <h1 className='font-display text-[2.4rem] sm:text-5xl lg:text-[4.4rem] font-extrabold leading-[1.02] tracking-[-0.035em] text-white'>
              Don't just deliver photos.<br />
              <span className='font-serif italic font-normal text-[#ff7b69] tracking-normal'>
                Premiere them.
              </span>
            </h1>

            {/* ON MOBILE ONLY: The Interactive Photo Story sits right under the headline so it is seen immediately! */}
            <div className='my-5 md:hidden' ref={previewRef}>
              {renderPhoneSimulator()}
            </div>

            {/* 3. Supporting Copy */}
            <p className='mx-auto mt-4 max-w-lg text-sm leading-relaxed text-zinc-300 sm:mt-6 sm:text-base sm:leading-7 md:mx-0'>
              Transform completed photoshoots into cinematic, interactive Photo Stories your clients can experience,
              share and download. Built for photographers and media studios who want final delivery to feel as premium as the photography itself.
            </p>

            {/* 4. CTAs */}
            <div className='mt-5 flex flex-col justify-center gap-3 sm:mt-8 sm:flex-row md:justify-start'>
              <Link
                to='/create'
                className='group inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-[#ff5a47] px-6 py-3.5 text-sm font-black text-white shadow-[0_12px_35px_rgba(255,90,71,0.32)] transition hover:-translate-y-0.5 hover:bg-[#ff7564] active:translate-y-0 sm:w-auto sm:px-7 sm:py-4'>
                <span>Create Your First Photo Story</span>
                <ArrowRight size={16} className='transition-transform group-hover:translate-x-1' />
              </Link>
              <button
                onClick={startStory}
                className='hidden md:inline-flex items-center justify-center gap-2.5 rounded-2xl border border-white/15 bg-white/[.05] px-5 py-3.5 text-sm font-bold text-zinc-200 backdrop-blur-xl transition hover:bg-white/[.1] sm:w-auto sm:px-6 sm:py-4'>
                <span className='grid h-5 w-5 place-items-center rounded-full bg-[#ff5a47]/20 text-[#ff7b69]'>
                  <Play size={10} fill='currentColor' />
                </span>
                <span>Watch Story Premiere</span>
              </button>
            </div>

            {/* 5. Trust & Friction Badges */}
            <div className='mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-[11px] font-medium text-zinc-400 sm:mt-6 sm:text-xs md:justify-start'>
              <span className='flex items-center gap-1.5'>
                <Check size={13} className='text-[#ff6b57]' /> 2 Stories free / mo
              </span>
              <span className='flex items-center gap-1.5'>
                <Check size={13} className='text-[#ff6b57]' /> Link-ready
              </span>
              <span className='flex items-center gap-1.5'>
                <Check size={13} className='text-[#ff6b57]' /> Full gallery & downloads
              </span>
              <span className='flex items-center gap-1.5'>
                <Check size={13} className='text-[#ff6b57]' /> No card required
              </span>
            </div>
          </div>

          {/* ON DESKTOP ONLY: The Interactive Photo Story Showcase sits in the right column */}
          <div className='hidden md:flex justify-center'>
            {renderPhoneSimulator()}
          </div>

        </div>
      </section>

      {/* ─── VALUE PILLARS TICKER (INFINITE SMOOTH MARQUEE) ─── */}
      <section className='overflow-hidden border-y border-white/10 bg-[#0c0c10] py-3.5'>
        <div className='animate-marquee flex items-center gap-8 text-[11px] font-extrabold uppercase tracking-[.22em] text-zinc-400'>
          {[1, 2].map((loop) => (
            <React.Fragment key={loop}>
              <span className='flex items-center gap-2 text-white'><span className='text-[#ff5a47]'>✦</span> Photos Stay Photos</span>
              <span className='flex items-center gap-2 text-white'><span className='text-[#ff5a47]'>✦</span> Veylo AI Director</span>
              <span className='flex items-center gap-2 text-white'><span className='text-[#ff5a47]'>✦</span> Editorial Storytelling</span>
              <span className='flex items-center gap-2 text-white'><span className='text-[#ff5a47]'>✦</span> Music & Narration</span>
              <span className='flex items-center gap-2 text-white'><span className='text-[#ff5a47]'>✦</span> High-Res Client Downloads</span>
              <span className='flex items-center gap-2 text-white'><span className='text-[#ff5a47]'>✦</span> Link-Ready Delivery</span>
            </React.Fragment>
          ))}
        </div>
      </section>

      {/* ─── THE TRANSFORMATION: BEFORE VS AFTER (VIRAL HOOK) ─── */}
      <section className='px-4 py-16 sm:px-8 sm:py-24 lg:py-32'>
        <div className='mx-auto max-w-7xl'>
          <div className='grid gap-4 lg:grid-cols-2 lg:items-end'>
            <div>
              <p className='text-xs font-extrabold uppercase tracking-[.24em] text-[#ff6b57]'>
                The Client Reaction Is Your Brand
              </p>
              <h2 className='mt-2 font-display text-2xl font-extrabold leading-[1.05] tracking-[-.04em] sm:text-4xl lg:text-5xl'>
                Photographers still delivering shoots like this?
              </h2>
            </div>
            <p className='text-sm leading-relaxed text-zinc-400 sm:text-base'>
              After weeks of planning, directing, lighting, and meticulous retouching, the way your photographs arrive
              either flattens the work—or creates a client for life.
            </p>
          </div>

          <div className='mt-10 grid gap-5 lg:grid-cols-2'>
            {/* The Cold Delivery */}
            <div className='flex flex-col justify-between rounded-3xl border border-white/10 bg-zinc-950 p-6 sm:p-8'>
              <div>
                <div className='flex items-center justify-between text-xs font-black uppercase tracking-[.18em] text-zinc-500'>
                  <span>THE OLD WAY</span>
                  <span className='rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-zinc-400'>
                    184 RAW / JPG FILES
                  </span>
                </div>

                <div className='mt-8 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900 text-zinc-500'>
                  <Folder size={28} strokeWidth={1.2} />
                </div>

                <h3 className='mt-5 font-display text-xl font-bold text-zinc-300 sm:text-2xl'>
                  “Hi, here is your Google Drive link.”
                </h3>
                <p className='mt-2.5 text-xs leading-relaxed text-zinc-400 sm:text-sm'>
                  Opened on a phone. Pinched, zoomed, scrolled in silence. Downloaded frantically. Closed. Zero emotional
                  crescendo. Your art ends in a spreadsheet of filenames.
                </p>
              </div>

              <div className='mt-6 rounded-xl border border-white/5 bg-black/40 p-3 text-xs font-mono text-zinc-500'>
                <p className='truncate'>drive.google.com/drive/folders/7xK9... · 184 items · 4.8 GB</p>
              </div>
            </div>

            {/* The Veylo Premiere */}
            <div className='relative flex flex-col justify-between overflow-hidden rounded-3xl border border-[#ff5a47]/40 bg-[#ff5a47]/[.06] p-6 sm:p-8'>
              <div className='absolute -right-16 -top-16 h-60 w-60 rounded-full bg-[#ff5a47]/20 blur-[90px]' />

              <div className='relative z-10'>
                <div className='flex items-center justify-between text-xs font-black uppercase tracking-[.18em] text-[#ff9b8e]'>
                  <span className='flex items-center gap-1.5'>
                    <Sparkles size={13} className='text-[#ff5a47]' /> THE VEYLO PREMIERE
                  </span>
                  <span className='rounded-full border border-[#ff5a47]/30 bg-[#ff5a47]/15 px-2.5 py-0.5 text-[10px] font-bold text-[#ff9b8e]'>
                    EXPERIENCE FIRST
                  </span>
                </div>

                <p className='mt-6 font-serif text-xl font-semibold leading-snug text-white sm:text-3xl'>
                  Her name. Her soundtrack. Her photographs, revealed one moment at a time.
                </p>

                <p className='mt-3 text-xs leading-relaxed text-zinc-300 sm:text-sm sm:leading-6'>
                  Music begins. Editorial chapter lines appear. Subtle motion brings each portrait alive. Then, the full
                  gallery unlocks for high-resolution individual and bulk downloads.
                </p>
              </div>

              <div className='relative z-10 mt-6 rounded-xl border border-[#ff5a47]/30 bg-black/60 p-3 text-xs font-medium text-[#ff9b8e] backdrop-blur-xl'>
                <div className='flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between'>
                  <span className='font-mono font-bold'>veylo.com.ng/s/ada-at-30</span>
                  <span className='text-[10px] font-black uppercase tracking-wider text-white/80'>Link-ready</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── VEYLO AI DIRECTOR: THE CORE CONCEPT ─── */}
      <section id='ai-director' className='border-y border-white/10 bg-[#0c0c10] px-4 py-16 sm:px-8 sm:py-24 lg:py-32'>
        <div className='mx-auto max-w-7xl'>
          <div className='mx-auto max-w-3xl text-center'>
            <div className='inline-flex items-center gap-2 rounded-full border border-[#ff5a47]/30 bg-[#ff5a47]/10 px-3.5 py-1 text-[10px] font-extrabold uppercase tracking-[.2em] text-[#ff9b8e] sm:text-xs'>
              <WandSparkles size={13} /> The Veylo AI Director
            </div>
            <h2 className='mt-4 font-display text-2xl font-extrabold leading-[1.05] tracking-[-.04em] sm:text-4xl lg:text-5xl'>
              Veylo directs the delivery.
            </h2>
            <p className='mt-3 text-xs leading-relaxed text-zinc-400 sm:text-base'>
              Instead of presenting Veylo as just “captions + a gallery + music”, we built an AI Director.
              It understands the emotional arc of your shoot, chooses the strongest hook, and stages the premiere automatically.
            </p>
          </div>

          <div className='mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            {aiDirectorFeatures.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className='group rounded-2xl border border-white/10 bg-white/[.02] p-5 transition duration-300 hover:border-[#ff5a47]/40 hover:bg-white/[.04] sm:p-6'>
                  <div className='flex items-center justify-between'>
                    <div className='grid h-10 w-10 place-items-center rounded-xl bg-[#ff5a47]/10 text-[#ff7b69]'>
                      <Icon size={18} />
                    </div>
                    <span className='font-mono text-xs font-bold text-zinc-600'>0{index + 1}</span>
                  </div>
                  <h3 className='mt-4 text-base font-extrabold text-white sm:text-lg'>{feature.title}</h3>
                  <p className='mt-2 text-xs leading-relaxed text-zinc-400 sm:text-sm'>{feature.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── THE TWO SIDES OF VEYLO: STUDIO WORKFLOW VS CLIENT PREMIERE ─── */}
      <section id='how-it-works' className='px-4 py-16 sm:px-8 sm:py-24 lg:py-32'>
        <div className='mx-auto max-w-7xl'>
          <div className='mx-auto max-w-2xl text-center'>
            <p className='text-xs font-extrabold uppercase tracking-[.24em] text-[#ff6b57]'>End-To-End Experience</p>
            <h2 className='mt-2 font-display text-2xl font-extrabold leading-[1.05] tracking-[-.04em] sm:text-4xl lg:text-5xl'>
              Built for the studio.<br />
              <span className='text-zinc-500'>Felt by the client.</span>
            </h2>
            
            {/* Segmented Tab Switcher */}
            <div className='mt-6 flex justify-center'>
              <div className='grid w-full max-w-xs grid-cols-2 rounded-xl border border-white/15 bg-white/5 p-1 backdrop-blur-xl'>
                <button
                  onClick={() => setActiveWorkflowTab('photographer')}
                  className={`rounded-lg py-2 text-center text-xs font-extrabold transition ${
                    activeWorkflowTab === 'photographer'
                      ? 'bg-[#ff5a47] text-white shadow-md shadow-[#ff5a47]/25'
                      : 'text-zinc-400 hover:text-white'
                  }`}>
                  Photographer (3m)
                </button>
                <button
                  onClick={() => setActiveWorkflowTab('client')}
                  className={`rounded-lg py-2 text-center text-xs font-extrabold transition ${
                    activeWorkflowTab === 'client'
                      ? 'bg-[#ff5a47] text-white shadow-md shadow-[#ff5a47]/25'
                      : 'text-zinc-400 hover:text-white'
                  }`}>
                  Client Premiere
                </button>
              </div>
            </div>
          </div>

          <div className='mt-10'>
            {activeWorkflowTab === 'photographer' ? (
              <div className='grid gap-4 md:grid-cols-3'>
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
                    className='rounded-2xl border border-white/10 bg-[#111115] p-5 transition hover:border-white/20 sm:p-6'>
                    <span className='font-mono text-xs font-bold text-[#ff6b57]'>{item.step}</span>
                    <h3 className='mt-3 text-lg font-extrabold text-white sm:text-xl'>{item.title}</h3>
                    <p className='mt-1 text-[10px] font-bold uppercase tracking-wider text-[#ff9b8e] sm:text-xs'>{item.subtitle}</p>
                    <p className='mt-2.5 text-xs leading-relaxed text-zinc-400 sm:text-sm'>{item.desc}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className='grid gap-4 md:grid-cols-3'>
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
                    className='rounded-2xl border border-white/10 bg-[#111115] p-5 transition hover:border-white/20 sm:p-6'>
                    <span className='font-mono text-xs font-bold text-[#ff6b57]'>{item.step}</span>
                    <h3 className='mt-3 text-lg font-extrabold text-white sm:text-xl'>{item.title}</h3>
                    <p className='mt-1 text-[10px] font-bold uppercase tracking-wider text-[#ff9b8e] sm:text-xs'>{item.subtitle}</p>
                    <p className='mt-2.5 text-xs leading-relaxed text-zinc-400 sm:text-sm'>{item.desc}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─── MOVING REEL: VISUAL RICHNESS (SMOOTH & RESPONSIVE) ─── */}
      <section className='overflow-hidden border-y border-white/10 bg-[#0c0c10] py-14 sm:py-20'>
        <div className='mx-auto mb-8 max-w-7xl px-4 sm:px-8'>
          <p className='text-xs font-extrabold uppercase tracking-[.24em] text-[#ff6b57]'>
            Every Shoot Has Its Own Pulse
          </p>
          <div className='mt-2 grid gap-3 lg:grid-cols-[1fr_420px] lg:items-end'>
            <h2 className='font-display text-2xl font-extrabold leading-[1.05] tracking-[-.04em] sm:text-4xl'>
              Veylo doesn't force every story to feel the same.
            </h2>
            <p className='text-xs leading-relaxed text-zinc-400 sm:text-sm'>
              A quiet portrait needs room to breathe. A 30th birthday needs lift. A fashion lookbook needs nerve. The AI
              Director follows the photographs.
            </p>
          </div>
        </div>

        {[portfolioImages.slice(0, 11), portfolioImages.slice(11)].map((row, rowIndex) => (
          <div key={rowIndex} className={rowIndex === 0 ? 'mb-3 flex' : 'flex'}>
            <motion.div
              className='flex shrink-0 gap-3 px-1.5'
              animate={{ x: rowIndex === 0 ? ['0%', '-50%'] : ['-50%', '0%'] }}
              transition={{ duration: rowIndex === 0 ? 46 : 40, repeat: Infinity, ease: 'linear' }}>
              {[...row, ...row].map((image, index) => (
                <div
                  key={`${image.src}-${index}`}
                  className='group relative h-[210px] w-[150px] shrink-0 overflow-hidden rounded-2xl border border-white/10 sm:h-[320px] sm:w-[230px]'>
                  <img
                    src={image.src}
                    alt=''
                    loading='lazy'
                    className='h-full w-full object-cover transition duration-700 group-hover:scale-105'
                  />
                  <div className='absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80' />
                  <span className='absolute bottom-3 left-3 text-[8px] font-extrabold uppercase tracking-[.18em] text-white/80 sm:text-[9px]'>
                    {image.label}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>
        ))}
      </section>

      {/* ─── PHILOSOPHY: YOUR PHOTOS STAY YOUR PHOTOS ─── */}
      <section className='px-4 py-16 sm:px-8 sm:py-24 lg:py-32'>
        <div className='relative mx-auto min-h-[500px] max-w-7xl overflow-hidden rounded-3xl border border-white/10 sm:min-h-[600px]'>
          <img
            src='/veylo/pv-photographer.jpeg'
            alt='Photographer at work'
            className='absolute inset-0 h-full w-full object-cover object-center'
          />
          <div className='absolute inset-0 bg-gradient-to-t from-black via-black/85 to-black/40 lg:bg-gradient-to-r lg:from-black lg:via-black/75 lg:to-transparent' />
          <div className='relative z-10 flex min-h-[500px] max-w-2xl flex-col justify-end p-5 sm:min-h-[600px] sm:p-10 lg:justify-center'>
            <div className='inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.24em] text-[#ff9b8e]'>
              <Camera size={14} /> Your Art Stays Untouched
            </div>
            <h2 className='mt-3 font-display text-2xl font-extrabold leading-[1.05] tracking-[-.04em] sm:text-4xl lg:text-5xl'>
              You craft the photographs.<br />
              <span className='text-[#ff9b8e]'>Veylo premieres them.</span>
            </h2>
            <p className='mt-3 text-xs leading-relaxed text-zinc-300 sm:text-sm sm:leading-6'>
              Veylo does not generate synthetic pixels, crop your compositions, or modify your color grading.
              We don't build bloated CRMs, invoicing tools, or website builders.
            </p>
            <p className='mt-2 text-xs font-semibold text-white sm:text-sm'>
              Veylo does ONE thing: turns finished photoshoots into unforgettable client experiences.
            </p>
            <div className='mt-5 flex flex-wrap gap-2'>
              <div className='rounded-lg border border-white/15 bg-black/60 px-3 py-1.5 text-[10px] font-bold text-white backdrop-blur-md sm:text-xs'>
                ✓ No AI face altering
              </div>
              <div className='rounded-lg border border-white/15 bg-black/60 px-3 py-1.5 text-[10px] font-bold text-white backdrop-blur-md sm:text-xs'>
                ✓ Color grading preserved
              </div>
              <div className='rounded-lg border border-white/15 bg-black/60 px-3 py-1.5 text-[10px] font-bold text-white backdrop-blur-md sm:text-xs'>
                ✓ Pristine high-resolution
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── SOUND & VOICE: TYPOGRAPHY OR VOICE NARRATION ─── */}
      <section className='border-y border-white/10 bg-[#0c0c10] px-4 py-16 sm:px-8 sm:py-24 lg:py-32'>
        <div className='mx-auto max-w-7xl'>
          <div className='mb-8 grid gap-3 lg:grid-cols-[1fr_420px] lg:items-end'>
            <div>
              <p className='text-xs font-extrabold uppercase tracking-[.24em] text-[#ff6b57]'>Sound & Storytelling</p>
              <h2 className='mt-2 font-display text-2xl font-extrabold leading-[1.05] tracking-[-.04em] sm:text-4xl'>
                Words that know when to speak.
              </h2>
            </div>
            <p className='text-xs leading-relaxed text-zinc-400 sm:text-sm'>
              Keep it minimalist with music + typography, or let Veylo voice the story out loud. The photographer chooses.
            </p>
          </div>

          <div className='grid gap-4 md:grid-cols-2'>
            <div className='rounded-2xl border border-white/10 bg-[#111115] p-5 sm:p-8'>
              <div className='grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-[#ff6b57]'>
                <Type size={20} />
              </div>
              <h3 className='mt-4 text-lg font-extrabold text-white sm:text-xl'>Mode A: Music + Typography</h3>
              <p className='mt-2 text-xs leading-relaxed text-zinc-400 sm:text-sm'>
                Sleek editorial typography appears at key frames over an ambient cinema score. Subtle, understated, and
                sophisticated—perfect for high-fashion lookbooks and quiet personal portraits.
              </p>
              <div className='mt-4 rounded-lg border border-white/10 bg-black/40 p-3 text-xs italic text-zinc-300'>
                “Thirty enters the room before she says a word.”
              </div>
            </div>

            <div className='rounded-2xl border border-[#ff5a47]/30 bg-[#ff5a47]/[.05] p-5 sm:p-8'>
              <div className='grid h-10 w-10 place-items-center rounded-xl bg-[#ff5a47]/15 text-[#ff7b69]'>
                <Mic2 size={20} />
              </div>
              <h3 className='mt-4 text-lg font-extrabold text-white sm:text-xl'>Mode B: Music + Voice Narration (TTS)</h3>
              <p className='mt-2 text-xs leading-relaxed text-zinc-300 sm:text-sm'>
                Veylo automatically crafts and speaks a warm voiceover that narrates the client's milestone. A feature
                built for viral TikTok and Instagram client reactions.
              </p>
              <div className='mt-4 rounded-lg border border-[#ff5a47]/30 bg-black/60 p-3 text-xs font-semibold text-[#ff9b8e]'>
                ✦ Spoken aloud: “She built this version of herself in rooms no one applauded...”
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── THEMES SHOWCASE ─── */}
      <section id='themes' className='px-4 py-16 sm:px-8 sm:py-24 lg:py-32'>
        <div className='mx-auto max-w-7xl'>
          <div className='flex flex-col justify-between gap-3 md:flex-row md:items-end'>
            <div>
              <p className='text-xs font-extrabold uppercase tracking-[.24em] text-[#ff6b57]'>Start With The Feeling</p>
              <h2 className='mt-2 font-display text-2xl font-extrabold tracking-[-.04em] sm:text-4xl'>
                Cinematic themes.<br />
                <span className='text-zinc-500'>Zero blank canvas.</span>
              </h2>
            </div>
            <p className='max-w-sm text-xs leading-relaxed text-zinc-400 sm:text-sm'>
              Enough aesthetic variety to match any shoot. Fast enough to publish in minutes without needing design skills.
            </p>
          </div>

          <div className='mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            {themes.map((theme) => (
              <Link
                to='/create'
                key={theme.name}
                className='group relative aspect-[4/5] overflow-hidden rounded-2xl border border-white/10 transition duration-500 hover:border-white/30 sm:rounded-3xl'>
                <img
                  src={theme.image}
                  alt=''
                  loading='lazy'
                  className='h-full w-full object-cover transition duration-700 group-hover:scale-105'
                />
                <div className='absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent' />
                <div className='absolute inset-x-0 bottom-0 p-5'>
                  <span className='mb-2 block h-1 w-8 rounded-full' style={{ backgroundColor: theme.color }} />
                  <h3 className='text-lg font-extrabold text-white sm:text-xl'>{theme.name}</h3>
                  <p className='mt-1 text-[10px] font-bold uppercase tracking-[.16em] text-[#ff9b8e]'>{theme.fit}</p>
                  <p className='mt-1 text-xs leading-snug text-zinc-300 opacity-85'>{theme.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PRICING: FREE VS PRO (NO CREDITS, JUST UNLIMITED DELIVERY) ─── */}
      <section id='pricing' className='border-y border-white/10 bg-[#0c0c10] px-4 py-16 sm:px-8 sm:py-24 lg:py-32'>
        <div className='mx-auto max-w-7xl'>
          <div className='mx-auto max-w-3xl text-center'>
            <p className='text-xs font-extrabold uppercase tracking-[.24em] text-[#ff6b57]'>Transparent Pricing</p>
            <h2 className='mt-2 font-display text-2xl font-extrabold leading-[1.05] tracking-[-.04em] sm:text-4xl lg:text-5xl'>
              No credits. No token math.<br />
              <span className='text-transparent bg-clip-text bg-gradient-to-r from-[#ff7b69] via-[#ff5a47] to-[#ff9b8e]'>
                Just unlimited delivery.
              </span>
            </h2>
            <p className='mt-3 text-xs leading-relaxed text-zinc-400 sm:text-base'>
              No wondering if you have “15 tokens remaining.” Pay once a month and run your photography deliveries with total peace of mind.
            </p>
          </div>

          <div className='mt-10 grid gap-5 md:mx-auto md:max-w-4xl md:grid-cols-2'>
            {/* ─── TIER 1: VEYLO FREE ─── */}
            <div className='flex flex-col justify-between rounded-3xl border border-white/15 bg-[#111115] p-5 sm:p-8'>
              <div>
                <div className='flex items-center justify-between'>
                  <span className='text-xs font-black uppercase tracking-[.2em] text-zinc-400'>Veylo Free</span>
                  <span className='rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[9px] font-bold text-zinc-400'>
                    TEST DRIVE
                  </span>
                </div>

                <div className='mt-4 flex items-baseline gap-1.5'>
                  <span className='text-3xl font-extrabold tracking-tight text-white sm:text-4xl'>₦0</span>
                  <span className='text-xs font-bold text-zinc-500'>/ month</span>
                </div>

                <p className='mt-2 text-xs font-semibold text-zinc-300'>
                  Give real value so you can genuinely experience Veylo with real clients.
                </p>

                <div className='mt-5 space-y-2.5 border-t border-white/10 pt-5 text-xs text-zinc-300 sm:text-sm'>
                  {[
                    '2 Photo Stories every month',
                    'Veylo AI Director & photo sequencing',
                    'Cinematic presentation & subtle motion',
                    'Curated soundtrack library',
                    'AI-written editorial storytelling',
                    'Basic TTS voice narration',
                    'Complete client photo gallery',
                    'Individual & bulk photo downloads',
                    'Shareable link (Link-ready)',
                    'Standard processing priority',
                    'Veylo watermark branding'
                  ].map((feat) => (
                    <div key={feat} className='flex items-start gap-2'>
                      <Check size={14} className='mt-0.5 shrink-0 text-[#ff6b57]' />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className='mt-6'>
                <Link
                  to='/create'
                  className='flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 py-3 text-xs font-extrabold text-white transition hover:bg-white/10 sm:text-sm'>
                  Start Free — 2 Stories/mo
                </Link>
                <p className='mt-2 text-center text-[10px] text-zinc-500'>No credit card required. Free forever.</p>
              </div>
            </div>

            {/* ─── TIER 2: VEYLO PRO (FEATURED) ─── */}
            <div className='relative flex flex-col justify-between overflow-hidden rounded-3xl border-2 border-[#ff5a47] bg-[#ff5a47]/[.08] p-5 shadow-[0_15px_60px_rgba(255,90,71,.2)] sm:p-8'>
              <div className='absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#ff5a47]/20 blur-[80px]' />

              <div className='relative z-10'>
                <div className='flex items-center justify-between'>
                  <span className='text-xs font-black uppercase tracking-[.2em] text-[#ff9b8e]'>Veylo Pro</span>
                  <span className='rounded-full bg-[#ff5a47] px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-sm'>
                    STUDIO STANDARD
                  </span>
                </div>

                <div className='mt-4 flex items-baseline gap-1.5'>
                  <span className='text-3xl font-extrabold tracking-tight text-white sm:text-4xl'>₦20,000</span>
                  <span className='text-xs font-bold text-zinc-400'>/ month</span>
                </div>

                <p className='mt-2 text-xs font-semibold text-white'>
                  The main product for working photographers and media studios.
                </p>

                <div className='mt-5 space-y-2.5 border-t border-white/15 pt-5 text-xs text-white sm:text-sm'>
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
                    <div key={feat} className='flex items-start gap-2'>
                      <Check size={14} className='mt-0.5 shrink-0 text-[#ff7b69]' />
                      <span className='font-medium'>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className='relative z-10 mt-6'>
                <Link
                  to='/create'
                  className='flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff5a47] py-3 text-xs font-black text-white shadow-lg shadow-[#ff5a47]/30 transition hover:bg-[#ff7564] sm:text-sm'>
                  Get Veylo Pro — ₦20,000/mo
                </Link>
                <p className='mt-2 text-center text-[10px] text-zinc-400'>
                  One client referral covers your entire year. Cancel anytime.
                </p>
              </div>
            </div>
          </div>

          {/* Fair Use Protection Callout */}
          <div className='mx-auto mt-8 max-w-4xl rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-md sm:p-5'>
            <div className='flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left'>
              <div className='grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#ff5a47]/15 text-[#ff7b69]'>
                <ShieldCheck size={18} />
              </div>
              <div className='text-xs leading-relaxed text-zinc-400'>
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
      <section className='px-4 py-16 sm:px-8 sm:py-24 lg:py-32'>
        <div className='mx-auto max-w-3xl'>
          <div className='text-center'>
            <p className='text-xs font-extrabold uppercase tracking-[.24em] text-[#ff6b57]'>Clarity For Studios</p>
            <h2 className='mt-2 font-display text-2xl font-extrabold sm:text-4xl'>Frequently Asked Questions</h2>
          </div>

          <div className='mt-8 space-y-2.5'>
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={faq.q}
                  className='overflow-hidden rounded-xl border border-white/10 bg-[#111115] transition'>
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className='flex w-full items-center justify-between p-4 text-left text-xs font-bold text-white hover:text-[#ff7b69] sm:p-5 sm:text-sm'>
                    <span className='pr-3'>{faq.q}</span>
                    <ChevronDown
                      size={16}
                      className={`shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180 text-[#ff5a47]' : 'text-zinc-500'}`}
                    />
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}>
                        <div className='border-t border-white/10 px-4 pb-4 pt-2.5 text-xs leading-relaxed text-zinc-400 sm:px-5 sm:pb-5'>
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
      <section className='px-4 pb-16 sm:px-8 sm:pb-24 lg:pb-32'>
        <div className='relative mx-auto max-w-7xl overflow-hidden rounded-3xl border border-[#ff7b69]/30 bg-gradient-to-br from-[#d94738] via-[#ad3138] to-[#541f32] p-6 text-center shadow-[0_20px_80px_rgba(255,90,71,.25)] sm:p-12 lg:py-20'>
          <div className='absolute left-1/2 top-0 h-60 w-60 -translate-x-1/2 rounded-full bg-[#ffc1b8]/20 blur-[90px]' />
          <div className='relative z-10'>
            <img src='/veylo/veylo-mark.svg' alt='' className='mx-auto h-12 w-12 rounded-xl shadow-lg sm:h-14 sm:w-14' />
            <p className='mt-4 text-[10px] font-extrabold uppercase tracking-[.22em] text-[#ffd4ce] sm:text-xs'>
              Don't just deliver photos. Premiere them.
            </p>
            <h2 className='mx-auto mt-2 max-w-3xl font-display text-2xl font-extrabold leading-[1.05] tracking-[-.04em] text-white sm:text-4xl lg:text-5xl'>
              “Are my pictures ready?”<br />
              <span className='text-white'>Make the answer worth opening.</span>
            </h2>
            <p className='mx-auto mt-3 max-w-lg text-xs leading-relaxed text-white/80 sm:text-sm sm:leading-6'>
              Premiere your next shoot with 2 free stories every month. When you're ready to make it your studio standard,
              upgrade to Unlimited for ₦20,000/month.
            </p>
            <div className='mt-6 flex flex-col justify-center gap-3 sm:flex-row'>
              <Link
                to='/create'
                className='group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-xs font-black text-[#7c2027] transition hover:bg-zinc-100 sm:w-auto sm:text-sm'>
                <span>Create Your First Photo Story</span>
                <ArrowRight size={15} className='transition-transform group-hover:translate-x-1' />
              </Link>
              <Link
                to='/create'
                className='inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/30 bg-black/20 px-6 py-3.5 text-xs font-extrabold text-white backdrop-blur-md transition hover:bg-black/30 sm:w-auto sm:text-sm'>
                Get Veylo Pro (₦20k/mo)
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FOOTER (LANDING PAGE ONLY) ─── */}
      <Footer />
    </div>
  );
}
