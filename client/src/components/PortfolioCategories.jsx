import React, { useState } from 'react';
import { Check, Folder, Plus, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useVeyloReducedMotion } from '../utils/motionPolicy.js';
import { categoryKey, categoryName, changeCategory, portfolioCategories, UNGROUPED } from '../services/portfolioCategories.js';
import './PortfolioCategories.css';

export function PortfolioCategoryField({ value, onChange, categories, label = 'Category' }) {
  return <label className="v-pedit-field"><span>{label}</span><select aria-label={label} value={value || UNGROUPED} onChange={event => onChange(event.target.value)}><option value={UNGROUPED}>No category</option>{categories.map(name => <option key={name} value={name}>{name}</option>)}</select><small>Create or rename groups in Categories.</small></label>;
}

export default function PortfolioCategories({ form, setForm, Sheet }) {
  const reduced = useVeyloReducedMotion();
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState('');
  const [error, setError] = useState('');
  const categories = portfolioCategories(form);
  const open = previous => {
    setError('');
    const detail = form.content?.categoryDetails.find(detail => categoryKey(detail.name) === categoryKey(previous));
    setEditing({ previous, name: previous, description: detail?.description || '', coverId: detail?.coverId || '', photoIds: form.items.filter(item => categoryKey(item.category) === categoryKey(previous)).map(item => item.id) });
  };
  const save = () => {
    const name = categoryName(editing.name);
    if (!name || name.length > 50) return setError('Use a category name with 1–50 characters.');
    if (categoryKey(name) === categoryKey(UNGROUPED)) return setError('Choose a name such as Weddings, Portraits, or Birthdays.');
    if (categories.some(value => categoryKey(value) === categoryKey(name) && categoryKey(value) !== categoryKey(editing.previous))) return setError('That category already exists. Choose a different name.');
    setForm(current => {
      const next = changeCategory(current, editing.previous, name, editing.photoIds);
      if (next.content) next.content = { ...next.content, categoryDetails: next.content.categoryDetails.map(detail => detail.name === name ? { ...detail, description: editing.description, coverId: editing.photoIds.includes(editing.coverId) ? editing.coverId : '' } : detail) };
      return next;
    });
    setEditing(null);
  };
  return <>
    <div className="v-pedit-section-head"><div><h2>Group your work</h2><p>Help clients find your weddings, portraits, birthdays, and campaigns.</p></div><button disabled={categories.length >= 100} onClick={() => open('')}><Plus size={17} />Add category</button></div>
    <div className="v-pcategories-grid">{categories.map((name, index) => {
      const photos = form.items.filter(item => categoryKey(item.category) === categoryKey(name));
      const projects = form.projects.filter(item => categoryKey(item.category) === categoryKey(name));
      return <motion.article key={name} initial={reduced ? false : { opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .15 }} transition={{ duration: reduced ? 0 : .3, delay: Math.min(index * .04, .16) }} className="v-pcategory-card"><button className="v-pcategory-open" aria-label={`Edit ${name} category`} onClick={() => open(name)}><div className="v-pcategory-thumbs">{photos.length ? photos.slice(0, 3).map(photo => <img key={photo.id} src={photo.thumbnailUrl || photo.url} alt="" loading="lazy" />) : <Folder size={28} />}</div><strong>{name}</strong><span>{photos.length} {photos.length === 1 ? 'photograph' : 'photographs'}{projects.length > 0 && ` · ${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`}</span><small>Edit name and photographs</small></button><button className="v-pcategory-remove" aria-label={`Remove ${name} category`} onClick={() => setRemoving(name)}><Trash2 size={16} /></button></motion.article>;
    })}</div>
    {!categories.length && <div className="v-pedit-empty"><Folder size={32} /><h3>Give each kind of work its own place</h3><p>Create your first category, then choose the photographs that belong in it.</p></div>}
    <p className="v-pcategories-note">{form.items.filter(item => !item.category || categoryKey(item.category) === categoryKey(UNGROUPED)).length} photographs have no category. Grouping a photograph does not change whether it appears in your main gallery.</p>
    {editing && <Sheet title={editing.previous ? 'Edit category' : 'New category'} onClose={() => setEditing(null)}><label className="v-pedit-field"><span>Category name</span><input aria-label="Category name" value={editing.name} onChange={event => { setEditing({ ...editing, name: event.target.value }); setError(''); }} maxLength={50} placeholder="For example, Traditional weddings" /></label><label className="v-pedit-field"><span>Category introduction</span><textarea aria-label="Category introduction" value={editing.description} maxLength={400} rows={3} onChange={event => setEditing({ ...editing, description: event.target.value })} /></label><label className="v-pedit-field"><span>Category cover</span><select aria-label="Category cover" value={editing.coverId} onChange={event => setEditing({ ...editing, coverId: event.target.value })}><option value="">No cover selected</option>{form.items.filter(item => editing.photoIds.includes(item.id)).map((item, index) => <option key={item.id} value={item.id}>{item.title || `Photograph ${index + 1}`}</option>)}</select></label>{error && <p role="alert" className="v-pedit-error">{error}</p>}<div className="v-pcategories-selection-head"><p>Choose photographs for this group</p><span>{editing.photoIds.length} selected</span></div><p className="v-pcategories-note">Each photograph belongs to one category. Selecting it here moves it from its current group.</p><div className="v-pcategories-selection">{form.items.map((photo, index) => <button key={photo.id} aria-pressed={editing.photoIds.includes(photo.id)} aria-label={`Group photograph ${index + 1}`} onClick={() => setEditing(current => ({ ...current, photoIds: current.photoIds.includes(photo.id) ? current.photoIds.filter(id => id !== photo.id) : [...current.photoIds, photo.id] }))}><img src={photo.thumbnailUrl || photo.url} alt={photo.alt || photo.title || `Photograph ${index + 1}`} loading="lazy" /><span>{photo.title || `Photograph ${index + 1}`}{editing.photoIds.includes(photo.id) && <Check size={16} />}</span></button>)}</div>{!form.items.length && <p>Add photographs in Work when you are ready. You can save an empty category now.</p>}<div className="v-pedit-sheet-actions v-pcategories-actions"><button onClick={() => setEditing(null)}>Cancel</button><button className="v-pedit-primary" onClick={save}>Save category</button></div></Sheet>}
    {removing && <Sheet title="Remove category?" onClose={() => setRemoving('')}><p>Remove “{removing}”? Its photographs and projects will stay in your portfolio without a category.</p><div className="v-pedit-sheet-actions v-pcategories-actions"><button onClick={() => setRemoving('')}>Keep category</button><button onClick={() => { setForm(current => changeCategory(current, removing, '')); setRemoving(''); }}>Remove category</button></div></Sheet>}
  </>;
}
