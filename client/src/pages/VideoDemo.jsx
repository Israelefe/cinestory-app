import React, { useCallback } from 'react';
import VideoViewer from '../components/delivery/VideoViewer.jsx';

const films = [
  { id: 'wide-study', title: 'A study in light', description: 'A short Veylo animation made for this player demonstration. Warm bands of light move across a dark frame, with a quiet tone in the original audio. Use the player controls to pause, seek, change the volume or watch full screen.', duration: 10, bytes: 0, width: 960, height: 540, posterUrl: '/veylo/video/light-study.webp', source: '/veylo/video/light-study.mp4', allowDownload: false },
  { id: 'portrait-study', title: 'Light, in portrait', description: 'The same playback experience in a vertical frame. This original sample animation demonstrates how a portrait film fits on a phone without cropping the picture.', duration: 8, bytes: 0, width: 540, height: 960, posterUrl: '/veylo/video/portrait-study.webp', source: '/veylo/video/portrait-study.mp4', allowDownload: false }
];
export default function VideoDemo() {
  const playback = useCallback(async item => ({ hlsUrl: item.source, expiresAt: new Date(Date.now() + 86400_000).toISOString() }), []);
  return <VideoViewer demo delivery={{ title: 'A place for the finished film.', introduction: 'A public example of the client player, using original Veylo animations. Published client films have private playback access and the photographer’s branding.', branding: { name: 'Veylo Studio · demonstration', logoUrl: '/veylo/veylo-mark.svg' }, featuredAssetId: films[0].id, items: films }} requestPlayback={playback} />;
}
