import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clapperboard,
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
import { Eyebrow } from '../components/PublicDesign.jsx';
import Footer from '../components/Footer.jsx';
import { useDialogFocus } from '../components/useDialogFocus.js';
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
  const [publishing, setPublishing] = useState(false);

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
  const [aiProgressText, setAiProgressText] = useState('Preparing captions from your shoot notes…');

  // Soundtrack Picker Modal & Audio Preview
  const [showSoundtrackModal, setShowSoundtrackModal] = useState(false);
  const soundtrackDialogRef = useRef(null);
  useDialogFocus(showSoundtrackModal, soundtrackDialogRef, () => setShowSoundtrackModal(false));
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
    if (!file || uploadingAudio) return;
    if (!['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4'].includes(file.type) || file.size > 30 * 1024 * 1024) { toast.error('Choose an audio file up to 30 MB.'); return; }

    try {
      setUploadingAudio(true);
      toast.info('Uploading custom soundtrack...');
      const cloudRes = await uploadImageToCloudinary(file, {
        folder: `veylo/users/${user.id}/audio`,
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
      toast.success(`"${customTrack.title}" attached!`);
    } catch (err) {
      toast.error('Failed to upload custom audio: ' + err.message);
    } finally {
      setUploadingAudio(false);
    }
  };

  const handlePhotoUpload = async (files) => {
    const incoming = Array.from(files || []);
    const fileArray = incoming.filter(file => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 30 * 1024 * 1024);
    if (fileArray.length !== incoming.length) toast.error('Choose JPEG, PNG or WebP photographs up to 30 MB each.');
    if (fileArray.length === 0) return;

    if (uploadingPhotos) return;
    setUploadingPhotos(true);
    setUploadProgress(0);

    const uploadedList = [];
    const total = fileArray.length;

    for (let i = 0; i < total; i++) {
      const file = fileArray[i];
      try {
        const result = await uploadImageToCloudinary(file, {
          folder: `veylo/users/${user.id}/photos`,
          onProgress: (p) => {
            setUploadProgress(Math.round(((i + p / 100) / total) * 100));
          }
        });
        setUploadProgress(Math.round(((i + 1) / total) * 100));

        uploadedList.push({
          id: `ph_${Date.now()}_${i}`,
          url: result.url,
          thumbnailUrl: result.thumbnailUrl || result.url,
          chapterTitle: `Moment ${formData.photos.length + uploadedList.length + 1}`,
          caption: '',
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
      toast.error('Add the occasion so the captions have the right context.');
      return;
    }
    if (formData.photos.length === 0) {
      toast.error('Please upload at least one photo.');
      return;
    }

    setStep(2);
    setAiGenerating(true);

    setAiProgressText('Preparing captions from your shoot notes…');

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
        toast.success('Your story is ready to review.');
        setStep(3);
      } else {
        throw new Error('AI generation failed');
      }
    } catch (err) {
      toast.error('AI generation failed. Please try again.');
      setStep(1);
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSaveAndPublish = async () => {
    if (publishing) return;
    setPublishing(true);
    try {
      if (!formData.clientName?.trim() || !formData.occasion?.trim()) {
        toast.error('Client name and occasion are required.');
        return;
      }
      if (!formData.photos || formData.photos.length === 0) {
        toast.error('Please add at least one photo before saving.');
        return;
      }
      if (!formData.title?.trim()) { toast.error('Add a story title before publishing.'); return; }
      const res = await api.post('/v1/stories', formData);
      if (res.data?.success) {
        toast.success('Story published successfully!');
        navigate(`/story/${res.data.data.storyId}`);
      }
    } catch (err) {
      console.error('Publish error:', err);
      const msg = err.response?.data?.message || err.message || 'Failed to publish story';
      toast.error(msg);
    } finally { setPublishing(false); }
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
   <div className="v-public v-create-page"><div className="v-wrap">
    <header className="v-create-intro"><Eyebrow>Your studio / New Photo Story</Eyebrow><h1 className="v-heading">A finished shoot.<br /><em>A new first look.</em></h1><p className="v-copy">Bring the photographs. We’ll help you put the delivery together.</p></header>
    <ol className="v-create-progress" aria-label="Story preparation steps">{['The photographs', 'The story', 'The final check'].map((label, i) => <li key={label} aria-current={step === i + 1 ? 'step' : undefined}><span>{String(i + 1).padStart(2, '0')}</span>{label}</li>)}</ol>
    <audio ref={audioPreviewRef} onEnded={() => setIsPlayingPreview(false)} className="hidden" />
    <AnimatePresence mode="wait">
     {step === 1 && <motion.div key="details" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="v-create-details">
      <div><Eyebrow number="01">Tell us about the shoot</Eyebrow><div className="v-form mt-7">
       <div className="v-field"><label htmlFor="shoot-client">Client’s name</label><input id="shoot-client" maxLength={100} placeholder="Ada Eze" value={formData.clientName} onChange={e => setFormData({ ...formData, clientName: e.target.value })} /></div>
       <div className="v-field"><label htmlFor="shoot-occasion">The occasion</label><input id="shoot-occasion" maxLength={150} placeholder="e.g. 30th birthday portraits" value={formData.occasion} onChange={e => setFormData({ ...formData, occasion: e.target.value })} /></div>
       <div className="v-field"><label htmlFor="shoot-notes">A few notes (optional)</label><textarea id="shoot-notes" rows={4} maxLength={2000} placeholder="Outfit changes, details to mention, or a note for your client." value={formData.adminDescription} onChange={e => setFormData({ ...formData, adminDescription: e.target.value })} /></div>
       <p className="v-form-note">These details help draft the story captions. Leave out confidential information and review the suggestions before publishing.</p>
      </div></div>
      <div><button className="v-upload-zone" type="button" disabled={uploadingPhotos} onClick={() => fileInputRef.current?.click()}><ImageIcon size={32} /><span>{uploadingPhotos ? 'Uploading photographs… ' + uploadProgress + '%' : 'Add your finished photographs'}</span><small>JPEG, PNG or WebP · Up to 30 MB each</small><span className="v-upload-action"><Upload size={16} />Choose photographs</span></button><input type="file" multiple accept="image/jpeg,image/png,image/webp" ref={fileInputRef} className="hidden" onChange={e => { handlePhotoUpload(e.target.files); e.target.value = ''; }} />
       {formData.photos.length > 0 ? <><div className="v-create-uploaded" aria-label="Uploaded photographs">{formData.photos.map((p, i) => <div key={p.id}><img src={p.thumbnailUrl || p.url} alt={'Uploaded photograph ' + (i + 1)} /><button type="button" aria-label={'Remove photograph ' + (i + 1)} onClick={() => setFormData(prev => ({ ...prev, photos: prev.photos.filter(x => x.id !== p.id) }))}><X size={14} /></button></div>)}</div><p className="v-fine mt-4">{formData.photos.length} photographs added</p><button type="button" className="v-button mt-6" disabled={uploadingPhotos} onClick={handleGenerateAiStory}>Prepare the story<ArrowRight size={17} /></button></> : <p className="v-fine mt-5">Use your final exports—the photographs your client is meant to receive.</p>}
      </div>
     </motion.div>}
     {step === 2 && <motion.div key="preparing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="v-create-preparing" role="status"><Film size={34} /><h2>Putting your story together.</h2><p>{aiProgressText}</p><span>You’ll be able to review every caption before publishing.</span></motion.div>}
     {step === 3 && <motion.div key="review" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="v-create-review">
      <div className="v-create-review-head"><div><Eyebrow number="03">The final check</Eyebrow><h2>Make it sound like you.</h2></div><div className="v-actions"><button className="v-button v-button-secondary" onClick={() => setStep(1)} disabled={publishing}><ArrowLeft size={16} />Back to photographs</button><button className="v-button" onClick={handleSaveAndPublish} disabled={publishing}>{publishing ? 'Publishing…' : 'Publish & get the link'}<ArrowRight size={16} /></button></div></div>
      <p className="v-policy-note">Anyone with the published link can view and download these photographs. Check that you have permission to share them this way.</p>
      <div className="v-create-review-grid"><div className="v-form">
       <div className="v-field"><label htmlFor="story-title">Story title</label><input id="story-title" maxLength={150} value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} /></div>
       <div className="v-field"><label htmlFor="story-summary">Introduction</label><textarea id="story-summary" rows={3} maxLength={1500} value={formData.storySummary} onChange={e => setFormData({ ...formData, storySummary: e.target.value })} /></div>
       <div className="v-field"><label htmlFor="story-theme">Presentation theme</label><select id="story-theme" value={formData.theme?.palette} onChange={e => { const key = e.target.value; const preset = THEME_PRESETS[key] || THEME_PRESETS.midnight_velvet; setFormData(p => ({ ...p, theme: { palette: key, ...preset } })); }}>{Object.entries(THEME_PRESETS).map(([k,t]) => <option key={k} value={k}>{t.name}</option>)}</select></div>
       <div className="v-field"><label>Soundtrack</label><div className="v-create-audio"><button type="button" className="v-view-icon" aria-label={isPlayingPreview ? 'Pause soundtrack preview' : 'Play soundtrack preview'} onClick={() => toggleAudioPreview(formData.soundtrack?.audioUrl)}>{isPlayingPreview ? <Pause size={16} /> : <Play size={16} />}</button><span>{formData.soundtrack?.title || 'Choose a soundtrack'}</span></div><div className="v-actions mt-0"><button className="v-text-link" onClick={() => setShowSoundtrackModal(true)}>Choose music<Music size={15} /></button><button className="v-text-link" onClick={() => audioFileInputRef.current?.click()} disabled={uploadingAudio}>{uploadingAudio ? 'Uploading…' : 'Upload audio'}<Upload size={15} /></button></div><input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/mp4" ref={audioFileInputRef} className="hidden" onChange={handleCustomAudioUpload} /></div>
      </div><div className="v-storyboard">{formData.photos.map((photo, idx) => <div key={photo.id || idx} className="v-storyboard-frame"><img src={photo.thumbnailUrl || photo.url} alt={'Story photograph ' + (idx + 1)} /><div className="v-form"><span className="v-index">FRAME {String(idx + 1).padStart(2, '0')}</span><div className="v-field"><label htmlFor={'chapter-' + idx}>Chapter title</label><input id={'chapter-' + idx} maxLength={100} value={photo.chapterTitle} onChange={e => setFormData(prev => ({ ...prev, photos: prev.photos.map((p,i) => i === idx ? { ...p, chapterTitle: e.target.value } : p) }))} /></div><div className="v-field"><label htmlFor={'caption-' + idx}>Caption</label><textarea id={'caption-' + idx} rows={3} maxLength={400} value={photo.caption} onChange={e => setFormData(prev => ({ ...prev, photos: prev.photos.map((p,i) => i === idx ? { ...p, caption: e.target.value } : p) }))} /></div></div></div>)}</div></div>
     </motion.div>}
    </AnimatePresence>
    <AnimatePresence>{showSoundtrackModal && <motion.div className="v-gallery-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><div className="v-music-dialog" role="dialog" aria-modal="true" aria-labelledby="music-title" ref={soundtrackDialogRef} tabIndex={-1}><header className="v-gallery-header"><h2 id="music-title">Choose the soundtrack.</h2><button className="v-view-icon" aria-label="Close soundtrack picker" onClick={() => setShowSoundtrackModal(false)}><X size={19} /></button></header><div className="v-music-filters"><div className="v-field"><label htmlFor="music-search">Search music</label><input id="music-search" value={soundtrackSearch} onChange={e => setSoundtrackSearch(e.target.value)} placeholder="Track or genre" /></div><div className="v-field"><label htmlFor="music-genre">Genre</label><select id="music-genre" value={soundtrackGenre} onChange={e => setSoundtrackGenre(e.target.value)}><option>All</option>{SOUNDTRACK_GENRES.filter(g => g !== 'All').map(g => <option key={g}>{g}</option>)}</select></div></div><div className="v-music-list">{filteredSoundtracks.map(track => <div className="v-music-row" key={track.id || track.title}><button className="v-view-icon" aria-label={'Preview ' + track.title} onClick={() => toggleAudioPreview(track.audioUrl)}>{previewAudioUrl === track.audioUrl && isPlayingPreview ? <Pause size={16} /> : <Play size={16} />}</button><div><h3>{track.title}</h3><p>{track.genre}</p></div><button className="v-button v-button-secondary" onClick={() => { setFormData(prev => ({ ...prev, soundtrack: track })); audioPreviewRef.current?.pause(); setIsPlayingPreview(false); setShowSoundtrackModal(false); }}>Use<Check size={15} /></button></div>)}{!filteredSoundtracks.length && <p className="v-copy p-6">No tracks match that search.</p>}</div></div></motion.div>}</AnimatePresence>
   </div><Footer /></div>
  );
}
