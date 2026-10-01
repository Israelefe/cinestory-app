import { categoryKey, portfolioCategories, UNGROUPED } from './portfolioCategories.js';
export const photoId = item => item.id || item.publicId;

// Allocate each photograph to one place in the page. Opening a category shows
// its complete set instead, with the opening photographs removed from the hero.
export function portfolioPresentation({ portfolio, photos, cover, template, category = null, activeProject = false }) {
  const items = portfolio.items || [];
  const projects = activeProject ? [] : (portfolio.projects || []);
  const filtered = category !== null;
  const opening = filtered || !cover ? [] : [cover];
  const companion = !activeProject && template === 'folio' && !filtered ? photos.find(photo => photoId(photo) !== photoId(cover || {})) : null;
  if (companion) opening.push(companion);
  const reserved = new Set(opening.map(photoId));
  const visible = filtered ? photos.filter(photo => categoryKey(photo.category || UNGROUPED) === categoryKey(category)) : photos;
  if (filtered) visible.forEach(photo => reserved.add(photoId(photo)));
  const projectCards = projects.filter(project => !filtered || categoryKey(project.category) === categoryKey(category)).map(project => {
    const projectPhotos = project.photoIds.map(id => items.find(item => photoId(item) === id)).filter(Boolean);
    const candidate = projectPhotos.find(photo => photoId(photo) === project.coverId) || projectPhotos[0];
    const image = candidate && !reserved.has(photoId(candidate)) ? candidate : null;
    if (image) reserved.add(photoId(image));
    return { project, image };
  });
  const work = filtered ? visible : visible.filter(photo => !reserved.has(photoId(photo)));
  const categories = portfolioCategories(portfolio).filter(name => photos.some(photo => categoryKey(photo.category) === categoryKey(name)) || projects.some(project => categoryKey(project.category) === categoryKey(name)));
  const groups = portfolio.direction?.showCategories === false ? [{ name: '', photos: work }] : [...categories, UNGROUPED].map(name => ({ name, photos: work.filter(photo => categoryKey(photo.category || UNGROUPED) === categoryKey(name)) }));
  return { opening, companion, projectCards, categories, visible, work, groups: groups.filter(group => group.photos.length) };
}
