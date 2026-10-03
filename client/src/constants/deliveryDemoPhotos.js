import { EVENT_COVERAGE_DEMO_PHOTOS } from './eventCoverageDemo.js';
export const editorialPhotos = Array.from({ length: 5 }, (_, index) => ({ name: `demo-ada-${index + 1}`, alt: `Ada's fashion portrait ${index + 1}` }));
export const revealPhotos = Array.from({ length: 4 }, (_, index) => ({ name: `demo-sharon-${index + 1}`, alt: `Sharon's studio portrait ${index + 1}` }));
export const couragePhotos = Array.from({ length: 6 }, (_, index) => ({ name: `demo-courage-${index + 1}`, alt: `Courage's graduation portrait ${index + 1}` }));
export const weddingPhotos = Array.from({ length: 5 }, (_, index) => ({ name: `demo-wedding-${index + 1}`, alt: `Folake and Tunde's wedding portrait ${index + 1}` }));
export const albumPhotos = ['demo-album-fa-source', 'demo-album-fa-2', 'demo-album-fa-3', 'demo-album-fa-4', 'demo-album-fa-5'].map((name, index) => ({ name, alt: `The Adeyemi family album portrait ${index + 1}` }));
export const eventCoveragePhotos = EVENT_COVERAGE_DEMO_PHOTOS;
export const campaignPhotos = [
  { name: '/veylo/demo/campaign/campaign-01-hero.webp', alt: 'Tan leather handbag and wallet on an indigo pedestal', caption: 'The campaign opens with the pieces together: warm leather, clean shape, and a confident point of view.', assetType: 'CAMPAIGN HERO', deliveryLabel: 'MASTER / WEB', campaignType: 'hero' },
  { name: '/veylo/demo/campaign/campaign-02-detail.webp', alt: 'Close detail of leather stitching and brass hardware', caption: 'Stitching, grain, and hardware are kept close enough to inspect.', assetType: 'DETAIL', deliveryLabel: 'DETAIL / CROP', campaignType: 'detail' },
  { name: '/veylo/demo/campaign/campaign-03-lifestyle.webp', alt: 'Woman carrying a tan leather handbag through a modern lobby', caption: 'The everyday frame shows how the bag sits in a real working day.', assetType: 'LIFESTYLE', deliveryLabel: 'SOCIAL / 4:5', campaignType: 'lifestyle' },
  { name: '/veylo/demo/campaign/campaign-04-kit.webp', alt: 'A leather handbag, wallet, card holder and packaging arranged overhead', caption: 'The complete kit is laid out for a quick, useful handoff.', assetType: 'KIT', deliveryLabel: 'CATALOG / FLATLAY', campaignType: 'kit' },
  { name: '/veylo/demo/campaign/campaign-05-context.webp', alt: 'Woman seated beside a tan leather handbag at an indigo table', caption: 'A quieter context frame gives the campaign room to breathe across a feed or landing page.', assetType: 'CONTEXT', deliveryLabel: 'SOCIAL / 1:1', campaignType: 'context' },
  { name: '/veylo/demo/campaign/campaign-06-detail-clasp.webp', alt: 'Macro view of a tan leather handbag clasp and card holder on indigo fabric', caption: 'The clasp, edge paint, and fine stitch line give the detail set its close-up proof.', assetType: 'DETAIL', deliveryLabel: 'DETAIL / MACRO', campaignType: 'detail' },
  { name: '/veylo/demo/campaign/campaign-07-lifestyle-courtyard.webp', alt: 'Nigerian woman carrying a tan leather handbag through a bright office courtyard', caption: 'A clear daytime frame shows the bag moving naturally through a working day.', assetType: 'LIFESTYLE', deliveryLabel: 'SOCIAL / 4:5', campaignType: 'lifestyle' },
  { name: '/veylo/demo/campaign/campaign-08-in-use-desk.webp', alt: 'Professional carrying a tan leather handbag beside a desk at sunset', caption: 'The in-use frame places the bag beside the work it was made to carry.', assetType: 'LIFESTYLE', deliveryLabel: 'WEB / LANDSCAPE', campaignType: 'lifestyle' },
  { name: '/veylo/demo/campaign/campaign-09-boutique-shelf.webp', alt: 'Tan leather handbag and small goods arranged on a boutique shelf', caption: 'A retail-ready arrangement gives the team a clean display and catalogue option.', assetType: 'KIT', deliveryLabel: 'RETAIL / DISPLAY', campaignType: 'kit' },
  { name: '/veylo/demo/campaign/campaign-10-unboxing.webp', alt: 'Tan leather handbag in cream tissue inside a presentation box', caption: 'Packaging and product arrive together in a frame that suits launch and unboxing use.', assetType: 'KIT', deliveryLabel: 'SOCIAL / UNBOXING', campaignType: 'kit' },
  { name: '/veylo/demo/campaign/campaign-11-travel.webp', alt: 'Tan leather handbag resting beside a passenger in a sunlit car', caption: 'A travel context gives the campaign a practical moment beyond the studio.', assetType: 'LIFESTYLE', deliveryLabel: 'CAMPAIGN / CONTEXT', campaignType: 'lifestyle' },
  { name: '/veylo/demo/campaign/campaign-12-cafe.webp', alt: 'Nigerian woman seated at a cafe with a tan leather handbag beside her', caption: 'The café portrait gives the product a human setting without turning the frame into a posed advert.', assetType: 'CONTEXT', deliveryLabel: 'SOCIAL / PORTRAIT', campaignType: 'context' }
];

export const imageSrc = (photo, width = 1440) => {
  if (photo?.url) return photo.url;
  const name = typeof photo === 'string' ? photo : photo?.name;
  if (typeof name === 'string' && (name.startsWith('http') || name.startsWith('/'))) return name;
  return `/veylo/web/${name || photo}-${width}.webp`;
};

