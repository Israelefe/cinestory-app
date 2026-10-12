import React, { useEffect, useState } from 'react';
import api, { apiMessage } from '../../services/api.js';
import { Check, Image, Search } from 'lucide-react';
import { photoId } from './libraryHelpers.js';
import { useLibraryPhotos } from './useLibraryPhotos.js';

export default function PhotoPicker({ selected, onChange, initialFolder = '', limit = 500 }) {
  const [folder, setFolder] = useState(initialFolder);
  const [search, setSearch] = useState('');
  const [chosenOnly, setChosenOnly] = useState(false);
  const library = useLibraryPhotos({ folder, search });
  const [chosenPhotos, setChosenPhotos] = useState([]), [chosenError, setChosenError] = useState('');
  useEffect(() => {
    if (!chosenOnly) return;
    if (!selected.length) { setChosenPhotos([]); return; }
    let active = true;
    api.post('/v1/storage/photos/resolve', { assetIds: selected }).then(({ data }) => { if (active) { setChosenPhotos(data.data); setChosenError(''); } }).catch(error => { if (active) setChosenError(apiMessage(error, 'Your selected photographs could not be loaded.')); });
    return () => { active = false; };
  }, [chosenOnly, selected]);
  const photos = chosenOnly ? chosenPhotos.filter(photo => selected.includes(photoId(photo))) : library.assets;
  function toggle(id) { onChange(selected.includes(id) ? selected.filter(value => value !== id) : selected.length < limit ? [...selected, id] : selected); }
  return <section className="lib-picker" aria-label="Choose photographs"><div className="lib-toolbar"><label className="lib-search"><Search size={17} /><input aria-label="Search photographs" placeholder="Search filenames or tags" value={search} onChange={event => setSearch(event.target.value)} /></label><select aria-label="Choose a shoot" value={folder} onChange={event => setFolder(event.target.value)}><option value="">All photographs</option>{library.shoots.map(shoot => <option value={shoot.name} key={shoot.name}>{shoot.name}</option>)}</select></div><div className="lib-picker-count"><strong>{selected.length} selected <span>/ {limit}</span></strong><div><button type="button" onClick={() => { const ids = library.assets.map(photoId); onChange([...new Set([...selected, ...ids])].slice(0, limit)); }}>Select loaded photos</button><button type="button" disabled={!selected.length} onClick={() => onChange([])}>Clear</button><button type="button" aria-pressed={chosenOnly} onClick={() => setChosenOnly(!chosenOnly)}>{chosenOnly ? 'Show all' : 'Selected only'}</button></div></div>{chosenError && <div className="lib-error" role="alert">{chosenError}</div>}{library.error && <div className="lib-error" role="alert">{library.error}<button type="button" onClick={library.reload}>Try again</button></div>}{library.loading && !library.assets.length ? <div className="lib-empty" role="status">Loading your photographs…</div> : !photos.length ? <div className="lib-empty"><Image size={28} /><strong>{chosenOnly ? 'No selected photographs in this view.' : 'No photographs in this view.'}</strong><span>Try another shoot or search.</span></div> : <div className="lib-photo-grid lib-picker-grid">{photos.map(photo => { const id = photoId(photo), chosen = selected.includes(id); return <button key={id} type="button" className={`lib-photo ${chosen ? 'is-selected' : ''}`} aria-label={`Select ${photo.originalFilename}`} aria-pressed={chosen} disabled={!chosen && selected.length >= limit} onClick={() => toggle(id)}><img src={photo.thumbnailUrl || photo.url} alt="" loading="lazy" decoding="async" /><i className="lib-check">{chosen && <Check size={16} />}</i><span>{photo.originalFilename}</span></button>; })}</div>}{!chosenOnly && library.hasMore && <button type="button" className="lib-button lib-more" disabled={library.loading} onClick={library.loadMore}>{library.loading ? 'Loading…' : 'Load more photographs'}</button>}</section>;
}
