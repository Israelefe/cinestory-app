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
  test(`${template} opens the cover's category and renders only that collection, without repeated project covers`, () => {
    const presentation = portfolioPresentation({ portfolio, photos: items, cover: items[0], template });
    const ids = [...presentation.opening, ...presentation.work, ...presentation.projectCards.map(card => card.image).filter(Boolean)].map(photo => photo.id);
    assert.deepEqual(new Set(ids), new Set(['photo-0', 'photo-1', 'photo-2']));
    assert.equal(ids.length, 3);
    assert.deepEqual(presentation.categories, ['Weddings', 'Portraits']);
    assert.equal(presentation.selectedCategory, 'Portraits');
    assert.equal(presentation.projectCards.length, 1);
    assert.ok(presentation.groups.every(group => group.photos.every(photo => photo.category === group.name)));
  });
}
test('switching categories changes the opening, photographs and projects together, with a complete viewer collection', () => {
  const result = portfolioPresentation({ portfolio, photos: items, cover: items[0], template: 'folio', category: 'Weddings' });
  assert.deepEqual(result.opening.map(photo => photo.id), ['photo-3', 'photo-4']);
  assert.equal(result.visible.length, 3);
  assert.equal(result.work.length, 1);
  assert.equal(result.projectCards[0].image, null);
  assert.equal(result.projectCards.length, 2);
  assert.ok(result.visible.every(photo => photo.category === 'Weddings'));
});
test('All is only shown if the photographer actually created that category', () => {
  const photos = [{ id: 'a', category: 'All' }, { id: 'b', category: 'Portraits' }];
  const result = portfolioPresentation({ portfolio: { items: photos }, photos, cover: photos[0], template: 'editorial', category: 'All' });
  assert.deepEqual(result.visible.map(photo => photo.id), ['a']);
  assert.deepEqual(result.opening.map(photo => photo.id), ['a']);
  assert.deepEqual(result.work, []);
});

test('unassigned work has its own collection and never contains named categories', () => {
  const photos = [...items, { id: 'ungrouped', category: 'Selected work' }, { id: 'blank' }];
  const draft = { ...portfolio, items: photos, projects: [...portfolio.projects, { id: 'unassigned', photoIds: ['blank'], category: '' }] };
  const result = portfolioPresentation({ portfolio: draft, photos, cover: items[0], template: 'editorial', category: 'Selected work' });
  assert.deepEqual(result.visible.map(photo => photo.id), ['ungrouped', 'blank']);
  assert.deepEqual(result.projectCards.map(card => card.project.id), ['unassigned']);
  assert.equal(portfolioCategoryLabel(result.selectedCategory, result.categories), 'Other work');
  assert.equal(portfolioCategoryLabel('Selected work', ['Other work', 'Selected work']), 'Uncategorised');
});

test('missing categories fall back safely and hidden categories produce one unlabelled collection', () => {
  const removed = portfolioPresentation({ portfolio, photos: items, cover: items[0], template: 'editorial', category: 'Removed category' });
  assert.equal(removed.selectedCategory, 'Portraits');
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

test('an explicitly chosen public cover remains visible even when marked projects-only', () => {
  const cover = { id: 'cover', category: 'Weddings', featured: false };
  const result = portfolioPresentation({ portfolio: { ...portfolio, items: [cover, ...items] }, photos: items, cover, template: 'folio' });
  assert.equal(result.selectedCategory, 'Weddings');
  assert.equal(result.opening[0].id, 'cover');
  assert.deepEqual(result.visible.map(photo => photo.id), ['cover', 'photo-3', 'photo-4', 'photo-5']);
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
