import { CURATED_SOUNDTRACKS, THEME_PRESETS } from '../constants/photoStoryConstants.js';

/**
 * Generate bespoke, ultra-human AI Photo Story configuration with narrative, captions, typography and music
 */
export async function generateAiPhotoStory({
  clientName = 'Client',
  occasion = 'Studio Photoshoot',
  adminDescription = '',
  photos = [],
  selectedSoundtrackId = null
}) {
  const apiKey = process.env.OPENROUTER_API_KEY || '';
  const photoCount = Math.max(photos.length, 1);

  // Intelligent Soundtrack Matching
  let selectedSoundtrack = null;
  if (selectedSoundtrackId) {
    selectedSoundtrack = CURATED_SOUNDTRACKS.find(
      (st) => st.id === selectedSoundtrackId || st.title === selectedSoundtrackId
    );
  }

  if (!selectedSoundtrack) {
    const occLower = (occasion + ' ' + adminDescription).toLowerCase();
    for (const st of CURATED_SOUNDTRACKS) {
      if (st.bestFor.some((tag) => occLower.includes(tag.toLowerCase()))) {
        selectedSoundtrack = st;
        break;
      }
    }
  }

  if (!selectedSoundtrack) {
    selectedSoundtrack = CURATED_SOUNDTRACKS[0];
  }

  const systemPrompt = `You are the Lead Creative Director & Senior Visual Storyteller for Veylo Media Studio (Lagos, Nigeria).
Your writing is deeply personal, high-fashion, authentic, and emotionally resonant—written directly to and about the client, honoring their exact milestone or photoshoot occasion.

CRITICAL EDITORIAL RULES:
1. OCCASION-CENTRIC NARRATIVE (MANDATORY):
   - You MUST tailor every caption directly to the specific occasion provided: "${occasion}".
   - If it is a Birthday (e.g., 21st, 25th, 30th, 50th), celebrate the exact age milestone, the elegance, entering a golden era, the growth, and the celebration.
   - If it is a Wedding / Engagement / Pre-wedding, celebrate their unique love story, the union, timeless romance, and cultural beauty.
   - If it is a Graduation / Convocation, celebrate the perseverance, intelligence, success, and the bright future ahead.
   - If it is a Maternity session, celebrate the glow of motherhood, new beginnings, and gentle warmth.
   - If it is a Corporate / Executive Branding session, highlight leadership, visionary drive, authority, and polished excellence.
   - If it is a Fashion / Glamour / Editorial session, celebrate bold aesthetic, unmatched confidence, and high-fashion poise.

2. HUMAN VOICE & ZERO AI CLICHES:
   - Write like a stylish creative director who was behind the lens admiring the subject.
   - BANNED CLICHES: Do NOT use "testament", "tapestry", "beacon", "symphony", "delve", "cherish", "unveils", "a journey of", "poised and ready", "captivating essence".
   - Be concise and punchy: Each slide caption MUST be 1 single crisp, poetic sentence (10-18 words max) so it never overwhelms or blocks the photograph.

3. VISUAL RHYTHM:
   - Alternate typographyStyle, textAnimation, textBackground, and zoomEffect across slides for cinematic variety.
   - Keep captionPosition predominantly as "bottom" so the subject's face is 100% visible.

CLIENT DETAILS:
- Name: ${clientName}
- Occasion (Primary Focus): ${occasion}
- Director Notes / Context: "${adminDescription || 'A milestone celebration captured in high-end luxury studio aesthetic.'}"
- Total Master Photos: ${photoCount}

Return STRICT JSON ONLY:
{
  "title": "A short, bespoke, stylish story title specific to this ${occasion} (max 5 words)",
  "storySummary": "A warm, genuine 2-sentence tribute written for ${clientName} celebrating this ${occasion}.",
  "theme": {
    "palette": "one of: midnight_velvet | royal_emerald | obsidian_gold | neon_violet | sunset_rose | clean_editorial | monochrome_luxury | cyber_neon | champagne_glamour | lavender_haze | crimson_royalty | tuscan_warmth | arctic_glacier | safari_earth | celestial_aurora | velvet_amethyst",
    "typography": "cinematic_serif",
    "vibeTag": "A 2-3 word aesthetic tag (e.g., 'Golden Sovereign' or 'Rose Velvet Radiance')"
  },
  "slides": [
    {
      "index": 0,
      "chapterTitle": "Short 2-3 word chapter headline (e.g., 'The Milestone', 'Golden Poise', 'Pure Grace')",
      "caption": "One crisp, human sentence specifically celebrating ${clientName}'s ${occasion}.",
      "typographyStyle": "one of: typewriter | editorial_quote | neon_pop | cinematic_drift | minimal_clean | bold_banner",
      "textAnimation": "one of: typewriter | word_fade_up | letter_drift | smooth_slide | scale_pop | blur_reveal",
      "textBackground": "one of: frosted_glass | solid_dark | neon_pill | transparent_shadow | vogue_bordered",
      "captionPosition": "bottom",
      "colorAccent": "Hex color matching the chosen theme",
      "zoomEffect": "one of: zoom_in | zoom_out | pan_left | pan_right",
      "duration": 5.5
    }
  ]
}
Important: "slides" MUST contain exactly ${photoCount} items corresponding to each photo in sequence.`;

  if (apiKey) {
    const candidateModels = [
      process.env.OPENROUTER_MODEL,
      'openrouter/free'
    ].filter(Boolean);

    for (const modelToUse of candidateModels) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://veylo.com.ng',
            'X-Title': 'Veylo AI Photo Story Director',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: modelToUse,
            messages: [
              { role: 'system', content: systemPrompt },
              {
                role: 'user',
                content: `Write the story for ${clientName}'s ${occasion} photoshoot with ${photoCount} master images.`
              }
            ],
            temperature: 0.7,
            max_tokens: 2500
          }),
          signal: AbortSignal.timeout(35000)
        });

        const data = await response.json();

        if (
          response.status === 429 ||
          response.status === 402 ||
          data?.error?.code === 429 ||
          /rate limit|quota|credits|usage limit/i.test(JSON.stringify(data?.error || {}))
        ) {
          console.warn(`⚠️ [PHOTO-STORY-AI] Model ${modelToUse} rate limited.`);
          continue;
        }

        let reply = data?.choices?.[0]?.message?.content;
        if (reply) {
          reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
          reply = reply.replace(/```json/gi, '').replace(/```/g, '').trim();

          const jsonMatch = reply.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            reply = jsonMatch[0];
          }

          let parsed;
          try {
            parsed = JSON.parse(reply);
          } catch (parseErr) {
            console.warn(`⚠️ [PHOTO-STORY-AI] Model ${modelToUse} returned non-JSON text, skipping.`);
            continue;
          }

          if (parsed && Array.isArray(parsed.slides) && parsed.slides.length >= 1) {
            const chosenPalette = parsed.theme?.palette || 'neon_violet';
            const themeDetails = THEME_PRESETS[chosenPalette] || THEME_PRESETS['neon_violet'];

            const enhancedPhotos = photos.map((p, idx) => {
              const slideMeta = parsed.slides[idx] || parsed.slides[parsed.slides.length - 1];
              return {
                ...p,
                chapterTitle: slideMeta.chapterTitle || '',
                caption: slideMeta.caption || '',
                typographyStyle: slideMeta.typographyStyle || 'cinematic_drift',
                textAnimation: slideMeta.textAnimation || 'word_fade_up',
                textBackground: slideMeta.textBackground || 'frosted_glass',
                captionPosition: slideMeta.captionPosition || 'bottom',
                zoomEffect: slideMeta.zoomEffect || (idx % 2 === 0 ? 'zoom_in' : 'zoom_out'),
                colorAccent: slideMeta.colorAccent || themeDetails.accentColor,
                duration: slideMeta.duration || 5.5
              };
            });

            return {
              title: parsed.title || `${clientName} in Focus: ${occasion}`,
              storySummary: parsed.storySummary || `Celebrating ${clientName}'s memorable ${occasion} captured at Veylo Media Studio.`,
              theme: {
                palette: chosenPalette,
                typography: parsed.theme?.typography || 'cinematic_serif',
                vibeTag: parsed.theme?.vibeTag || themeDetails.vibeTag,
                bgGradient: themeDetails.bgGradient,
                accentColor: themeDetails.accentColor
              },
              soundtrack: selectedSoundtrack,
              photos: enhancedPhotos
            };
          }
        }
      } catch (err) {
        console.warn(`⚠️ [PHOTO-STORY-AI] Model ${modelToUse} failed:`, err.message);
      }
    }
  }

  // High-Grade Human Editorial Fallback Engine - tailored dynamically to the exact occasion
  const occLower = (occasion + ' ' + adminDescription).toLowerCase();
  let defaultTheme = 'neon_violet';
  if (occLower.includes('wed') || occLower.includes('love') || occLower.includes('anniversary')) defaultTheme = 'sunset_rose';
  else if (occLower.includes('birth') || occLower.includes('gold') || occLower.includes('year') || occLower.includes('th') || occLower.includes('st') || occLower.includes('rd')) defaultTheme = 'obsidian_gold';
  else if (occLower.includes('corporate') || occLower.includes('exec') || occLower.includes('headshot')) defaultTheme = 'clean_editorial';
  else if (occLower.includes('royal') || occLower.includes('culture') || occLower.includes('trad')) defaultTheme = 'royal_emerald';
  else if (occLower.includes('grad') || occLower.includes('convoc')) defaultTheme = 'celestial_aurora';

  const themeDetails = THEME_PRESETS[defaultTheme] || THEME_PRESETS.neon_violet;

  // Build dynamic occasion-specific narrative chapters
  let occasionMoments = [];
  if (occLower.includes('birth')) {
    occasionMoments = [
      { title: 'The Celebration', caption: `Marking ${occasion} in sheer style, radiance, and unmatched joy.` },
      { title: 'Golden Chapter', caption: `Stepping into this new year with effortless grace and poise.` },
      { title: 'Pure Radiance', caption: `Every frame reflects the energy, charm, and beauty of celebrating ${occasion}.` },
      { title: 'Living Iconic', caption: `Confidence at its peak—owning every single second of this milestone.` },
      { title: 'Timeless Glow', caption: `A signature portrait for ${clientName} to remember this exact moment forever.` },
      { title: 'The Next Era', caption: `Here is to another spectacular year filled with wins, peace, and luxury.` }
    ];
  } else if (occLower.includes('wed') || occLower.includes('love') || occLower.includes('anniversary')) {
    occasionMoments = [
      { title: 'Two Souls', caption: `A timeless love story captured in its purest, most authentic light.` },
      { title: 'The Connection', caption: `Quiet glances, genuine laughter, and promises sealed in time.` },
      { title: 'Golden Harmony', caption: `Celebrating every step that brought you both to this unforgettable union.` },
      { title: 'The Vow', caption: `Bound by elegance and devotion—a love meant for a lifetime.` },
      { title: 'Pure Joy', caption: `The undeniable happiness shared between two hearts beating as one.` },
      { title: 'Forever Forward', caption: `The beginning of an extraordinary lifetime chapter together.` }
    ];
  } else if (occLower.includes('grad') || occLower.includes('convoc')) {
    occasionMoments = [
      { title: 'The Milestone', caption: `Years of dedication, late nights, and relentless drive culminate right here.` },
      { title: 'Scholarly Poise', caption: `Carrying the crown of accomplishment with undeniable dignity.` },
      { title: 'A New Horizon', caption: `Stepping forward into the future prepared to lead and conquer.` },
      { title: 'Pride & Joy', caption: `A well-deserved triumph that family and friends will cherish always.` }
    ];
  } else {
    occasionMoments = [
      { title: 'The Arrival', caption: `Capturing ${clientName}'s distinctive aura and energy for this ${occasion}.` },
      { title: 'Signature Style', caption: `Effortless grace in front of the lens, celebrating ${occasion}.` },
      { title: 'The Essence', caption: `A look that commands admiration—unfiltered presence and elegance.` },
      { title: 'Timeless Focus', caption: `Masterfully crafted moments honoring ${clientName}'s ${occasion}.` },
      { title: 'Golden Details', caption: `It is the subtle, intimate moments that make this ${occasion} unforgettable.` },
      { title: 'Grand Finale', caption: `A masterpiece portrait series from Veylo Media Studio that stands the test of time.` }
    ];
  }

  const humanStyles = [
    { typo: 'cinematic_drift', anim: 'word_fade_up' },
    { typo: 'editorial_quote', anim: 'letter_drift' },
    { typo: 'minimal_clean', anim: 'smooth_slide' },
    { typo: 'typewriter', anim: 'typewriter' },
    { typo: 'neon_pop', anim: 'scale_pop' },
    { typo: 'bold_banner', anim: 'blur_reveal' }
  ];

  const fallbackPhotos = photos.map((p, idx) => {
    const template = occasionMoments[idx % occasionMoments.length];
    const style = humanStyles[idx % humanStyles.length];
    return {
      ...p,
      chapterTitle: template.title,
      caption: template.caption,
      typographyStyle: style.typo,
      textAnimation: style.anim,
      textBackground: 'frosted_glass',
      captionPosition: 'bottom',
      zoomEffect: idx % 2 === 0 ? 'zoom_in' : 'zoom_out',
      colorAccent: themeDetails.accentColor,
      duration: 5.5
    };
  });

  return {
    title: `${clientName} • ${occasion}`,
    storySummary: `A personalized visual tribute celebrating ${clientName}'s milestone ${occasion}, captured with distinction at Veylo Media Studio.`,
    theme: {
      palette: defaultTheme,
      typography: 'cinematic_serif',
      vibeTag: occLower.includes('birth') ? 'Golden Milestone' : 'Timeless Radiance',
      bgGradient: themeDetails.bgGradient,
      accentColor: themeDetails.accentColor,
      glowColor: themeDetails.glowColor
    },
    soundtrack: selectedSoundtrack,
    photos: fallbackPhotos
  };
}
