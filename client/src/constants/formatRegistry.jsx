import { BookOpen, BriefcaseBusiness, CalendarRange, Eye, Film, ListTree, Move, Newspaper } from 'lucide-react';
import { DELIVERY_FORMATS } from './deliveryFormats.js';

const icons = {
  'photo-story': Film,
  editorial: Newspaper,
  'photo-reveal': Eye,
  canvas: Move,
  chapters: ListTree,
  album: BookOpen,
  'event-coverage': CalendarRange,
  campaign: BriefcaseBusiness
};

export const FORMAT_REGISTRY = DELIVERY_FORMATS.map(format => ({
  ...format,
  id: format.value,
  anchorId: format.id,
  icon: icons[format.value]
}));

export const FORMAT_BY_ID = Object.fromEntries(FORMAT_REGISTRY.map(format => [format.id, format]));

export function formatName(id) {
  return FORMAT_BY_ID[id]?.name || 'Delivery';
}
