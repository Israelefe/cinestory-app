// Sample deliveries use the same saved shape as creation previews and client links.
// Only the content and local demo actions differ from a published delivery.
import demoNarration from '../constants/demoNarration.json' with { type: 'json' };

export function photoStoryDemoDelivery(preset) {
  if (!preset) return null;
  const openingLine = preset.opening?.copy || preset.storySummary;
  const closingLine = preset.finale?.copy || '';
  const recorded = Object.hasOwn(demoNarration, preset.id) ? demoNarration[preset.id] : null;
  const narration = recorded?.opening?.text === openingLine && recorded?.closing?.text === closingLine
    ? { ...recorded, opening: { ...recorded.opening }, closing: { ...recorded.closing } }
    : undefined;
  const assets = preset.photos.map((photo, index) => ({
    assetId: `demo-${preset.id}-${index + 1}`,
    url: `/veylo/web/demo-${preset.id}-${index + 1}-960.webp`,
    thumbnailUrl: `/veylo/web/demo-${preset.id}-${index + 1}-480.webp`,
    srcSet: [480, 960, 1440].map(width => `/veylo/web/demo-${preset.id}-${index + 1}-${width}.webp ${width}w`).join(', '),
    originalFilename: `${preset.id}-${index + 1}.jpg`
  }));
  const motion = { zoom_in: 'slow-push', zoom_out: 'slow-pull', pan_left: 'pan-left', pan_right: 'pan-right', pan_up: 'float', pan_down: 'float' };
  const transition = { slide_left: 'slide', rise: 'reveal', scale: 'reveal' };
  return {
    schemaVersion: 3,
    format: 'photo-story',
    title: preset.title,
    clientName: preset.clientName,
    shootType: preset.occasion,
    branding: { type: 'studio', name: preset.studioName },
    assets,
    curatedAssetIds: assets.map(asset => asset.assetId),
    creativeDirection: {
      title: preset.opening?.headline || preset.title,
      openingLine,
      closingLine,
      palette: { background: '#0c0c10', surface: '#17171c', text: '#fffaf6', accent: preset.theme?.accentColor || '#ff5a47' },
      typography: { display: 'Playfair Display', body: 'Outfit' },
      frames: preset.photos.map((photo, index) => ({
        assetId: assets[index].assetId,
        headline: photo.chapterTitle,
        caption: photo.caption,
        layout: photo.sceneLayout,
        motion: motion[photo.zoomEffect] || 'slow-push',
        transition: transition[photo.transition] || photo.transition || 'crossfade',
        focalPoint: photo.focalPoint || '50% 50%',
        colorAccent: photo.colorAccent || preset.theme?.accentColor,
        typographyStyle: 'typewriter',
        textAnimation: 'typewriter',
        textBackground: 'transparent_shadow',
        captionPosition: 'bottom'
      }))
    },
    v3: { openingAssetId: assets[0]?.assetId, closingAssetId: assets.at(-1)?.assetId, narrationChoice: narration ? 'voice' : 'skip' },
    narration,
    soundtrack: preset.soundtrack?.audioUrl ? { url: preset.soundtrack.audioUrl, title: preset.soundtrack.title } : undefined,
    access: { allowLikes: true, allowIndividualDownloads: true, allowDownloadAll: true }
  };
}
