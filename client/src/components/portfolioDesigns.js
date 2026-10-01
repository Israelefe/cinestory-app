export const portfolioDesigns = [
  {
    id: 'editorial', name: 'Editorial', label: 'A photographic journal',
    description: 'Large type, offset photographs and room for each set to breathe.',
    mobile: 'A full opening photograph, paired images and generous breaks between sets.',
    defaults: { background: 'ink', accent: '#ff9b8e', typeStyle: 'editorial', rhythm: 'measured', layout: 'editorial', motion: 'expressive' }
  },
  {
    id: 'cinema', name: 'Cinema', label: 'The photograph comes first',
    description: 'A screen-filling cover, quiet titles and large photographic scenes.',
    mobile: 'A portrait opening and a swipeable strip of featured photographs.',
    defaults: { background: 'ink', accent: '#d6b995', typeStyle: 'modern', rhythm: 'bold', layout: 'editorial', motion: 'expressive' }
  },
  {
    id: 'gallery', name: 'Gallery', label: 'An exhibition of your work',
    description: 'Framed photographs, small captions and carefully balanced pairs.',
    mobile: 'Single frames alternate with pairs. Tap any photograph for a closer look.',
    defaults: { background: 'warm-black', accent: '#d9c5ad', typeStyle: 'classic', rhythm: 'quiet', layout: 'grid', motion: 'subtle' }
  },
  {
    id: 'folio', name: 'Folio', label: 'A studio, in collections',
    description: 'Bold titles, layered covers and numbered projects lead the page.',
    mobile: 'A layered opening and large project cards with swipeable photo previews.',
    defaults: { background: 'ink', accent: '#ff735d', typeStyle: 'modern', rhythm: 'measured', layout: 'editorial', motion: 'expressive' }
  }
];
export const findPortfolioDesign = id => portfolioDesigns.find(design => design.id === id) || portfolioDesigns[0];
