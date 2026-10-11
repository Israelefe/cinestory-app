import React, { useCallback } from 'react';
import VideoViewer from '../components/delivery/VideoViewer.jsx';
import { VIDEO_DEMO_MEDIA, demoVideoUrl } from '../constants/videoDemoMedia.js';

const films = Object.values(VIDEO_DEMO_MEDIA).map(media => ({ ...media, source: demoVideoUrl(media) }));
export default function VideoDemo() {
  const playback = useCallback(async item => ({ hlsUrl: item.source, expiresAt: new Date(Date.now() + 86400_000).toISOString() }), []);
  return <VideoViewer demo delivery={{ title: 'A place for the finished film.', introduction: 'Two silent films from Pexels, shown in their original quality. Open either film to try the client view. The studio name and avatar are examples of your branding.', branding: { name: 'Example studio · demo', avatarUrl: '/veylo/web/photographer-480.webp' }, featuredAssetId: films[0].id, items: films }} requestPlayback={playback} />;
}
