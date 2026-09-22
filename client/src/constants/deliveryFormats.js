export const DELIVERY_FORMATS = [
  {
    id: 'photo-story',
    value: 'photo-story',
    number: '01',
    roman: 'I',
    name: 'Photo Story',
    verb: 'Experience',
    line: 'A directed sequence with a beginning, a rhythm, and a finale.',
    description: 'Veylo turns the finished shoot into a cinematic presentation with image order, captions, motion, transitions, pacing, music, and an optional narration track. The complete downloadable gallery waits at the end.',
    bestFor: 'Weddings, birthdays, maternity, graduation, anniversaries, and personal milestones.',
    clientMindset: 'Experience my photos.',
    photos: ['demo-lora-1', 'demo-lora-6']
  },
  {
    id: 'editorial-page',
    value: 'editorial',
    number: '02',
    roman: 'II',
    name: 'Editorial Page',
    verb: 'Explore',
    line: 'A scrollable publication designed around the character of the shoot.',
    description: 'Veylo studies the photographs and builds a bespoke editorial page from them. Image scale, spacing, typography, colour, and scroll rhythm respond to the work instead of forcing it into a fixed template.',
    bestFor: 'Fashion, portraits, personal branding, campaigns, and studio sessions.',
    clientMindset: 'Explore my photos.',
    photos: ['demo-ada-1', 'demo-ada-3']
  },
  {
    id: 'photo-reveal',
    value: 'photo-reveal',
    number: '03',
    roman: 'III',
    name: 'Photo Reveal',
    verb: 'Discover',
    line: 'A first viewing that moves only when the client is ready.',
    description: 'Each tap reveals the next finished photograph. Veylo decides which images deserve the full screen, which belong together, and where the strongest portrait should land. The client controls the pace.',
    bestFor: 'Portraits, beauty sessions, birthdays, maternity, and graduation shoots.',
    clientMindset: 'Discover my photos.',
    photos: ['demo-sharon-1', 'demo-sharon-4']
  },
  {
    id: 'canvas',
    value: 'canvas',
    number: '04',
    roman: 'IV',
    name: 'Canvas',
    verb: 'Wander',
    line: 'A spatial composition where related photographs live together.',
    description: 'Veylo arranges the shoot as an interactive visual field. Hero images, details, outfits, locations, and expressions form natural clusters that the client can move through freely.',
    bestFor: 'Fashion, weddings, events, portraits, and branding shoots.',
    clientMindset: 'Explore the shoot freely.',
    photos: ['demo-courage-1', 'demo-courage-3', 'demo-courage-5']
  },
  {
    id: 'chapters',
    value: 'chapters',
    number: '05',
    roman: 'V',
    name: 'Chapters',
    verb: 'Choose',
    line: 'A large collection organised by the moments already inside it.',
    description: 'Veylo finds the natural parts of the shoot and gives each one a visual chapter cover. The client chooses where to begin, explores that part, and returns to the complete collection.',
    bestFor: 'Weddings, events, multi-outfit sessions, branding shoots, and traditional weddings.',
    clientMindset: 'Choose where I begin.',
    photos: ['demo-wedding-1', 'demo-wedding-2', 'demo-wedding-3']
  },
  {
    id: 'album',
    value: 'album',
    number: '06',
    roman: 'VI',
    name: 'Album',
    verb: 'Turn',
    line: 'A page-by-page keepsake composed from the finished shoot.',
    description: 'Veylo arranges the photographs as a considered digital album, deciding the cover, page order, pairings, full-page portraits, quiet space, typography, and closing spread. The complete downloadable gallery follows the final page.',
    bestFor: 'Traditional weddings, white weddings, anniversaries, maternity, family sessions, and milestone celebrations.',
    clientMindset: 'Turn through my photos.',
    photos: ['demo-album-fa-source', 'demo-album-fa-3', 'demo-album-fa-5']
  },
  {
    id: 'event-coverage',
    value: 'event-coverage',
    number: '07',
    roman: 'VII',
    name: 'Event Coverage',
    verb: 'Browse',
    line: 'A complete event organised around the scenes, people, and shifts in the day.',
    description: 'Built for conferences, church services, owambe celebrations, and gatherings where no single person is the subject. The delivery opens with highlights, then lets guests browse every scene and the complete gallery.',
    bestFor: 'Conferences, church services, social gatherings, corporate events, concerts, and community celebrations.',
    clientMindset: 'Browse what happened.',
    photos: [
      '/veylo/demo/event/event-01-arrivals.webp',
      '/veylo/demo/event/event-02-keynote.webp',
      '/veylo/demo/event/event-03-networking.webp',
      '/veylo/demo/event/event-04-stage.webp',
      '/veylo/demo/event/event-05-details.webp'
    ],
    photoAlt: 'A Nigerian conference moving from arrivals to the main programme',
    eventLabel: 'THE ROOM, IN FULL',
    eventDate: '05 SCENES',
    eventScenes: ['Arrivals', 'Main programme', 'Between sessions', 'On stage', 'Details']
  },
  {
    id: 'campaign',
    value: 'campaign',
    number: '08',
    roman: 'VIII',
    name: 'Campaign Delivery',
    verb: 'Use',
    line: 'A commercial showcase followed by an organised handoff of final assets.',
    description: 'The client sees the campaign as a considered presentation, then moves into clearly named asset sets, variants, download sizes, and photographer-supplied usage terms.',
    bestFor: 'Lookbooks, product campaigns, hospitality, food, property, personal branding, and corporate libraries.',
    clientMindset: 'See the campaign, then use the files.',
    photos: [
      '/veylo/demo/campaign/campaign-01-hero.webp',
      '/veylo/demo/campaign/campaign-02-detail.webp',
      '/veylo/demo/campaign/campaign-03-lifestyle.webp',
      '/veylo/demo/campaign/campaign-04-kit.webp',
      '/veylo/demo/campaign/campaign-05-context.webp'
    ],
    photoAlt: 'A complete leather goods campaign with hero, detail, lifestyle, and handoff images',
    campaignLabel: 'COMMERCIAL HANDOFF',
    campaignCode: 'A / 05',
    campaignSets: ['Hero', 'Detail', 'Lifestyle', 'Kit', 'Context']
  }
];

