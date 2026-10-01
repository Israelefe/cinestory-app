import assert from 'node:assert/strict';
import { test } from 'node:test';
import { portfolioPresentation } from '../src/services/portfolioPresentation.js';
import { changeCategory, portfolioCategories } from '../src/services/portfolioCategories.js';

const items = Array.from({ length: 6 }, (_, index) => ({ id: `photo-${index}`, category: index < 3 ? 'Portraits' : 'Weddings', featured: true }));
const portfolio = { items, categories: ['Weddings', 'Portraits', 'Campaigns'], direction: {}, projects: [
  { id: 'one', category: 'Portraits', coverId: 'photo-0', photoIds: ['photo-0', 'photo-1'] },
  { id: 'two', category: 'Weddings', coverId: 'photo-3', photoIds: ['photo-3', 'photo-4'] },
  { id: 'three', category: 'Weddings', coverId: 'photo-3', photoIds: ['photo-3', 'photo-5'] }
] };
for (const template of ['editorial', 'cinema', 'gallery', 'folio']) {
  test(`${template} allocates every featured photograph once, including overlapping project covers`, () => {
    const presentation = portfolioPresentation({ portfolio, photos: items, cover: items[0], template });
    const ids = [...presentation.opening, ...presentation.work, ...presentation.projectCards.map(card => card.image).filter(Boolean)].map(photo => photo.id);
    assert.equal(ids.length, 6);
    assert.equal(new Set(ids).size, 6);
    assert.deepEqual(presentation.categories, ['Weddings', 'Portraits']);
    assert.equal(presentation.projectCards.length, 3);
    assert.ok(presentation.groups.every(group => group.photos.every(photo => photo.category === group.name)));
  });
}
test('category view includes its opening photographs and keeps the viewer collection complete', () => {
  const result = portfolioPresentation({ portfolio, photos: items, cover: items[0], template: 'folio', category: 'Portraits' });
  assert.equal(result.opening.length, 0);
  assert.equal(result.companion, null);
  assert.equal(result.visible.length, 3);
  assert.equal(result.work.length, 3);
  assert.equal(result.projectCards[0].image, null);
  assert.equal(result.projectCards.length, 1);
});
test('a category named All can be filtered independently from the overview', () => {
  const photos = [{ id: 'a', category: 'All' }, { id: 'b', category: 'Portraits' }];
  const result = portfolioPresentation({ portfolio: { items: photos }, photos, cover: photos[0], template: 'editorial', category: 'All' });
  assert.deepEqual(result.work.map(photo => photo.id), ['a']);
});
test('renaming or removing a category updates photo and project membership without deleting work', () => {
  const renamed = changeCategory(portfolio, 'Portraits', 'Studio portraits', ['photo-0', 'photo-1', 'photo-4']);
  assert.deepEqual(renamed.categories, ['Weddings', 'Studio portraits', 'Campaigns']);
  assert.equal(renamed.items[0].category, 'Studio portraits');
  assert.equal(renamed.items[2].category, 'Selected work');
  assert.equal(renamed.items[4].category, 'Studio portraits');
  assert.equal(renamed.projects[0].category, 'Studio portraits');
  const removed = changeCategory(renamed, 'Studio portraits', '');
  assert.equal(removed.items.length, 6);
  assert.equal(removed.projects.length, 3);
  assert.equal(removed.items[0].category, 'Selected work');
  assert.equal(removed.projects[0].category, 'Selected work');
  assert.ok(!portfolioCategories(removed).includes('Studio portraits'));
  assert.ok(portfolioCategories(removed).includes('Campaigns'));
});
test('project pages show their cover once while keeping all project photographs available', () => {
  const photos = items.slice(0, 2);
  const result = portfolioPresentation({ portfolio, photos, cover: photos[0], template: 'folio', activeProject: true });
  assert.equal(result.companion, null);
  assert.equal(result.projectCards.length, 0);
  assert.equal(result.visible.length, 2);
  assert.equal(result.work.length, 1);
});
