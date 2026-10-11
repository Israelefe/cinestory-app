import React, { useCallback } from 'react';
import VideoViewer from '../components/delivery/VideoViewer.jsx';

const films = [
  { id: 'wide-study', title: 'A study in light', description: 'A short Veylo animation made for this player demonstration. Warm bands of light move across a dark frame, with a quiet tone in the original audio. Use the player controls to pause, seek, change the volume or watch full screen.', duration: 10, bytes: 209534, width: 960, height: 540, posterUrl: '/veylo/video/light-study.webp', source: '/veylo/video/light-study.mp4', allowDownload: true },
  { id: 'portrait-study', title: 'Light, in portrait', description: 'A vertical sample with its original audio. Play the film, then scroll to the next video. The full frame stays visible.', duration: 8, bytes: 171533, width: 540, height: 960, posterUrl: '/veylo/video/portrait-study.webp', source: '/veylo/video/portrait-study.mp4', allowDownload: true },
  { id: 'portrait-second', title: 'Another look', description: 'A second vertical sample so you can try the scroll feed. Each video has its own title, description and original download.', duration: 8, bytes: 171533, width: 540, height: 960, posterUrl: '/veylo/video/portrait-study.webp', source: '/veylo/video/portrait-study.mp4', allowDownload: true }
];
export default function VideoDemo() {
  const playback = useCallback(async item => ({ hlsUrl: item.source, expiresAt: new Date(Date.now() + 86400_000).toISOString() }), []);
  return <VideoViewer demo delivery={{ title: 'A place for the finished film.', introduction: 'Watch a wide film, or open a vertical video to try the scroll feed. These sample animations demonstrate the client view.', branding: { name: 'Veylo Studio · demonstration', avatarUrl: '/veylo/web/photographer-480.webp', logoUrl: '/veylo/veylo-mark.svg' }, featuredAssetId: films[0].id, items: films }} requestPlayback={playback} downloadUrl={item => item.source} />;
}
