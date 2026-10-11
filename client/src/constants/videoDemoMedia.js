// Public sample metadata shared with the media Worker's exact-file allowlist.
// Originals are hosted in R2; these are not photographer delivery objects.
export const VIDEO_DEMO_ORIGIN = 'https://veylo-delivery-images.israelonanefe08157.workers.dev';
export const VIDEO_DEMO_MEDIA = Object.freeze({
  wide: {
    id: 'celebration',
    title: 'A celebration, in full view',
    description: 'Guests gather outdoors as dancers move through the crowd in patterned wrappers and coral beads. This short, silent Pexels clip shows the landscape client player. Pause, seek or open the film full screen to see the original 4K frame.',
    filename: 'celebration-a1a6b543.mp4',
    objectKey: 'veylo/system/video-demos/celebration-a1a6b543.mp4',
    posterUrl: '/veylo/video/celebration.webp',
    width: 3840, height: 2160, duration: 12.245567, bytes: 104444844,
    sha256: 'a1a6b543eacf52ce62305e5b803280fac6510bf75f3e154d732af94ca86adf42',
    sourcePage: 'https://www.pexels.com/video/39773431/',
    sourceFile: 'https://videos.pexels.com/video-files/39773431/16960823_3840_2160_60fps.mp4',
    hasAudio: false, allowDownload: false
  },
  portrait: {
    id: 'drummer',
    title: 'The drummer, up close',
    description: 'A drummer in green traditional attire performs along a covered veranda. The camera moves from a full-length view to closer details of his clothes and drum. This silent Pexels sample shows a vertical film in its original 9:16 frame.',
    filename: 'drummer-7510db80.mp4',
    objectKey: 'veylo/system/video-demos/drummer-7510db80.mp4',
    posterUrl: '/veylo/video/drummer.webp',
    width: 1080, height: 1920, duration: 14.2142, bytes: 17412368,
    sha256: '7510db8087a6f3b3a662d6eba4579b432abf17beb7cc3b947aeea38ac2d85586',
    sourcePage: 'https://www.pexels.com/video/34773580/',
    sourceFile: 'https://videos.pexels.com/video-files/34773580/14742439_1080_1920_30fps.mp4',
    hasAudio: false, allowDownload: false
  }
});
export const demoVideoUrl = media => `${VIDEO_DEMO_ORIGIN}/demo-videos/${media.filename}`;
