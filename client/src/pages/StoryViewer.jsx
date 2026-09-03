import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Play, Pause, Volume2, VolumeX, Download, Share2, Sparkles, X, Grid, Eye, EyeOff } from 'lucide-react';
import api from '../services/api.js';
import { API_BASE_URL } from '../config/env.js';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';

export default function StoryViewer() {
  const { storyId } = useParams();
  const navigate = useNavigate();
  const [story, setStory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [hasStarted, setHasStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isManuallyPaused, setIsManuallyPaused] = useState(false);
  const [isHoldingScreen, setIsHoldingScreen] = useState(false);
  const isPaused = isManuallyPaused || isHoldingScreen;
  const [progress, setProgress] = useState(0);

  const [isMuted, setIsMuted] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [hideCaptions, setHideCaptions] = useState(false);

  // Swipe Gestures
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  const [showGridDrawer, setShowGridDrawer] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

  const audioRef = useRef(null);

  useEffect(() => {
    const fetchStory = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/v1/stories/public/${storyId}`);
        if (res.data?.success) {
          setStory(res.data.data);
        } else {
          setError('Story not found');
        }
      } catch (err) {
        setError('Story not available');
      } finally {
        setLoading(false);
      }
    };
    if (storyId) fetchStory();
  }, [storyId]);

  const totalSlides = (story?.photos?.length || 0) + 1;
  const isFinaleSlide = currentIndex === (story?.photos?.length || 0);
  const currentPhoto = story?.photos?.[currentIndex];
  const themeAccent = story?.theme?.accentColor || '#A24CF3';
  const themeGlow = story?.theme?.glowColor || 'rgba(162, 76, 243, 0.35)';

  const startPlayback = () => {
    setHasStarted(true);
    setCurrentIndex(0);
    setProgress(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.muted = false;
      audioRef.current.play().then(() => setIsPlayingAudio(true)).catch(() => {});
    }
  };

  useEffect(() => {
    if (!audioRef.current || isMuted || !hasStarted) return;
    if (isPaused || showGridDrawer) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play().then(() => setIsPlayingAudio(true)).catch(() => {});
    }
  }, [isPaused, showGridDrawer, isMuted, hasStarted]);

  useEffect(() => {
    if (!hasStarted || isPaused || isFinaleSlide || showGridDrawer) return;
    const duration = (currentPhoto?.duration || 5.5) * 1000;
    const intervalTime = 50;
    const increment = (intervalTime / duration) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          if (currentIndex < totalSlides - 1) setCurrentIndex((c) => c + 1);
          else setCurrentIndex(0);
          return 0;
        }
        return prev + increment;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [hasStarted, isPaused, currentIndex, currentPhoto, isFinaleSlide, showGridDrawer]);

  const handleNextSlide = () => {
    setProgress(0);
    if (currentIndex < totalSlides - 1) {
      setCurrentIndex((c) => c + 1);
    } else {
      setCurrentIndex(0);
    }
  };

  const handlePrevSlide = () => {
    setProgress(0);
    if (currentIndex > 0) {
      setCurrentIndex((c) => c - 1);
    } else {
      setCurrentIndex(totalSlides - 1);
    }
  };

  // Swipe handlers (Swipe Left -> Next, Swipe Right -> Prev)
  const minSwipeDistance = 45;
  const onTouchStart = (e) => {
    setTouchEnd(null);
    if (e.targetTouches && e.targetTouches.length > 0) {
      setTouchStart(e.targetTouches[0].clientX);
    }
  };
  const onTouchMove = (e) => {
    if (e.targetTouches && e.targetTouches.length > 0) {
      setTouchEnd(e.targetTouches[0].clientX);
    }
  };
  const onTouchEnd = () => {
    if (touchStart === null || touchEnd === null) return;
    const distance = touchStart - touchEnd;
    if (distance > minSwipeDistance) {
      handleNextSlide();
    } else if (distance < -minSwipeDistance) {
      handlePrevSlide();
    }
    setTouchStart(null);
    setTouchEnd(null);
  };

  const handleDownloadAll = async () => {
    if (!story?.photos?.length || isDownloadingAll) return;
    try {
      setIsDownloadingAll(true);
      toast.info('Downloading all master photos...');
      for (let i = 0; i < story.photos.length; i++) {
        const p = story.photos[i];
        const res = await fetch(p.url);
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${story.clientName}_Photo_${i + 1}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        await new Promise((r) => setTimeout(r, 350));
      }
      api.post(`/v1/stories/public/${storyId}/track-download`).catch(() => {});
      toast.success('🎉 All master photos downloaded!');
    } catch (e) {
      toast.error('Download error');
    } finally {
      setIsDownloadingAll(false);
    }
  };

  if (loading) return <div className='fixed inset-0 bg-black text-white flex items-center justify-center font-bold'>Loading Cinematic Story...</div>;
  if (error || !story) return <div className='fixed inset-0 bg-black text-white flex flex-col items-center justify-center p-6 text-center'><h2 className='text-xl font-bold mb-2'>Story Unavailable</h2><Link to='/' className='px-6 py-2 rounded-full bg-white text-black text-xs font-bold'>Go Home</Link></div>;

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className='fixed inset-0 w-screen h-[100dvh] bg-[#070709] text-white flex items-center justify-center select-none overflow-hidden touch-none z-50'>
      
      {story.soundtrack?.audioUrl && (
        <audio
          ref={audioRef}
          src={story.soundtrack.audioUrl.startsWith('http') ? `${API_BASE_URL}/v1/stories/proxy/audio-stream?url=${encodeURIComponent(story.soundtrack.audioUrl)}` : story.soundtrack.audioUrl}
          loop
          preload='auto'
          playsInline
          className='hidden'
        />
      )}

      {/* Main Story Canvas */}
      <div
        onMouseDown={() => hasStarted && setIsHoldingScreen(true)}
        onMouseUp={() => hasStarted && setIsHoldingScreen(false)}
        onTouchStart={() => hasStarted && setIsHoldingScreen(true)}
        onTouchEnd={() => hasStarted && setIsHoldingScreen(false)}
        className='relative w-full h-full lg:max-w-[420px] lg:h-[92vh] lg:rounded-3xl overflow-hidden bg-black shadow-2xl flex flex-col justify-between border-0 lg:border lg:border-white/15'>
        
        {/* Top Bar */}
        <div className='relative z-40 px-4 pt-3.5 pb-2.5 bg-gradient-to-b from-black/90 to-transparent space-y-2.5 pointer-events-auto'>
          {/* Progress */}
          <div className='flex gap-1.5'>
            {Array.from({ length: totalSlides }).map((_, idx) => (
              <div key={idx} className='flex-1 h-[2.5px] rounded-full bg-white/25 overflow-hidden'>
                <div className='h-full transition-all duration-75' style={{ backgroundColor: idx === currentIndex ? themeAccent : '#FFFFFF', width: idx < currentIndex ? '100%' : idx === currentIndex ? `${progress}%` : '0%' }} />
              </div>
            ))}
          </div>

          {/* Header */}
          <div className='flex items-center justify-between text-white'>
            <div className='flex items-center gap-2 min-w-0'>
              <div className='w-8 h-8 rounded-full p-[2px]' style={{ background: `linear-gradient(135deg, ${themeAccent}, #F59E0B)` }}>
                <div className='w-full h-full bg-black rounded-full flex items-center justify-center text-[10px] font-black'>✦</div>
              </div>
              <div className='truncate'>
                <p className='text-xs font-bold truncate leading-none'>{story.clientName}</p>
                <p className='text-[10px] text-white/70 truncate mt-1 leading-none'>{story.occasion}</p>
              </div>
            </div>

            <div className='flex items-center gap-1.5'>
              {hasStarted && !isFinaleSlide && (
                <button onClick={(e) => { e.stopPropagation(); setHideCaptions((h) => !h); }} className='w-7 h-7 rounded-full bg-black/40 flex items-center justify-center'>
                  {hideCaptions ? <EyeOff size={13}/> : <Eye size={13}/>}
                </button>
              )}
              {hasStarted && (
                <button onClick={(e) => { e.stopPropagation(); setIsManuallyPaused((p) => !p); }} className='w-7 h-7 rounded-full bg-black/40 flex items-center justify-center'>
                  {isManuallyPaused ? <Play size={12}/> : <Pause size={12}/>}
                </button>
              )}
              <button onClick={(e) => { e.stopPropagation(); navigate('/'); }} className='w-7 h-7 rounded-full bg-black/40 flex items-center justify-center'>
                <X size={13}/>
              </button>
            </div>
          </div>
        </div>

        {/* Cover / Slide / Finale */}
        <div className='absolute inset-0 z-10 flex items-center justify-center bg-black overflow-hidden'>
          {!hasStarted && (
            <div onClick={startPlayback} className='w-full h-full p-6 flex flex-col justify-between items-center text-center relative cursor-pointer'>
              {story.photos?.[0] && <img src={story.photos[0].url} alt='' className='absolute inset-0 w-full h-full object-cover opacity-45 filter blur-[3px]' />}
              <div className='absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent' />
              <div className='mt-12 z-20 space-y-2'>
                <span className='px-3 py-1 rounded-full bg-white/10 text-[10px] font-black uppercase tracking-widest' style={{ color: themeAccent }}>CINEMATIC PREMIERE</span>
                <h1 className='text-3xl font-black text-white font-serif'>{story.clientName}</h1>
                <p className='text-xs text-white/80 font-medium'>{story.occasion}</p>
              </div>
              <div className='mb-12 z-20 w-full max-w-xs'>
                <button className='w-full py-4 rounded-2xl text-white font-extrabold text-sm shadow-xl flex items-center justify-center gap-2' style={{ background: `linear-gradient(135deg, ${themeAccent}, #7E2CD8)` }}>
                  <Play size={16}/> Watch Premiere
                </button>
              </div>
            </div>
          )}

          {hasStarted && !isFinaleSlide && currentPhoto && (
            <>
              <motion.img
                key={currentIndex}
                src={currentPhoto.url}
                alt=''
                initial={{ scale: 1.02, opacity: 0 }}
                animate={{ scale: 1.1, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 5.5, ease: 'linear' }}
                className='absolute inset-0 w-full h-full object-cover'
              />
              <div className='absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/80 to-transparent pointer-events-none' />
              
              {!hideCaptions && currentPhoto.caption && (
                <div className='absolute bottom-5 inset-x-3 z-30 pointer-events-none'>
                  <div className='max-w-sm mx-auto px-4 py-2.5 rounded-2xl bg-black/65 backdrop-blur-xl border border-white/15 text-left space-y-1'>
                    <span className='text-[10px] font-black uppercase' style={{ color: themeAccent }}>✦ {currentPhoto.chapterTitle}</span>
                    <p className='text-xs sm:text-sm font-medium text-white'>{currentPhoto.caption}</p>
                  </div>
                </div>
              )}
            </>
          )}

          {hasStarted && isFinaleSlide && (
            <div className='w-full h-full p-6 flex flex-col justify-between items-center text-center relative z-20'>
              <div className='mt-24 space-y-3'>
                <span className='text-[10px] font-black uppercase px-3 py-1 rounded-full bg-white/10' style={{ color: themeAccent }}>PREMIERE FINALE</span>
                <h2 className='text-3xl font-black font-serif'>Thank You, {story.clientName}!</h2>
                <p className='text-xs text-gray-400 max-w-xs'>{story.storySummary || 'All your master photoshoot captures are ready.'}</p>
              </div>
              <div className='w-full max-w-xs space-y-2 mb-8'>
                <button onClick={handleDownloadAll} disabled={isDownloadingAll} className='w-full py-3.5 rounded-2xl bg-emerald-500 font-bold text-xs flex items-center justify-center gap-2'>
                  <Download size={14}/> Download All Photos
                </button>
                <button onClick={() => setShowGridDrawer(true)} className='w-full py-3 rounded-2xl bg-white/10 text-xs font-bold flex items-center justify-center gap-2'>
                  <Grid size={14}/> View Gallery
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tap navigation (50% Left = Prev, 50% Right = Next) */}
        {hasStarted && !isFinaleSlide && (
          <div className='absolute inset-0 z-20 flex'>
            <div
              onClick={(e) => {
                e.stopPropagation();
                handlePrevSlide();
              }}
              className='w-1/2 h-full cursor-w-resize'
              aria-label='Previous Slide'
            />
            <div
              onClick={(e) => {
                e.stopPropagation();
                handleNextSlide();
              }}
              className='w-1/2 h-full cursor-e-resize'
              aria-label='Next Slide'
            />
          </div>
        )}
      </div>

      {/* Grid Drawer */}
      <AnimatePresence>
        {showGridDrawer && (
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className='fixed inset-0 z-50 bg-black text-white flex flex-col'>
            <div className='p-4 border-b border-white/10 flex items-center justify-between'>
              <h3 className='font-bold text-sm'>{story.title}</h3>
              <button onClick={() => setShowGridDrawer(false)}><X size={18}/></button>
            </div>
            <div className='flex-1 p-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3'>
              {story.photos.map((p, idx) => (
                <div key={idx} className='aspect-[4/5] rounded-xl overflow-hidden relative'>
                  <img src={p.url} alt='' className='w-full h-full object-cover' />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
