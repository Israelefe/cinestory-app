import React from 'react';
import PresentationViewer from './PresentationViewer.jsx';
import StoryViewer from '../../pages/StoryViewer.jsx';
import { AlbumDemo, CanvasDemo, ChaptersDemo, EditorialDemo, RevealDemo } from '../../pages/FormatDemo.jsx';
import { CampaignDeliveryViewer, EventCoverageViewer } from './EventCampaignViewers.jsx';

const VIEWERS = {
  'photo-story': StoryViewer,
  editorial: EditorialDemo,
  'photo-reveal': RevealDemo,
  canvas: CanvasDemo,
  chapters: ChaptersDemo,
  album: AlbumDemo,
  'event-coverage': EventCoverageViewer,
  campaign: CampaignDeliveryViewer
};

export function DeliveryFormatViewer({ format = 'photo-story', ...props }) {
  if (props.delivery?.schemaVersion >= 3) return <PresentationViewer {...props} />;
  const Viewer = VIEWERS[format] || StoryViewer;
  if (format === 'photo-story') return <Viewer {...props} />;
  return <Viewer {...props} />;
}
