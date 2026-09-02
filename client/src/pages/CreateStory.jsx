import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Camera,
  Film,
  Music,
  Trash2,
  Upload,
  RefreshCw,
  Play,
  Pause,
  ArrowRight,
  ArrowLeft,
  X,
  Palette,
  Sliders,
  Check,
  ChevronDown,
  Image as ImageIcon
} from 'lucide-react';
import api from '../services/api.js';
import { toast } from 'react-toastify';
import { uploadImageToCloudinary } from '../utils/cloudinaryService.js';
import {
  CURATED_SOUNDTRACKS,
  SOUNDTRACK_GENRES,
  THEME_PRESETS
} from '../constants/photoStoryConstants.js';

export default function CreateStory({ user }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  // Form State
  const [formData, setFormData] = useState({
    clientName: '',
    occasion: '',
    adminDescription: '',
    title: '',
    storySummary: '',
    theme: {
      palette: 'midnight_velvet',
      typography: 'cinematic_serif',
      vibeTag: 'Midnight Radiance',
      bgGradient: 'from-[#0D0B18] via-[#1E1138] to-[#08080C]',
      accentColor: '#A24CF3',
      glowColor: 'rgba(162, 76, 243, 0.35)'
    },
    soundtrack: CURATED_SOUNDTRACKS[0],
    photos: []
  });

  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiProgressText, setAiProgressText] = useState('Analyzing occasion...');

  // Soundtrack Picker Modal & Audio Preview
  const [showSoundtrackModal, setShowSoundtrackModal] = useState(false);
  const [soundtrackSearch, setSoundtrackSearch] = useState('');
  const [soundtrackGenre, setSoundtrackGenre] = useState('All');
  const [previewAudioUrl, setPreviewAudioUrl] = useState(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const audioPreviewRef = useRef(null);
  const audioFileInputRef = useRef(null);
  const [uploadingAudio, setUploadingAudio] = useState(false);

  const fileInputRef = useRef(null);

  const toggleAudioPreview = (trackUrl) => {
    if (!trackUrl) return;
    if (previewAudioUrl === trackUrl && isPlayingPreview) {
      audioPreviewRef.current?.pause();
      setIsPlayingPreview(false);
    } else {
      setPreviewAudioUrl(trackUrl);
      setIsPlayingPreview(true);
      if (audioPreviewRef.current) {
        audioPreviewRef.current.src = trackUrl;
        audioPreviewRef.current.play().catch(() => setIsPlayingPreview(false));
      }
    }
  };

  const handleCustomAudioUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingAudio(true);
      toast.info('Uploading custom soundtrack...');
      const cloudRes = await uploadImageToCloudinary(file, {
        folder: 'assets/cinestory/audio',
        resource_type: 'auto'
      });

      const customTrack = {
        id: `custom_${Date.now()}`,
        title: file.name.replace(/\.[^/.]+$/, ''),
        artist: 'Custom Music',
        genre: 'Custom',
        audioUrl: cloudRes.url,
        durationSec: 180
      };

      setFormData((prev) => ({ ...prev, soundtrack: customTrack }));
      setShowSoundtrackModal(false);
      toast.success(`🎵 "${customTrack.title}" attached!`);
    } catch (err) {
      toast.error('Failed to upload custom audio: ' + err.message);
    } finally {
      setUploadingAudio(false);
    }
  };

  const handlePhotoUpload = async (files) => {
    const fileArray = Array.from(files || []);
    if (fileArray.length === 0) return;

    setUploadingPhotos(true);
    setUploadProgress(0);

    const uploadedList = [];
    const total = fileArray.length;

    for (let i = 0; i < total; i++) {
      const file = fileArray[i];
      try {
        const result = await uploadImageToCloudinary(file, {
          folder: 'assets/cinestory/photos',
          onProgress: (p) => {
            setUploadProgress(Math.round(((i + p / 100) / total) * 100));
          }
        });

        uploadedList.push({
          id: `ph_${Date.now()}_${i}`,
          url: result.url,
          thumbnailUrl: result.thumbnailUrl || result.url,
          chapterTitle: `Moment ${formData.photos.length + uploadedList.length + 1}`,
          caption: 'A memorable capture.',
          typographyStyle: 'typewriter',
          textAnimation: 'typewriter',
          captionPosition: 'bottom',
          zoomEffect: 'zoom_in',
          colorAccent: formData.theme?.accentColor || '#A24CF3',
          duration: 5.5
        });
      } catch (err) {
        toast.error(`Failed to upload ${file.name}`);
      }
    }

    if (uploadedList.length > 0) {
      setFormData((prev) => ({
        ...prev,
        photos: [...prev.photos, ...uploadedList]
      }));
      toast.success(`Uploaded ${uploadedList.length} photos!`);
    }
    setUploadingPhotos(false);
    setUploadProgress(100);
  };

  const handleGenerateAiStory = async () => {
    if (!formData.clientName?.trim()) {
      toast.error('Client Name is required.');
      return;
    }
    if (!formData.occasion?.trim()) {
      toast.error('Occasion is mandatory so AI can craft an authentic story!');
      return;
    }
    if (formData.photos.length === 0) {
      toast.error('Please upload at least one photo.');
      return;
    }

    setStep(2);
    setAiGenerating(true);

    const states = [
      `Analyzing "${formData.occasion}" occasion narrative...`,
      'Crafting bespoke human editorial captions...',
      'Matching luxury theme and color palette...',
      'Curating cinematic soundscape...',
      'Finalizing AI Director\'s Cut...'
    ];
    let sIdx = 0;
    const interval = setInterval(() => {
      sIdx = (sIdx + 1) % states.length;
      setAiProgressText(states[sIdx]);
    }, 1400);

    try {
      const res = await api.post('/v1/stories/ai-generate', {
        clientName: formData.clientName.trim(),
        occasion: formData.occasion.trim(),
        adminDescription: formData.adminDescription?.trim() || '',
        photos: formData.photos,
        selectedSoundtrackId: formData.soundtrack?.id || formData.soundtrack?.title
      });

      if (res.data?.success && res.data.data) {
        const gen = res.data.data;
        setFormData((prev) => ({
          ...prev,
          title: gen.title || prev.title,
          storySummary: gen.storySummary || prev.storySummary,
          theme: gen.theme || prev.theme,
          soundtrack: gen.soundtrack || prev.soundtrack,
          photos: gen.photos || prev.photos
        }));
        toast.success('✨ AI Story Director crafted your story!');
        setStep(3);
      } else {
        throw new Error('AI generation failed');
      }
    } catch (err) {
      toast.error('AI generation failed. Please try again.');
      setStep(1);
    } finally {
      clearInterval(interval);
      setAiGenerating(false);
    }
  };

  const handleSaveAndPublish = async () => {
    try {
      const res = await api.post('/v1/stories', formData);
      if (res.data?.success) {
        toast.success('🎉 Story published successfully!');
        navigate(`/story/${res.data.data.storyId}`);
      }
    } catch (err) {
      toast.error('Failed to publish story');
    }
  };

  const filteredSoundtracks = CURATED_SOUNDTRACKS.filter((st) => {
    const matchesGenre = soundtrackGenre === 'All' || st.genre === soundtrackGenre;
    const matchesSearch =
      soundtrackSearch === '' ||
      st.title.toLowerCase().includes(soundtrackSearch.toLowerCase()) ||
      st.genre.toLowerCase().includes(soundtrackSearch.toLowerCase());
    return matchesGenre && matchesSearch;
  });

  return (
    <div className='min-h-screen bg-[#070709] text-white pt-28 pb-20 px-5 sm:px-8 max-w-5xl mx-auto'>
      <audio ref={audioPreviewRef} onEnded={() => setIsPlayingPreview(false)} className='hidden' />

      <AnimatePresence mode='wait'>
        {/* ─── STEP 1 ─── */}
        {step === 1 && (
          <motion.div key='step1' initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className='space-y-8 bg-[#111116] p-6 sm:p-10 rounded-3xl border border-white/10'>
            <div className='text-center space-y-1.5'>
              <span className='text-xs font-bold uppercase tracking-widest text-purple-400'>Step 1 of 3</span>
              <h1 className='text-3xl font-black text-white'>Setup & Master Photos</h1>
              <p className='text-xs text-gray-400'>Tell the AI who the story is for and upload your master captures.</p>
            </div>

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-5'>
              <div>
                <label className='block text-xs font-bold text-gray-300 mb-2 uppercase'>Client / Celebrant Name *</label>
                <input
                  type='text'
                  required
                  placeholder='e.g. Stephanie Okon'
                  value={formData.clientName}
                  onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                  className='w-full bg-[#181820] border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white outline-none focus:border-purple-500'
                />
              </div>
              <div>
                <label className='block text-xs font-bold text-gray-300 mb-2 uppercase'>Occasion * (Mandatory)</label>
                <input
                  type='text'
                  required
                  placeholder='e.g. 25th Birthday Glamour / Traditional Wedding'
                  value={formData.occasion}
                  onChange={(e) => setFormData({ ...formData, occasion: e.target.value })}
                  className='w-full bg-[#181820] border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white outline-none focus:border-purple-500'
                />
              </div>
              <div className='sm:col-span-2'>
                <label className='block text-xs font-bold text-gray-300 mb-2 uppercase'>Director Notes / Vibe (Optional)</label>
                <textarea
                  rows={2}
                  placeholder='e.g. "Highlight her royal beads, gold lighting, and entering her golden era"'
                  value={formData.adminDescription}
                  onChange={(e) => setFormData({ ...formData, adminDescription: e.target.value })}
                  className='w-full bg-[#181820] border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white outline-none focus:border-purple-500 resize-none'
                />
              </div>
            </div>

            {/* Upload Zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className='border-2 border-dashed border-white/15 hover:border-purple-500 rounded-3xl p-10 text-center cursor-pointer transition-colors bg-white/5'>
              <input type='file' multiple accept='image/*' ref={fileInputRef} className='hidden' onChange={(e) => handlePhotoUpload(e.target.files)} />
              {uploadingPhotos ? (
                <div className='space-y-3'>
                  <RefreshCw className='animate-spin mx-auto text-purple-400' size={32} />
                  <p className='text-sm font-bold'>Uploading {uploadProgress}%</p>
                </div>
              ) : (
                <div className='space-y-2'>
                  <ImageIcon size={32} className='mx-auto text-purple-400' />
                  <p className='font-bold text-base text-white'>Click to Upload Master Photos</p>
                  <p className='text-xs text-gray-400'>({formData.photos.length} photos ready)</p>
                </div>
              )}
            </div>

            {formData.photos.length > 0 && (
              <div className='flex justify-end'>
                <button
                  type='button'
                  onClick={handleGenerateAiStory}
                  className='bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white px-8 py-4 rounded-2xl font-black text-sm shadow-xl shadow-purple-600/30 flex items-center gap-2 hover:scale-105 active:scale-95 transition-all'>
                  <Sparkles size={16} />
                  <span>AI Direct This Story</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* ─── STEP 2 ─── */}
        {step === 2 && (
          <motion.div key='step2' initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className='flex flex-col items-center justify-center min-h-[460px] text-center space-y-6'>
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 4, ease: 'linear' }} className='relative w-28 h-28'>
              <div className='absolute inset-0 rounded-full border-t-2 border-purple-500 border-r-2 border-transparent border-b-2 border-indigo-500' />
              <Sparkles size={36} className='absolute inset-0 m-auto text-purple-400' />
            </motion.div>
            <div className='space-y-2'>
              <h2 className='text-2xl font-black text-white'>Directing Your Story...</h2>
              <p className='text-purple-400 text-sm font-medium'>{aiProgressText}</p>
            </div>
          </motion.div>
        )}

        {/* ─── STEP 3 ─── */}
        {step === 3 && (
          <motion.div key='step3' initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className='space-y-6'>
            <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#111116] p-6 rounded-3xl border border-white/10'>
              <div>
                <span className='text-xs font-bold uppercase tracking-widest text-emerald-400'>Step 3 of 3</span>
                <h2 className='text-2xl font-black text-white'>Director's Review & Customization</h2>
              </div>
              <div className='flex gap-3'>
                <button onClick={() => setStep(1)} className='px-4 py-2.5 rounded-xl bg-white/10 text-xs font-bold'>Back</button>
                <button onClick={handleSaveAndPublish} className='bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-7 py-2.5 rounded-xl font-black text-xs shadow-lg shadow-emerald-500/30 flex items-center gap-1.5'>
                  <Check size={14}/> Publish & Watch Premiere
                </button>
              </div>
            </div>

            <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
              {/* Meta & Customization */}
              <div className='bg-[#111116] p-6 rounded-3xl border border-white/10 space-y-4 h-fit'>
                <div>
                  <label className='block text-xs font-bold text-gray-400 mb-1 uppercase'>Title</label>
                  <input
                    type='text'
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className='w-full bg-[#181820] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-purple-500'
                  />
                </div>

                <div>
                  <label className='block text-xs font-bold text-gray-400 mb-1 uppercase'>Summary</label>
                  <textarea
                    rows={3}
                    value={formData.storySummary}
                    onChange={(e) => setFormData({ ...formData, storySummary: e.target.value })}
                    className='w-full bg-[#181820] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-purple-500 resize-none'
                  />
                </div>

                {/* Theme Selector */}
                <div>
                  <label className='block text-xs font-bold text-gray-400 mb-1 uppercase'>Theme Palette</label>
                  <select
                    value={formData.theme?.palette}
                    onChange={(e) => {
                      const selected = e.target.value;
                      const preset = THEME_PRESETS[selected] || THEME_PRESETS.midnight_velvet;
                      setFormData((p) => ({ ...p, theme: { palette: selected, ...preset } }));
                    }}
                    className='w-full bg-[#181820] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none capitalize'>
                    {Object.entries(THEME_PRESETS).map(([k, t]) => (
                      <option key={k} value={k}>{t.name} ({t.vibeTag})</option>
                    ))}
                  </select>
                </div>

                {/* Soundtrack Card */}
                <div>
                  <label className='block text-xs font-bold text-gray-400 mb-1 uppercase'>Soundtrack</label>
                  <div className='p-3 rounded-xl bg-[#181820] border border-white/10 space-y-2'>
                    <div className='flex items-center gap-2'>
                      <button
                        type='button'
                        onClick={() => toggleAudioPreview(formData.soundtrack?.audioUrl)}
                        className='w-7 h-7 rounded-full bg-purple-600/30 text-purple-300 flex items-center justify-center shrink-0'>
                        {previewAudioUrl === formData.soundtrack?.audioUrl && isPlayingPreview ? <Pause size={12}/> : <Play size={12}/>}
                      </button>
                      <p className='text-xs font-bold text-white truncate'>{formData.soundtrack?.title || 'Selected Track'}</p>
                    </div>
                    <div className='grid grid-cols-2 gap-2 pt-1 border-t border-white/10'>
                      <button onClick={() => setShowSoundtrackModal(true)} className='py-1.5 rounded-lg bg-white/10 text-[10px] font-bold'>Choose Music</button>
                      <button onClick={() => audioFileInputRef.current?.click()} className='py-1.5 rounded-lg bg-purple-600/20 text-purple-300 text-[10px] font-bold'>Upload MP3</button>
                      <input type='file' accept='audio/*' ref={audioFileInputRef} className='hidden' onChange={handleCustomAudioUpload} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Storyboard Review */}
              <div className='lg:col-span-2 space-y-4'>
                <h3 className='text-xs font-bold uppercase text-gray-400'>Captions & Storyboard ({formData.photos.length} slides)</h3>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-1'>
                  {formData.photos.map((photo, idx) => (
                    <div key={idx} className='bg-[#111116] border border-white/10 rounded-2xl overflow-hidden'>
                      <div className='aspect-video relative bg-black'>
                        <img src={photo.thumbnailUrl || photo.url} alt='' className='w-full h-full object-cover' />
                      </div>
                      <div className='p-3 space-y-2 bg-[#181820]'>
                        <input
                          type='text'
                          value={photo.chapterTitle}
                          onChange={(e) => {
                            const next = [...formData.photos];
                            next[idx].chapterTitle = e.target.value;
                            setFormData({ ...formData, photos: next });
                          }}
                          className='w-full bg-transparent font-bold text-xs outline-none text-white border-b border-white/10'
                        />
                        <textarea
                          rows={2}
                          value={photo.caption}
                          onChange={(e) => {
                            const next = [...formData.photos];
                            next[idx].caption = e.target.value;
                            setFormData({ ...formData, photos: next });
                          }}
                          className='w-full bg-transparent text-xs text-gray-300 outline-none resize-none'
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Soundtrack Modal */}
      <AnimatePresence>
        {showSoundtrackModal && (
          <div className='fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4'>
            <div className='bg-[#111116] border border-white/15 w-full max-w-2xl max-h-[80vh] rounded-3xl flex flex-col overflow-hidden'>
              <div className='p-5 border-b border-white/10 flex items-center justify-between'>
                <h3 className='font-black text-white text-lg flex items-center gap-2'><Music size={18} className='text-purple-400'/> Soundtracks</h3>
                <button onClick={() => setShowSoundtrackModal(false)}><X size={18}/></button>
              </div>
              <div className='p-4 overflow-y-auto divide-y divide-white/5 flex-1'>
                {filteredSoundtracks.map((st) => (
                  <div key={st.id} className='py-2.5 flex items-center justify-between gap-3'>
                    <div className='flex items-center gap-2.5 min-w-0 flex-1'>
                      <button onClick={() => toggleAudioPreview(st.audioUrl)} className='w-8 h-8 rounded-full bg-white/10 flex items-center justify-center'>
                        {previewAudioUrl === st.audioUrl && isPlayingPreview ? <Pause size={12}/> : <Play size={12}/>}
                      </button>
                      <div className='min-w-0 flex-1'>
                        <p className='text-xs font-bold text-white truncate'>{st.title}</p>
                        <p className='text-[10px] text-gray-400 truncate'>{st.artist} • {st.genre}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setFormData((p) => ({ ...p, soundtrack: st }));
                        setShowSoundtrackModal(false);
                      }}
                      className='px-3 py-1 rounded-lg bg-purple-600 text-white text-xs font-bold'>
                      Select
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
