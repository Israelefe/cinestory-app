import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Footer from '../components/Footer.jsx';
import {
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  FileCheck,
  Folder,
  Image as ImageIcon,
  Layers,
  Lock,
  MessageSquare,
  Mic2,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Send,
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
    occasion: '30th Birthday Milestone Premiere',
    photographer: 'Studio Lumière · Victoria Island',
    soundtrack: 'Thirty & Thriving (Lounge Groove)',
    audioUrl: '/audio/soundtrack-1.mp3',
    themeColor: '#ff5a47',
    coverImage: '/veylo/ada/ada-1.jpg',
    frames: [
      {
        image: '/veylo/ada/ada-1.jpg',
        act: 'ACT I',
        chapter: 'THE MIDNIGHT CALL',
        title: 'Midnight Strikes: Happy Birthday, Ada',
        line: 'The phone starts ringing off the hook. Birthday calls, voice notes, and prayers pouring in from everywhere.',
        motion: 'zoom-in'
      },
      {
        image: '/veylo/ada/ada-2.jpg',
        act: 'ACT II',
        chapter: 'LOOKING BACK',
        title: 'Wait... I am Actually 30 Today',
        line: 'Lowering the sunglasses with a smile. Leaving the doubts of her twenties behind and never looking back.',
        motion: 'pan-down'
      },
      {
        image: '/veylo/ada/ada-3.jpg',
        act: 'ACT III',
        chapter: 'THE BLESSINGS',
        title: 'Surrounded by So Much Love',
        line: 'Listening to mom’s early morning prayers on the receiver. Thirty years of grace, health, and family.',
        motion: 'pan-right'
      },
      {
        image: '/veylo/ada/ada-4.jpg',
        act: 'ACT IV',
        chapter: 'STEPPING UP',
        title: 'Stepping into Her Golden Era',
        line: 'Standing tall and commanding her future. Career thriving, peace protected, and looking this good.',
        motion: 'zoom-in'
      },
      {
        image: '/veylo/ada/ada-5.jpg',
        act: 'ACT V',
        chapter: 'THE TOAST',
        title: 'Here is to Thirty and Unstoppable',
        line: 'Eye to eye with the camera. Thirty is not just a milestone—it is her absolute prime. Cheers to Ada!',
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
    occasion: 'Traditional Yoruba Wedding Premiere',
    photographer: 'The Covenant Studios · Lagos',
    soundtrack: 'Yoruba Wedding Drums & Percussion',
    audioUrl: '/audio/soundtrack-2.mp3',
    themeColor: '#e59b5f',
    coverImage: '/veylo/wedding/wedding-1.jpg',
    frames: [
      {
        image: '/veylo/wedding/wedding-1.jpg',
        act: 'ACT I',
        chapter: 'THE FIRST LOOK',
        title: 'One Quiet Breath Together',
        line: 'Sitting together in our matching gold Aso-Oke, holding hands before the guests and music arrive.',
        motion: 'zoom-in'
      },
      {
        image: '/veylo/wedding/wedding-2.jpg',
        act: 'ACT II',
        chapter: 'OUR STORY',
        title: 'Seven Years of Loving You',
        line: 'From university friends walking around campus to husband and wife. We always knew this day was coming.',
        motion: 'pan-down'
      },
      {
        image: '/veylo/wedding/wedding-3.jpg',
        act: 'ACT III',
        chapter: 'THE BLESSINGS',
        title: 'Our Families Standing Behind Us',
        line: 'Our parents gave their blessing, our mothers shed tears of joy, and two large families officially became one.',
        motion: 'pan-right'
      },
      {
        image: '/veylo/wedding/wedding-4.jpg',
        act: 'ACT IV',
        chapter: 'THE ENTRANCE',
        title: 'Time to Dance In with the Aso-Ebi',
        line: 'The talking drums are singing, the Alaga is calling our names, and the dance floor is ready for us.',
        motion: 'zoom-in'
      },
      {
        image: '/veylo/wedding/wedding-5.jpg',
        act: 'ACT V',
        chapter: 'THE SEALED PROMISE',
        title: 'Forever Yours: Mr. & Mrs. Adeleke',
        line: 'A kiss on the cheek to seal forever. Thank you to everyone who celebrated our love story today!',
        motion: 'zoom-out'
      }
    ]
  },
  {
    id: 'lookbook',
    label: 'Lookbook',
    icon: '👗',
    client: 'Kendra',
    tag: 'Kendra · Lookbook',
    occasion: 'Model Portfolio & Studio Lookbook',
    photographer: 'Lumière Fashion Arts · Lekki',
    soundtrack: 'Studio 35mm (Analog Funk)',
    audioUrl: '/audio/soundtrack-3.mp3',
    themeColor: '#e0a96d',
    coverImage: '/veylo/editorial/editorial-1.jpg',
    frames: [
      {
        image: '/veylo/editorial/editorial-1.jpg',
        act: 'FRAME 01',
        chapter: 'STUDIO CALL',
        title: '9:00 AM: Testing the Lights',
        line: 'Bantu knots styled, oversized blazer fitted, and vintage Polaroid in hand. Testing the analog tones.',
        motion: 'zoom-in'
      },
      {
        image: '/veylo/editorial/editorial-2.jpg',
        act: 'FRAME 02',
        chapter: 'UNSCRIPTED',
        title: 'When the Director Says “Have Fun”',
        line: 'A quick wink through the viewfinder. Sometimes the most relaxed, unscripted shots become the favorites.',
        motion: 'pan-down'
      },
      {
        image: '/veylo/editorial/editorial-3.jpg',
        act: 'FRAME 03',
        chapter: 'THE FIRST PULL',
        title: 'Waiting for the Film to Develop',
        line: 'Pulling the first instant snapshot from the camera. Real chemical film grain that digital filters cannot fake.',
        motion: 'pan-right'
      },
      {
        image: '/veylo/editorial/editorial-4.jpg',
        act: 'FRAME 04',
        chapter: 'THE COVER SHOT',
        title: 'The Entire Studio Stopped and Cheered',
        line: 'Looking down at the photo as the whole creative team agreed: this frame is the undisputed hero of the shoot.',
        motion: 'zoom-in'
      },
      {
        image: '/veylo/editorial/editorial-5.jpg',
        act: 'FRAME 05',
        chapter: 'COMP CARD',
        title: 'Ready for the Agency Boards',
        line: 'Curated, printed, and ready for international agency submissions across Lagos, London, and Paris.',
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
    desc: 'Dark aesthetic, bold typography, and measured pacing. Ideal for studio portraits, birthday milestones, and fashion shoots.'
  },
  {
    name: 'Romantic Grace',
    fit: 'Weddings · Maternity · Love',
    image: '/veylo/pv-soft.jpeg',
    color: '#f3a89e',
    desc: 'Warm tones, gentle photo motion, and romantic pacing. Built for weddings, couples, and anniversary sessions.'
  },
  {
    name: 'Celebration Energy',
    fit: 'Milestones · Graduations · Events',
    image: '/veylo/pv-hero.jpeg',
    color: '#f0a33a',
    desc: 'Upbeat rhythm, vibrant motion, and bold chapter headlines. Perfect for graduations, milestone parties, and celebrations.'
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
    title: 'Picks the Strongest Cover Shot',
    text: 'Finds the most striking portrait to open the story. When your client taps the link, the very first image grabs their attention.'
  },
  {
    icon: Layers,
    title: 'Puts Photos in Natural Story Order',
    text: 'Groups and sequences photos by mood, angle variety, and energy—not by whatever random file order the camera saved.'
  },
  {
    icon: Type,
    title: 'Clean Story Chapter Titles',
    text: 'Writes short, tasteful chapter headlines using your shoot notes (like “The Golden Hour” or “Midnight Strikes”). Never cheesy, never robotic.'
  },
  {
    icon: Music2,
    title: 'Music That Matches the Mood',
    text: 'Pairs your photos with curated background tracks and subtle motion that glides naturally with the music.'
  },
  {
    icon: Mic2,
    title: 'Optional Spoken Voiceover',
    text: 'Keep it quiet with just music and text, or turn on a warm voiceover that narrates the client’s milestone out loud.'
  },
  {
    icon: Sliders,
    title: 'You Always Have the Final Say',
    text: 'Veylo builds the first draft in seconds. You can reorder photos, tweak text, swap soundtracks, or change themes anytime.'
  }
];

const faqs = [
  {
    q: 'What is Veylo Pre-Delivery and client photo selection?',
    a: 'Pre-Delivery allows you to send a private, watermarked selection gallery to your client before you start editing. You upload your culled proofs and set a limit (like 15 photos). Your client opens the link on their phone, taps their favorites with a live counter (“12 of 15 selected”), adds editing notes, and taps Submit. You get the exact chosen photos to retouch—ending messy WhatsApp screenshots and confusing filename lists.'
  },
  {
    q: 'Can I watermark my proofs so unedited photos aren’t shared?',
    a: 'Yes. You can turn on custom proof watermarks (like “PROOF — Studio Name”) across the preview photos. The watermark only appears in the proofing gallery—never on your final retouched photos or Photo Stories.'
  },
  {
    q: 'Who pays for Veylo?',
    a: 'The photographer or studio subscribes to Veylo. Your clients never pay a kobo, and they don’t need an account or an app to choose their photos or view their delivery.'
  },
  {
    q: 'How does the Free plan work?',
    a: 'You get 2 Photo Stories every month for ₦0. You get full access to the AI Director, music library, story sequencing, and client downloads so you can test it on real client shoots before upgrading.'
  },
  {
    q: 'What does “Unlimited under fair use” mean?',
    a: 'It means you don’t have to count tokens or worry about limits. Deliver 10, 25, or 50 shoots a month for your clients—it’s all included. Fair use simply protects against automated bots, scraping, or multiple unrelated studios sharing a single login.'
  },
  {
    q: 'Do my clients need to install an app or create an account?',
    a: 'No. Veylo links open immediately in Chrome, Safari, or whatever browser is on the client’s phone. It’s built specifically to be sent over WhatsApp and Instagram DMs.'
  },
  {
    q: 'Can clients still download their original high-resolution photos?',
    a: 'Yes, 100%. Veylo gives your client an experience before the gallery—not instead of it. Right after watching their Photo Story, they enter the full gallery where they can view photos full-screen, download individual favorites, or download the entire original package in high resolution.'
  },
  {
    q: 'Does Veylo change, retouch, or compress my photos?',
    a: 'No. Veylo never modifies your color grading, never adds fake AI pixels, and never compresses your delivered downloads. Your original photography is preserved exactly as you created it.'
  }
];

const sampleProofs = [
  {
    id: 1,
    image: '/veylo/ada/ada-1.jpg',
    code: 'IMG_4812.CR3',
    note: 'Love the lighting! Make this the cover photo.',
    hasNote: true
  },
  {
    id: 2,
    image: '/veylo/ada/ada-2.jpg',
    code: 'IMG_4826.CR3',
    note: 'Please deliver this one in high-contrast B&W.',
    hasNote: true
  },
  {
    id: 3,
    image: '/veylo/ada/ada-4.jpg',
    code: 'IMG_4855.CR3',
    note: 'Can you soften the background shadow on this one?',
    hasNote: true
  },
  {
    id: 4,
    image: '/veylo/ada/ada-3.jpg',
    code: 'IMG_4839.CR3',
    note: '',
    hasNote: false
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
  const [selectedProofIds, setSelectedProofIds] = useState([1, 2, 3]);

  const toggleProofSelect = (id) => {
    setSelectedProofIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

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
                The Photo Delivery Platform for Photographers · Pre-Delivery to Premiere
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
              Send clients a clean link to choose their favorite photos before you retouch, then deliver the finished shoot as an interactive Photo Story with music and high-res downloads. No more messy WhatsApp screenshots. No more cold Google Drive links.
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
                <Check size={13} className='text-[#ff6b57]' /> Client proofing with quotas
              </span>
              <span className='flex items-center gap-1.5'>
                <Check size={13} className='text-[#ff6b57]' /> 2 free stories every month
              </span>
              <span className='flex items-center gap-1.5'>
                <Check size={13} className='text-[#ff6b57]' /> Full high-res downloads
              </span>
              <span className='flex items-center gap-1.5'>
                <Check size={13} className='text-[#ff6b57]' /> No credit card needed
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
              <span className='flex items-center gap-2 text-white'><span className='text-emerald-400'>✦</span> Client Proofing & Selection</span>
              <span className='flex items-center gap-2 text-white'><span className='text-emerald-400'>✦</span> Proof Watermarking</span>
              <span className='flex items-center gap-2 text-white'><span className='text-[#ff5a47]'>✦</span> Veylo AI Director</span>
              <span className='flex items-center gap-2 text-white'><span className='text-[#ff5a47]'>✦</span> Editorial Storytelling</span>
              <span className='flex items-center gap-2 text-white'><span className='text-[#ff5a47]'>✦</span> Music & Narration</span>
              <span className='flex items-center gap-2 text-white'><span className='text-[#ff5a47]'>✦</span> High-Res Client Downloads</span>
              <span className='flex items-center gap-2 text-white'><span className='text-emerald-400'>✦</span> Select · Finish · Premiere · Deliver</span>
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
                The Reality of Photo Delivery
              </p>
              <h2 className='mt-2 font-display text-2xl font-extrabold leading-[1.05] tracking-[-.04em] sm:text-4xl lg:text-5xl'>
                Still sending client photos the old way?
              </h2>
            </div>
            <p className='text-sm leading-relaxed text-zinc-400 sm:text-base'>
              You spend hours directing, lighting, and retouching a session. But when it's time to deliver, everything gets lost in messy WhatsApp chats or cold folders of raw file names.
            </p>
          </div>

          <div className='mt-10 grid gap-5 lg:grid-cols-2'>
            {/* The Cold Delivery */}
            <div className='flex flex-col justify-between rounded-3xl border border-white/10 bg-zinc-950 p-6 sm:p-8'>
              <div>
                <div className='flex items-center justify-between text-xs font-black uppercase tracking-[.18em] text-zinc-500'>
                  <span>THE OLD WAY</span>
                  <span className='rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-zinc-400'>
                    RAW ARCHIVES & SCREENSHOTS
                  </span>
                </div>

                <div className='mt-8 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900 text-zinc-500'>
                  <Folder size={28} strokeWidth={1.2} />
                </div>

                <h3 className='mt-5 font-display text-xl font-bold text-zinc-300 sm:text-2xl'>
                  “Here is the Drive link. WhatsApp me your 15 picks.”
                </h3>
                <p className='mt-2.5 text-xs leading-relaxed text-zinc-400 sm:text-sm'>
                  Your client scrolls on a small phone screen. They send back 40 screenshots with red circles, or endless messy texts:
                  <span className='italic block text-zinc-300 my-1'>“Edit IMG_4812, 4826, 4855... wait, swap 4826 for 4830!”</span>
                  Unedited proofs get posted online without permission. And your weeks of creative work end in a confusing spreadsheet.
                </p>
              </div>

              <div className='mt-6 rounded-xl border border-white/5 bg-black/40 p-3 text-xs font-mono text-zinc-500'>
                <p className='truncate'>drive.google.com/drive/folders/7xK9... · 184 raw proofs · 4.8 GB</p>
              </div>
            </div>

            {/* The Veylo Premiere */}
            <div className='relative flex flex-col justify-between overflow-hidden rounded-3xl border border-[#ff5a47]/40 bg-[#ff5a47]/[.06] p-6 sm:p-8'>
              <div className='absolute -right-16 -top-16 h-60 w-60 rounded-full bg-[#ff5a47]/20 blur-[90px]' />

              <div className='relative z-10'>
                <div className='flex items-center justify-between text-xs font-black uppercase tracking-[.18em] text-[#ff9b8e]'>
                  <span className='flex items-center gap-1.5'>
                    <Sparkles size={13} className='text-[#ff5a47]' /> THE VEYLO PIPELINE
                  </span>
                  <span className='rounded-full border border-[#ff5a47]/30 bg-[#ff5a47]/15 px-2.5 py-0.5 text-[10px] font-bold text-[#ff9b8e]'>
                    SELECT · FINISH · PREMIERE · DELIVER
                  </span>
                </div>

                <p className='mt-6 font-serif text-xl font-semibold leading-snug text-white sm:text-3xl'>
                  A clean selection link. Then a delivery they brag about.
                </p>

                <p className='mt-3 text-xs leading-relaxed text-zinc-300 sm:text-sm sm:leading-6'>
                  First, send a watermarked proofing gallery where clients tap to choose their exact package quota (like 15 of 80) and leave notes. When you finish retouching, send their Photo Story. Music plays, photos glide, and they download the full high-res package in one tap.
                </p>
              </div>

              <div className='relative z-10 mt-6 rounded-xl border border-[#ff5a47]/30 bg-black/60 p-3 text-xs font-medium text-[#ff9b8e] backdrop-blur-xl'>
                <div className='flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between'>
                  <span className='font-mono font-bold'>veylo.com.ng/s/ada-at-30</span>
                  <span className='text-[10px] font-black uppercase tracking-wider text-emerald-400 font-mono'>15 / 15 Selected · Ready to Premiere</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── VEYLO PRE-DELIVERY: CLIENT PROOFING & PHOTO SELECTION ─── */}
      <section id='pre-delivery' className='border-t border-white/10 bg-[#0a0a0e] px-4 py-16 sm:px-8 sm:py-24 lg:py-32 relative overflow-hidden'>
        {/* Ambient atmospheric glow */}
        <div className='pointer-events-none absolute left-1/2 top-1/4 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[800px] rounded-full bg-emerald-500/[0.04] blur-[150px]' />

        <div className='mx-auto max-w-7xl relative z-10'>
          
          {/* Section Header */}
          <div className='mx-auto max-w-3xl text-center'>
            <div className='inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-[10px] font-extrabold uppercase tracking-[.2em] text-emerald-400 sm:text-xs'>
              <CheckCircle2 size={13} /> Stage 01 · Client Proofing & Photo Selection
            </div>
            <h2 className='mt-4 font-display text-2xl font-extrabold leading-[1.05] tracking-[-.04em] sm:text-4xl lg:text-5xl'>
              Stop chasing clients on WhatsApp<br className='hidden sm:inline' /> for photo selections.
            </h2>
            <p className='mt-3 text-xs leading-relaxed text-zinc-400 sm:text-base'>
              Before you spend hours retouching, upload your culled proofs and set the client’s package limit. Your client opens the private link on their phone, picks their favorites with a live counter, and leaves retouch notes. When they tap submit, you get the exact list to edit.
            </p>
          </div>

          {/* Interactive Proofing Gallery Simulator */}
          <div className='mt-12 rounded-3xl border border-white/15 bg-zinc-950/90 p-4 sm:p-7 shadow-[0_25px_80px_rgba(0,0,0,0.8)] backdrop-blur-xl'>
            
            {/* Gallery Control Bar */}
            <div className='flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between'>
              <div>
                <div className='flex items-center gap-2.5'>
                  <span className='h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]' />
                  <h3 className='font-display text-base sm:text-lg font-bold text-white'>Amaka · 30th Birthday Session</h3>
                </div>
                <p className='text-xs text-zinc-400 mt-0.5'>Studio Lumière · Proofing Gallery (80 usable proofs uploaded)</p>
              </div>

              {/* Live Status & Quota tracker */}
              <div className='flex flex-wrap items-center gap-3'>
                <div className='rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2'>
                  <div className='flex items-center justify-between gap-4 text-xs'>
                    <span className='font-medium text-zinc-400'>Selection Quota:</span>
                    <span className='font-mono font-black text-emerald-400'>
                      {12 + (selectedProofIds.length - 3)} / 15 selected
                    </span>
                  </div>
                  <div className='mt-1.5 h-1.5 w-36 sm:w-44 overflow-hidden rounded-full bg-white/10'>
                    <div
                      className='h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300'
                      style={{ width: `${Math.min(100, Math.max(0, ((12 + (selectedProofIds.length - 3)) / 15) * 100))}%` }}
                    />
                  </div>
                </div>

                <div className='hidden sm:flex items-center gap-1.5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300'>
                  <Clock size={13} />
                  <span>Deadline: Friday 6:00 PM</span>
                </div>
              </div>
            </div>

            {/* Instruction strip with interactive hint */}
            <div className='my-4 flex items-center justify-between rounded-xl bg-white/[0.02] border border-white/5 px-4 py-2 text-xs text-zinc-400'>
              <span className='flex items-center gap-2'>
                <span className='rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 uppercase'>Client View</span>
                <span>Choose your 15 favorite photographs for final retouching</span>
              </span>
              <span className='hidden md:inline text-[11px] text-zinc-500 italic'>
                💡 Try tapping cards to select / deselect
              </span>
            </div>

            {/* Proofing Cards Grid */}
            <div className='grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4'>
              {sampleProofs.map((proof) => {
                const isSelected = selectedProofIds.includes(proof.id);
                return (
                  <div
                    key={proof.id}
                    onClick={() => toggleProofSelect(proof.id)}
                    className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border transition-all cursor-pointer select-none ${
                      isSelected
                        ? 'border-emerald-500/60 bg-emerald-500/[0.04] shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/40'
                        : 'border-white/10 bg-zinc-900/60 hover:border-white/25 hover:bg-zinc-900'
                    }`}>
                    
                    {/* Photo container */}
                    <div className='relative aspect-[3/4] w-full overflow-hidden bg-black'>
                      <img
                        src={proof.image}
                        alt={proof.code}
                        className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 ${
                          isSelected ? 'contrast-105' : 'opacity-70 contrast-90'
                        }`}
                      />

                      {/* Angled Proof Watermark Overlay (As specified in productdescription.md) */}
                      <div className='pointer-events-none absolute inset-0 flex items-center justify-center rotate-[-25deg] select-none'>
                        <span className='rounded border border-white/20 bg-black/45 px-2 py-0.5 font-mono text-[9px] sm:text-[10px] font-black uppercase tracking-[0.24em] text-white/40 backdrop-blur-[1.5px] shadow-sm'>
                          PROOF · LUMIÈRE
                        </span>
                      </div>

                      {/* Top Bar inside image: File code & Selection Badge */}
                      <div className='absolute inset-x-0 top-0 flex items-center justify-between p-2.5'>
                        <span className='rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[9px] font-bold text-zinc-300 backdrop-blur-md border border-white/10'>
                          {proof.code}
                        </span>

                        {/* Interactive Selection Checkbox */}
                        <div
                          className={`grid h-6 w-6 place-items-center rounded-full transition-transform active:scale-90 ${
                            isSelected
                              ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/40'
                              : 'border border-white/40 bg-black/50 text-white/60 group-hover:border-white'
                          }`}>
                          {isSelected ? <Check size={13} strokeWidth={3} /> : <span className='text-[10px] font-bold'>+</span>}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Metadata & Client Retouch Note */}
                    <div className='p-2.5 sm:p-3'>
                      <div className='flex items-center justify-between text-[11px] font-bold'>
                        <span className={isSelected ? 'text-emerald-400' : 'text-zinc-400'}>
                          {isSelected ? 'Selected ✓' : 'Tap to select'}
                        </span>
                        {proof.hasNote && (
                          <span className='flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300 border border-amber-500/20'>
                            <MessageSquare size={9} /> Note
                          </span>
                        )}
                      </div>

                      {proof.hasNote && (
                        <p className='mt-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 p-1.5 text-[10px] leading-tight text-amber-200/90'>
                          “{proof.note}”
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Proofing Action & Summary Bar */}
            <div className='mt-6 flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/50 p-4 sm:flex-row sm:items-center sm:justify-between'>
              <div className='flex items-center gap-3'>
                <div className='grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'>
                  <FileCheck size={18} />
                </div>
                <div>
                  <p className='text-xs font-bold text-white'>
                    {12 + (selectedProofIds.length - 3)} of 15 photos selected
                  </p>
                  <p className='text-[11px] text-zinc-400'>
                    Client can attach optional retouch notes to any chosen photograph
                  </p>
                </div>
              </div>

              <div className='flex items-center gap-2'>
                <button
                  type='button'
                  className='inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-black text-black shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-400 active:scale-95'>
                  <Send size={13} />
                  <span>Submit Selection to Studio</span>
                </button>
              </div>
            </div>

            {/* Studio Pipeline Tracking Strip */}
            <div className='mt-6 border-t border-white/10 pt-5'>
              <p className='text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-3'>
                Photographer Dashboard Status Tracking
              </p>
              <div className='grid grid-cols-2 gap-2 sm:grid-cols-5 text-[11px]'>
                {[
                  { name: '1. Waiting for Client', active: false, done: true },
                  { name: '2. Selection in Progress', active: true, done: false },
                  { name: '3. Selection Submitted', active: false, done: false },
                  { name: '4. Studio Retouching', active: false, done: false },
                  { name: '5. Ready for Premiere', active: false, done: false },
                ].map((st) => (
                  <div
                    key={st.name}
                    className={`rounded-xl border p-2.5 transition ${
                      st.active
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-bold'
                        : st.done
                        ? 'border-white/10 bg-white/[0.02] text-zinc-400 font-medium'
                        : 'border-white/5 bg-transparent text-zinc-600 font-medium'
                    }`}>
                    <div className='flex items-center gap-1.5'>
                      {st.done ? (
                        <Check size={12} className='text-emerald-400' />
                      ) : st.active ? (
                        <span className='h-2 w-2 rounded-full bg-emerald-400 animate-pulse' />
                      ) : (
                        <span className='h-1.5 w-1.5 rounded-full bg-zinc-700' />
                      )}
                      <span className='truncate'>{st.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* 4 Core Pre-Delivery Pillars */}
          <div className='mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            {[
              {
                icon: CheckCircle2,
                title: 'Strict Selection Limits',
                desc: 'Set the exact number of photos included in the client’s package (e.g. 15 photos). The counter stops them from picking 40 photos when they only paid for 15.'
              },
              {
                icon: Lock,
                title: 'Proof Watermarks',
                desc: 'Protect unedited work before final delivery. A subtle studio watermark appears automatically over proofs so clients don’t share raw unedited shots.'
              },
              {
                icon: MessageSquare,
                title: 'Photo Retouch Notes',
                desc: 'Clients can attach simple notes directly to an image (“Make this one black and white”, “Soften the shadow”). No more confusing messages.'
              },
              {
                icon: FileCheck,
                title: 'Clear Pipeline Status',
                desc: 'See exactly where each shoot stands on your dashboard: Waiting for selection, In progress, Selection submitted, Currently editing, or Ready to premiere.'
              }
            ].map((pillar, idx) => {
              const Icon = pillar.icon;
              return (
                <div
                  key={pillar.title}
                  className='rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-emerald-500/30 hover:bg-white/[0.04] sm:p-6'>
                  <div className='flex items-center justify-between'>
                    <div className='grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'>
                      <Icon size={18} />
                    </div>
                    <span className='font-mono text-xs font-bold text-zinc-600'>0{idx + 1}</span>
                  </div>
                  <h3 className='mt-4 text-base font-extrabold text-white'>{pillar.title}</h3>
                  <p className='mt-2 text-xs leading-relaxed text-zinc-400'>{pillar.desc}</p>
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* ─── VEYLO AI DIRECTOR: THE CORE CONCEPT ─── */}
      <section id='ai-director' className='border-y border-white/10 bg-[#0c0c10] px-4 py-16 sm:px-8 sm:py-24 lg:py-32'>
        <div className='mx-auto max-w-7xl'>
          <div className='mx-auto max-w-3xl text-center'>
            <div className='inline-flex items-center gap-2 rounded-full border border-[#ff5a47]/30 bg-[#ff5a47]/10 px-3.5 py-1 text-[10px] font-extrabold uppercase tracking-[.2em] text-[#ff9b8e] sm:text-xs'>
              <WandSparkles size={13} /> Stage 02 · The Veylo AI Director
            </div>
            <h2 className='mt-4 font-display text-2xl font-extrabold leading-[1.05] tracking-[-.04em] sm:text-4xl lg:text-5xl'>
              Turn a folder of photos into a story.
            </h2>
            <p className='mt-3 text-xs leading-relaxed text-zinc-400 sm:text-base'>
              Dumping 50 photos into a gallery is forgettable. The AI Director picks the strongest opening portrait, arranges the shoot into a natural sequence, writes clean story chapters from your notes, and pairs the mood with cinema-grade music.
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
                  Photographer (4 Steps)
                </button>
                <button
                  onClick={() => setActiveWorkflowTab('client')}
                  className={`rounded-lg py-2 text-center text-xs font-extrabold transition ${
                    activeWorkflowTab === 'client'
                      ? 'bg-[#ff5a47] text-white shadow-md shadow-[#ff5a47]/25'
                      : 'text-zinc-400 hover:text-white'
                  }`}>
                  Client Experience
                </button>
              </div>
            </div>
          </div>

          <div className='mt-10'>
            {activeWorkflowTab === 'photographer' ? (
              <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
                {[
                  {
                    step: '01',
                    stage: 'PRE-DELIVERY',
                    title: 'Upload Proofs & Set Quota',
                    subtitle: 'Quick cull · Proof watermarks · 15 limit',
                    desc: 'Remove blurry or test shots, upload usable proofs, set a 15-photo package limit and an optional deadline. Send the private WhatsApp link.'
                  },
                  {
                    step: '02',
                    stage: 'CLIENT PROOFING',
                    title: 'Client Selects on Mobile',
                    subtitle: 'No login · Live counter · Retouch notes',
                    desc: 'Your client opens the link on their phone, taps their favorites with a live counter (e.g. 12/15), adds editing notes, and hits Submit.'
                  },
                  {
                    step: '03',
                    stage: 'STUDIO AI',
                    title: 'Retouch & AI Story Draft',
                    subtitle: 'Finished edits · Natural sequence & music',
                    desc: 'Retouch only the photos they selected. Upload your edits and let Veylo organize the story sequence, write chapter titles, and sync the music.'
                  },
                  {
                    step: '04',
                    stage: 'FINAL DELIVERY',
                    title: 'Premiere & Deliver',
                    subtitle: 'Branded link · Full gallery downloads',
                    desc: 'Send the final link. Your client watches their Photo Story premiere first, then downloads full-resolution photos individually or as a complete zip.'
                  }
                ].map((item) => (
                  <div
                    key={item.step}
                    className='rounded-2xl border border-white/10 bg-[#111115] p-5 transition hover:border-white/20 sm:p-6'>
                    <div className='flex items-center justify-between'>
                      <span className='font-mono text-xs font-bold text-[#ff6b57]'>{item.step}</span>
                      <span className='rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-400'>
                        {item.stage}
                      </span>
                    </div>
                    <h3 className='mt-3 text-lg font-extrabold text-white'>{item.title}</h3>
                    <p className='mt-1 text-[10px] font-bold uppercase tracking-wider text-[#ff9b8e]'>{item.subtitle}</p>
                    <p className='mt-2.5 text-xs leading-relaxed text-zinc-400'>{item.desc}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className='grid gap-4 md:grid-cols-3'>
                {[
                  {
                    step: '01',
                    stage: 'SELECTION',
                    title: 'Choose Favorites on Phone',
                    subtitle: 'Clean mobile gallery · 1-click select',
                    desc: 'Open the WhatsApp link. Browse watermarked proofs, tap your favorite photos up to your package allowance, add editing notes, and tap Submit.'
                  },
                  {
                    step: '02',
                    stage: 'PREMIERE',
                    title: 'Watch Your Story Premiere',
                    subtitle: 'Music · Photo motion · Story headlines',
                    desc: 'When your photographer finishes editing, tap your delivery link. Music plays, photos glide smoothly, and story headlines highlight your moments.'
                  },
                  {
                    step: '03',
                    stage: 'GALLERY',
                    title: 'Download Full-Res Photos',
                    subtitle: 'Full-screen view · 1-click individual & bulk zip',
                    desc: 'Right after the premiere, the full gallery unlocks. Save individual favorites to your camera roll or download all high-res photos in one tap.'
                  }
                ].map((item) => (
                  <div
                    key={item.step}
                    className='rounded-2xl border border-white/10 bg-[#111115] p-5 transition hover:border-white/20 sm:p-6'>
                    <div className='flex items-center justify-between'>
                      <span className='font-mono text-xs font-bold text-[#ff6b57]'>{item.step}</span>
                      <span className='rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-400'>
                        {item.stage}
                      </span>
                    </div>
                    <h3 className='mt-3 text-lg font-extrabold text-white'>{item.title}</h3>
                    <p className='mt-1 text-[10px] font-bold uppercase tracking-wider text-[#ff9b8e]'>{item.subtitle}</p>
                    <p className='mt-2.5 text-xs leading-relaxed text-zinc-400'>{item.desc}</p>
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
              <Camera size={14} /> Your Photography Stays Untouched
            </div>
            <h2 className='mt-3 font-display text-2xl font-extrabold leading-[1.05] tracking-[-.04em] sm:text-4xl lg:text-5xl'>
              Your photography stays your photography.
            </h2>
            <p className='mt-3 text-xs leading-relaxed text-zinc-300 sm:text-sm sm:leading-6'>
              Veylo never generates fake AI pixels, never modifies your color grading, and never crops your framing. We don't try to be an all-in-one CRM, an invoicing tool, or a complex website builder.
            </p>
            <p className='mt-2 text-xs font-semibold text-white sm:text-sm'>
              We do one thing: help you run simple photo selection and deliver finished shoots in a way that truly wows your clients.
            </p>
            <div className='mt-5 flex flex-wrap gap-2'>
              <div className='rounded-lg border border-white/15 bg-black/60 px-3 py-1.5 text-[10px] font-bold text-white backdrop-blur-md sm:text-xs'>
                ✓ No AI face altering
              </div>
              <div className='rounded-lg border border-white/15 bg-black/60 px-3 py-1.5 text-[10px] font-bold text-white backdrop-blur-md sm:text-xs'>
                ✓ Color grading preserved
              </div>
              <div className='rounded-lg border border-white/15 bg-black/60 px-3 py-1.5 text-[10px] font-bold text-white backdrop-blur-md sm:text-xs'>
                ✓ Pristine original resolution
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
              <p className='text-xs font-extrabold uppercase tracking-[.24em] text-[#ff6b57]'>Music & Storytelling</p>
              <h2 className='mt-2 font-display text-2xl font-extrabold leading-[1.05] tracking-[-.04em] sm:text-4xl'>
                Two ways to tell the story.
              </h2>
            </div>
            <p className='text-xs leading-relaxed text-zinc-400 sm:text-sm'>
              Keep it minimalist with background music and story headlines, or turn on spoken voiceover for emotional milestone shoots. You decide.
            </p>
          </div>

          <div className='grid gap-4 md:grid-cols-2'>
            <div className='rounded-2xl border border-white/10 bg-[#111115] p-5 sm:p-8'>
              <div className='grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-[#ff6b57]'>
                <Type size={20} />
              </div>
              <h3 className='mt-4 text-lg font-extrabold text-white sm:text-xl'>Mode A: Music + Story Headlines</h3>
              <p className='mt-2 text-xs leading-relaxed text-zinc-400 sm:text-sm'>
                Clean editorial text appears on key photos while a cinema track plays in the background. Understated and timeless—perfect for fashion lookbooks, studio portraits, and birthday sessions.
              </p>
              <div className='mt-4 rounded-lg border border-white/10 bg-black/40 p-3 text-xs italic text-zinc-300'>
                “Thirty enters the room before she says a word.”
              </div>
            </div>

            <div className='rounded-2xl border border-[#ff5a47]/30 bg-[#ff5a47]/[.05] p-5 sm:p-8'>
              <div className='grid h-10 w-10 place-items-center rounded-xl bg-[#ff5a47]/15 text-[#ff7b69]'>
                <Mic2 size={20} />
              </div>
              <h3 className='mt-4 text-lg font-extrabold text-white sm:text-xl'>Mode B: Music + Spoken Voiceover</h3>
              <p className='mt-2 text-xs leading-relaxed text-zinc-300 sm:text-sm'>
                Veylo writes a warm, short narration based on your shoot notes and reads it aloud over the music. Great for emotional weddings, anniversary tributes, and videos clients share on TikTok or Instagram.
              </p>
              <div className='mt-4 rounded-lg border border-[#ff5a47]/30 bg-black/60 p-3 text-xs font-semibold text-[#ff9b8e]'>
                ✦ Spoken voiceover: “She built this version of herself in rooms where no one applauded...”
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
