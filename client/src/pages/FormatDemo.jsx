import React, { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import EditorialViewer from '../components/delivery/EditorialViewer.jsx';
import RevealViewer from '../components/delivery/RevealViewer.jsx';
import { CanvasViewer, ChaptersViewer, AlbumViewer } from '../components/delivery/CollectionViewers.jsx';
import { EventCoverageViewer, CampaignDeliveryViewer } from '../components/delivery/EventCampaignViewers.jsx';
import { EDITORIAL_DEMO_DELIVERY } from '../constants/editorialDemo.js';
import { PHOTO_REVEAL_DEMO } from '../constants/photoRevealDemo.js';
export { DemoHeader, DemoGallery, getFormatThemeStyles, normalizeDeliveryPhotos, formatFrameAttributes, formatFrameStyle, frameMotionValues, frameMotionTransition } from '../components/delivery/formatShared.jsx';
export { imageSrc, editorialPhotos, revealPhotos, couragePhotos, weddingPhotos, albumPhotos, eventCoveragePhotos, campaignPhotos } from '../constants/deliveryDemoPhotos.js';
import { CANVAS_DEMO, CHAPTERS_DEMO, ALBUM_DEMO, EVENT_DEMO, CAMPAIGN_DEMO } from '../constants/deliveryDemoFixtures.js';
export function CanvasDemo(props) { return <CanvasViewer {...props} delivery={props.delivery || CANVAS_DEMO} demo={!props.delivery} />; }
export function ChaptersDemo(props) { return <ChaptersViewer {...props} delivery={props.delivery || CHAPTERS_DEMO} demo={!props.delivery} />; }
export function AlbumDemo(props) { return <AlbumViewer {...props} delivery={props.delivery || ALBUM_DEMO} demo={!props.delivery} />; }
function EventDemo() { return <EventCoverageViewer delivery={EVENT_DEMO} demo />; }
function CampaignDemo() { return <CampaignDeliveryViewer delivery={CAMPAIGN_DEMO} demo />; }
export function EditorialDemo(props) { return <EditorialViewer {...props} delivery={props.delivery || EDITORIAL_DEMO_DELIVERY} demo={!props.delivery} />; }
export function RevealDemo(props) { return <RevealViewer {...props} delivery={props.delivery || PHOTO_REVEAL_DEMO} demo={!props.delivery} />; }
export default function FormatDemo() {
  const { formatId } = useParams();
  useEffect(() => { const names = { editorial: 'Editorial Page', reveal: 'Photo Reveal', canvas: 'Canvas', chapters: 'Chapters', album: 'Album', 'event-coverage': 'Event Coverage', campaign: 'Campaign Delivery' }; if (names[formatId]) document.title = 'Veylo — ' + names[formatId] + ' demo'; }, [formatId]);
  if (['photo-story', 'story'].includes(formatId)) return <Navigate to="/demo" replace />;
  const Viewer = { editorial: EditorialDemo, reveal: RevealDemo, canvas: CanvasDemo, chapters: ChaptersDemo, album: AlbumDemo, 'event-coverage': EventDemo, campaign: CampaignDemo }[formatId];
  return Viewer ? <Viewer /> : <Navigate to="/#formats" replace />;
}
