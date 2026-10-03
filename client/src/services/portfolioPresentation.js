import { categoryKey, portfolioCategories, UNGROUPED } from './portfolioCategories.js';
export const photoId = item => item.id || item.publicId;

// The main gallery is the photographer's selection. Categories are optional
// collections and never add or remove photographs from that selection.
export function portfolioPresentation({ portfolio, photos, cover, template, category = null, activeProject = false }) {
  const items = portfolio.items || [];
  const projects = activeProject ? [] : (portfolio.projects || []);
  const membership = value => categoryKey(value) || categoryKey(UNGROUPED);
  const hasWork = name => items.some(photo => membership(photo.category) === categoryKey(name)) || projects.some(project => membership(project.category) === categoryKey(name));
  const categories = !activeProject && portfolio.direction?.showCategories !== false ? portfolioCategories(portfolio).filter(hasWork) : [];
  const selectedCategory = categories.find(name => categoryKey(name) === categoryKey(category)) || null;
  const visible = selectedCategory === null ? photos : items.filter(photo => membership(photo.category) === categoryKey(selectedCategory));
  const openingPhoto = visible.find(photo => photoId(photo) === photoId(cover || {})) || visible[0];
  const opening = selectedCategory === null && openingPhoto ? [openingPhoto] : [];
  // Small collections need a photograph beneath their opening, too.
  const companion = !activeProject && selectedCategory === null && template === 'folio' && visible.length > 2 ? visible.find(photo => photoId(photo) !== photoId(openingPhoto)) : null;
  if (companion) opening.push(companion);
  const reserved = new Set(opening.map(photoId));
  const work = visible.filter(photo => !reserved.has(photoId(photo)));
  // Category photographs take priority over project thumbnails. A project can
  // link to an overlapping set without repeating its images on this page.
  visible.forEach(photo => reserved.add(photoId(photo)));
  const projectCards = projects.filter(project => selectedCategory === null || membership(project.category) === categoryKey(selectedCategory)).map(project => {
    const projectPhotos = project.photoIds.map(id => items.find(item => photoId(item) === id)).filter(Boolean);
    const candidate = projectPhotos.find(photo => photoId(photo) === project.coverId) || projectPhotos[0];
    // Project links must not pull an excluded photograph into the main gallery.
    const image = candidate && candidate.featured !== false && !reserved.has(photoId(candidate)) && (selectedCategory === null || membership(candidate.category) === categoryKey(selectedCategory)) ? candidate : null;
    if (image) reserved.add(photoId(image));
    return { project, image };
  });
  const groups = work.length ? [{ name: selectedCategory || '', photos: work }] : [];
  return { opening, companion, projectCards, categories, selectedCategory, visible, work, groups };
}

export function portfolioCategoryLabel(name, categories = []) {
  return categoryKey(name) === categoryKey(UNGROUPED) ? '' : name;
}
