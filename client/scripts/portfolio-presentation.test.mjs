import assert from 'node:assert/strict';
import { test } from 'node:test';
import { portfolioPresentation, portfolioCategoryLabel } from '../src/services/portfolioPresentation.js';
import { changeCategory, portfolioCategories } from '../src/services/portfolioCategories.js';

const items = Array.from({ length: 6 }, (_, index) => ({ id: `photo-${index}`, category: index < 3 ? 'Portraits' : 'Weddings', featured: true }));
const portfolio = { items, categories: ['Weddings', 'Portraits', 'Campaigns'], direction: {}, projects: [
  { id: 'one', category: 'Portraits', coverId: 'photo-0', photoIds: ['photo-0', 'photo-1'] },
  { id: 'two', category: 'Weddings', coverId: 'photo-3', photoIds: ['photo-3', 'photo-4'] },
  { id: 'three', category: 'Weddings', coverId: 'photo-3', photoIds: ['photo-3', 'photo-5'] }
] };
for (const template of ['editorial', 'cinema', 'gallery', 'folio']) {
  test(`${template} opens the complete chosen main gallery without category groups or repeated project covers`, () => {
    const presentation = portfolioPresentation({ portfolio, photos: items, cover: items[0], template });
    const ids = [...presentation.opening, ...presentation.work, ...presentation.projectCards.map(card => card.image).filter(Boolean)].map(photo => photo.id);
    assert.deepEqual(new Set(ids), new Set(items.map(photo => photo.id)));
    assert.equal(ids.length, 6);
    assert.deepEqual(presentation.categories, ['Weddings', 'Portraits']);
    assert.equal(presentation.selectedCategory, null);
    assert.equal(presentation.projectCards.length, 3);
    assert.equal(presentation.groups.length, 1);
    assert.equal(presentation.groups[0].name, '');
  });
}
test('opening a category shows its full collection without another studio opening', () => {
  const result = portfolioPresentation({ portfolio, photos: items, cover: items[0], template: 'folio', category: 'Weddings' });
  assert.deepEqual(result.opening, []);
  assert.equal(result.companion, null);
  assert.equal(result.visible.length, 3);
  assert.equal(result.work.length, 3);
  assert.equal(result.projectCards[0].image, null);
  assert.equal(result.projectCards.length, 2);
  assert.ok(result.visible.every(photo => photo.category === 'Weddings'));
});
test('All is only shown if the photographer actually created that category', () => {
  const photos = [{ id: 'a', category: 'All' }, { id: 'b', category: 'Portraits' }];
  const result = portfolioPresentation({ portfolio: { items: photos }, photos, cover: photos[0], template: 'editorial', category: 'All' });
  assert.deepEqual(result.visible.map(photo => photo.id), ['a']);
  assert.deepEqual(result.opening, []);
  assert.deepEqual(result.work.map(photo => photo.id), ['a']);
});

test('unassigned main photographs do not create an artificial category', () => {
  const photos = [...items, { id: 'ungrouped', category: 'Selected work' }, { id: 'blank' }];
  const draft = { ...portfolio, items: photos, projects: [...portfolio.projects, { id: 'unassigned', photoIds: ['blank'], category: '' }] };
  const result = portfolioPresentation({ portfolio: draft, photos, cover: items[0], template: 'editorial', category: 'Selected work' });
  assert.deepEqual(result.visible.map(photo => photo.id), photos.map(photo => photo.id));
  assert.equal(result.selectedCategory, null);
  assert.deepEqual(result.categories, ['Weddings', 'Portraits']);
  assert.equal(portfolioCategoryLabel('Selected work'), '');
});

test('missing categories fall back safely and hidden categories produce one unlabelled collection', () => {
  const removed = portfolioPresentation({ portfolio, photos: items, cover: items[0], template: 'editorial', category: 'Removed category' });
  assert.equal(removed.selectedCategory, null);
  const hidden = portfolioPresentation({ portfolio: { ...portfolio, direction: { showCategories: false } }, photos: items, cover: items[0], template: 'editorial', category: 'Portraits' });
  assert.deepEqual(hidden.categories, []);
  assert.equal(hidden.selectedCategory, null);
  assert.equal(hidden.visible.length, 6);
  assert.equal(hidden.groups.length, 1);
  assert.equal(hidden.groups[0].name, '');
});

test('a category with only projects keeps its links without borrowing another category photograph', () => {
  const draft = { ...portfolio, projects: [{ id: 'campaign', category: 'Campaigns', coverId: 'photo-0', photoIds: ['photo-0'] }] };
  const result = portfolioPresentation({ portfolio: draft, photos: items, cover: items[0], template: 'folio', category: 'Campaigns' });
  assert.deepEqual(result.opening, []);
  assert.deepEqual(result.visible, []);
  assert.equal(result.projectCards.length, 1);
  assert.equal(result.projectCards[0].image, null);
});

test('portfolios without named categories show photographs without a made-up category', () => {
  const photos = [{ id: 'one', category: 'Selected work' }, { id: 'two', category: '' }];
  const result = portfolioPresentation({ portfolio: { items: photos }, photos, cover: photos[0], template: 'folio' });
  assert.deepEqual(result.categories, []);
  assert.equal(result.selectedCategory, null);
  assert.equal(result.visible.length, 2);
  assert.equal(result.work.length, 1);
});

test('a cover excluded from the main gallery does not force a category photograph into it', () => {
  const cover = { id: 'cover', category: 'Weddings', featured: false };
  const result = portfolioPresentation({ portfolio: { ...portfolio, items: [cover, ...items] }, photos: items, cover, template: 'folio' });
  assert.equal(result.selectedCategory, null);
  assert.equal(result.opening[0].id, 'photo-0');
  assert.deepEqual(result.visible.map(photo => photo.id), items.map(photo => photo.id));
});

test('category-only photographs stay out of the main gallery and remain available in their category', () => {
  const categoryPhoto = { id: 'category-only', category: 'Portraits', featured: false };
  const hidden = { id: 'hidden', category: 'Selected work', featured: false };
  const draft = { ...portfolio, items: [...items, categoryPhoto, hidden], projects: [{ id: 'project', category: 'Portraits', coverId: categoryPhoto.id, photoIds: [categoryPhoto.id, items[0].id] }] };
  const main = portfolioPresentation({ portfolio: draft, photos: items, cover: items[0], template: 'folio' });
  assert.equal(main.visible.length, 6);
  assert.equal(main.projectCards[0].image, null);
  const category = portfolioPresentation({ portfolio: draft, photos: items, cover: items[0], template: 'folio', category: 'Portraits' });
  assert.deepEqual(category.visible.map(photo => photo.id), ['photo-0', 'photo-1', 'photo-2', 'category-only']);
  assert.equal(category.work.length, 4);
  assert.ok(!category.visible.includes(hidden));
  const renamed = changeCategory(draft, 'Portraits', 'Studio', ['photo-0', 'category-only']);
  assert.equal(renamed.items.find(photo => photo.id === 'category-only').featured, false);
  assert.equal(renamed.items[0].featured, true);
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
  const photos = [items[0], items[3]];
  const result = portfolioPresentation({ portfolio, photos, cover: photos[0], template: 'folio', activeProject: true });
  assert.equal(result.companion, null);
  assert.equal(result.projectCards.length, 0);
  assert.equal(result.visible.length, 2);
  assert.deepEqual(result.categories, []);
  assert.equal(result.work.length, 1);
});