export const DELIVERY_PROCESS = [
  ['Describe the shoot', 'Tell Veylo who the photographs are for, what was photographed, and anything the presentation should understand.'],
  ['Upload the finished photographs', 'Bring the final edited files your client is meant to receive. Veylo never replaces or retouches the photographer’s work.'],
  ['Review the direction', 'Veylo studies each photograph and the complete collection, then prepares the selected delivery. The photographer checks every decision before publishing.'],
  ['Send one link', 'Share the delivery through WhatsApp, Instagram DM, or email. The client experiences the work, then browses and downloads the full gallery.']
];

export const CURATED_DELIVERY_SOUNDTRACKS = [
  {
    id: 'current_birthday',
    title: "Ada's Celebration Groove",
    artist: 'Veylo Studio Master',
    url: '/audio/ada-birthday.mp3',
    genre: 'Afro-Soul Celebration',
    mood: 'Joyful & Vibrant',
    tempo: 'upbeat',
    durationSec: 140,
    tags: ['Birthday', 'Milestone', 'Owambe', 'Party']
  },
  {
    id: 'current_ambient',
    title: 'Golden Hour Reverie',
    artist: 'Veylo Acoustic Studio',
    url: '/audio/soundtrack-1.mp3',
    genre: 'Cinematic Ambient',
    mood: 'Dreamy & Majestic',
    tempo: 'mid',
    durationSec: 155,
    tags: ['Wedding', 'Pre-Wedding', 'Sunset', 'Romance']
  },
  {
    id: 'current_acoustic',
    title: 'Velvet Acoustic Strings',
    artist: 'Lumina Studio Orchestra',
    url: '/audio/soundtrack-2.mp3',
    genre: 'Warm Acoustic',
    mood: 'Warm & Intimate',
    tempo: 'slow',
    durationSec: 165,
    tags: ['Portrait', 'Studio', 'Quiet', 'Maternity']
  },
  {
    id: 'current_soul',
    title: 'Lagos Sunset Horizon',
    artist: 'Veylo Soundscapes',
    url: '/audio/soundtrack-3.mp3',
    genre: 'Soulful Rhythmic',
    mood: 'Soulful & Atmospheric',
    tempo: 'mid',
    durationSec: 148,
    tags: ['Fashion', 'Editorial', 'Lookbook', 'Creative']
  }
];
