import React from 'react';
import StoryViewer from '../../pages/StoryViewer.jsx';
import { EditorialDemo, RevealDemo } from '../../pages/FormatDemo.jsx';
import CanvasViewer from './CanvasViewer.jsx';
import ChaptersViewer from './ChaptersViewer.jsx';
import AlbumViewer from './AlbumViewer.jsx';
import { CampaignDeliveryViewer, EventCoverageViewer } from './EventCampaignViewers.jsx';

const VIEWERS = {
  'photo-story': StoryViewer,
  editorial: EditorialDemo,
  'photo-reveal': RevealDemo,
  canvas: CanvasViewer,
  chapters: ChaptersViewer,
  album: AlbumViewer,
  'event-coverage': EventCoverageViewer,
  campaign: CampaignDeliveryViewer
};

export function DeliveryFormatViewer({ format = 'photo-story', ...props }) {
  const Viewer = VIEWERS[format] || StoryViewer;
  return <Viewer {...props} />;
}
