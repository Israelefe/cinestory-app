import { CURATED_SOUNDTRACKS, THEME_PRESETS } from '../constants/photoStoryConstants.js';

const STYLE_DEFAULTS = Object.freeze({
  typographyStyle: 'cinematic_drift',
  textAnimation: 'word_fade_up',
  textBackground: 'frosted_glass',
  captionPosition: 'bottom',
  zoomEffect: 'zoom_in'
});

function chooseSoundtrack({ occasion, adminDescription, selectedSoundtrackId }) {
  if (selectedSoundtrackId) {
    const selected = CURATED_SOUNDTRACKS.find(track => track.id === selectedSoundtrackId || track.title === selectedSoundtrackId);
    if (selected) return selected;
  }
  const context = `${occasion} ${adminDescription}`.toLowerCase();
  return CURATED_SOUNDTRACKS.find(track => track.bestFor.some(tag => context.includes(String(tag).toLowerCase()))) || null;
}
function cleanReply(value) {
  const text = String(value || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json/gi, '').replace(/```/g, '').trim();
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}

function visualReference(url) {
  try {
    const parsed = new URL(String(url || ''));
    if (parsed.protocol !== 'https:') return '';
    if (!['res.cloudinary.com', 'cdn.pixabay.com', 'pixabay.com', 'www.pixabay.com'].includes(parsed.hostname.toLowerCase())) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function validCaption(value) {
  const caption = String(value || '').trim();
  const words = caption.split(/\s+/).filter(Boolean);
  return caption.length >= 18 && words.length >= 4 && words.length <= 45 && !caption.includes('${');
}

function validSlides(slides, photoCount) {
  return Array.isArray(slides) && slides.length === photoCount && slides.every(slide => validCaption(slide?.caption));
}

function unavailableError(message = 'AI could not return one approved caption for every photograph. No generic captions were inserted.') {
  return Object.assign(new Error(message), { code: 'PHOTO_STORY_CAPTIONS_UNAVAILABLE', status: 503 });
}

/**
 * The legacy Photo Story endpoint still uses this service. It is deliberately
 * fail-closed: a model response must contain one meaningful caption per input
 * photograph or the creator receives an actionable error instead of invented
 * template text.
 */
export async function generateAiPhotoStory({
  clientName = 'Client',
  occasion = 'Studio Photoshoot',
  adminDescription = '',
  photos = [],
  selectedSoundtrackId = null
}) {
  const photoCount = photos.length;
  if (!photoCount) throw unavailableError('Add at least one finished photograph before generating a Photo Story.');
  const apiKey = String(process.env.OPENROUTER_API_KEY || '').trim();
  if (!apiKey) throw Object.assign(new Error('Photo Story caption generation is not configured.'), { code: 'PHOTO_STORY_AI_NOT_CONFIGURED', status: 503 });

  const candidateModels = [...new Set([process.env.OPENROUTER_MODEL, 'openrouter/free'].filter(Boolean))];
  const soundtrack = chooseSoundtrack({ occasion, adminDescription, selectedSoundtrackId });
  const batchSize = 20;
  const slides = [];
  let storyMeta = {};

  for (let offset = 0; offset < photoCount; offset += batchSize) {
    const batchPhotos = photos.slice(offset, offset + batchSize);
    const systemPrompt = `You are Veylo's Photo Story editor for a Nigerian photographer. Write plain, specific copy for ${clientName}'s ${occasion}. Use the photographer's notes: ${adminDescription || 'No extra notes were supplied.'}. Return strict JSON only. Return exactly ${batchPhotos.length} slides in the supplied order for photographs ${offset + 1}–${offset + batchPhotos.length}. Every slide caption must be one meaningful sentence of 4 to 45 words that refers to the supplied person, occasion, photographer's notes, or the attached photograph. Never use a generic template, placeholder, invented name, or repeated caption. Do not claim details you cannot establish from the image or notes. Use one of the supported visual styles for each slide.`;
    const userPrompt = JSON.stringify({
      clientName,
      occasion,
      adminDescription,
      photos: batchPhotos.map((photo, index) => ({ index: offset + index, id: photo.id, visualReference: Boolean(visualReference(photo.url)) }))
    });
    const messageContent = [{ type: 'text', text: `${userPrompt}\nUse each attached photograph, in order, as visual context for its matching slide. If an image is unavailable, rely only on the brief and do not invent details.` }];
    batchPhotos.forEach((photo, index) => {
      const url = visualReference(photo.url);
      if (!url) return;
      messageContent.push({ type: 'text', text: `Photograph ${offset + index + 1} (id ${photo.id}):` });
      messageContent.push({ type: 'image_url', image_url: { url, detail: 'low' } });
    });

    let parsedBatch;
    for (const model of candidateModels) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://veylo.com.ng',
            'X-Title': 'Veylo Photo Story Director',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: messageContent }], temperature: 0.55, max_tokens: Math.min(8000, 900 + batchPhotos.length * 170) }),
          signal: AbortSignal.timeout(35_000)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) continue;
        let parsed;
        try { parsed = JSON.parse(cleanReply(payload?.choices?.[0]?.message?.content)); } catch { continue; }
        if (!validSlides(parsed?.slides, batchPhotos.length)) continue;
        parsedBatch = parsed;
        break;
      } catch (error) {
        console.warn(`[PHOTO-STORY-AI] ${model} batch ${offset + 1}-${offset + batchPhotos.length} failed:`, error.message);
      }
    }
    if (!parsedBatch) throw unavailableError(`AI could not return approved captions for photographs ${offset + 1}-${offset + batchPhotos.length}. No generic captions were inserted.`);
    if (!Object.keys(storyMeta).length) storyMeta = parsedBatch;
    slides.push(...parsedBatch.slides);
  }

  const palette = THEME_PRESETS[storyMeta.theme?.palette] ? storyMeta.theme.palette : 'clean_editorial';
  const theme = THEME_PRESETS[palette];
  const enhancedPhotos = photos.map((photo, index) => {
    const slide = slides[index];
    return {
      ...photo,
      chapterTitle: String(slide.chapterTitle || `Photograph ${index + 1}`).trim().slice(0, 80),
      caption: String(slide.caption).trim().slice(0, 240),
      typographyStyle: slide.typographyStyle || STYLE_DEFAULTS.typographyStyle,
      textAnimation: slide.textAnimation || STYLE_DEFAULTS.textAnimation,
      textBackground: slide.textBackground || STYLE_DEFAULTS.textBackground,
      captionPosition: slide.captionPosition || STYLE_DEFAULTS.captionPosition,
      zoomEffect: slide.zoomEffect || (index % 2 ? 'zoom_out' : STYLE_DEFAULTS.zoomEffect),
      colorAccent: /^#[0-9a-f]{6}$/i.test(slide.colorAccent || '') ? slide.colorAccent : theme.accentColor,
      duration: Number.isFinite(Number(slide.duration)) ? Math.min(30, Math.max(1, Number(slide.duration))) : 5.5
    };
  });
  return {
    title: String(storyMeta.title || `${clientName} in Focus`).trim().slice(0, 120),
    storySummary: String(storyMeta.storySummary || '').trim().slice(0, 1000),
    theme: { palette, typography: storyMeta.theme?.typography || 'cinematic_serif', vibeTag: String(storyMeta.theme?.vibeTag || '').trim().slice(0, 80), bgGradient: theme.bgGradient, accentColor: theme.accentColor, glowColor: theme.glowColor },
    soundtrack,
    photos: enhancedPhotos
  };
}
