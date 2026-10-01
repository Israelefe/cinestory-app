export const UNGROUPED = 'Selected work';
export const categoryName = value => String(value || '').trim().replace(/\s+/g, ' ');
export const categoryKey = value => categoryName(value).toLocaleLowerCase('en');

export function portfolioCategories(portfolio) {
  const names = new Map();
  for (const value of [...(portfolio.categories || []), ...(portfolio.items || []).map(item => item.category), ...(portfolio.projects || []).map(project => project.category)]) {
    const name = categoryName(value), key = categoryKey(name);
    if (name && key !== categoryKey(UNGROUPED) && !names.has(key)) names.set(key, name);
  }
  return [...names.values()];
}

export function changeCategory(portfolio, previous, name, photoIds) {
  const key = categoryKey(previous), nextName = categoryName(name);
  const matches = value => Boolean(previous) && categoryKey(value) === key;
  const currentCategories = portfolioCategories(portfolio);
  const categories = currentCategories.map(value => matches(value) ? nextName : value).filter(Boolean);
  if (nextName && !currentCategories.some(matches)) categories.push(nextName);
  return {
    ...portfolio,
    categories,
    items: portfolio.items.map(item => ({ ...item, category: photoIds?.includes(item.id) ? nextName || UNGROUPED : matches(item.category) ? UNGROUPED : item.category })),
    projects: portfolio.projects.map(project => ({ ...project, category: matches(project.category) ? nextName || UNGROUPED : project.category }))
  };
}
