import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Image, Layers, Minus, Eye } from 'lucide-react';
import { canvasCheckpoints } from '../../utils/canvas.js';
import './CanvasEditor.css';

const compact = point => point.type === 'group' ? { id: point.id, type: 'group', sectionId: point.sectionId } : { id: point.id, type: 'photo', assetId: point.assetId };
export default function CanvasEditor({ value, sections, selected, assets, onChange, onTextChange, onPreview, busy, addTarget, onAddTarget }) {
  const [checked, setChecked] = useState([]), [groupName, setGroupName] = useState('');
  const points = useMemo(() => canvasCheckpoints({ curatedAssetIds: selected, formatConfig: { canvas: value }, creativeDirection: { sections } }), [value, sections, selected]);
  const byId = new Map(assets.map(asset => [asset.assetId, asset]));
  const publish = (nextPoints, nextSections = sections, options = {}) => {
    const ids = nextPoints.flatMap(point => point.type === 'group' ? nextSections.find(section => section.id === point.sectionId)?.assetIds || [] : [point.assetId]);
    onChange({ canvas: { ...value, checkpoints: nextPoints.map(compact) }, sections: nextSections, selected: ids }, options);
  };
  const move = (pointIndex, offset) => { const next = [...points]; [next[pointIndex], next[pointIndex + offset]] = [next[pointIndex + offset], next[pointIndex]]; publish(next); };
  const singles = () => { const next = selected.map(assetId => ({ id: `photo-${assetId}`, type: 'photo', assetId })); publish(next, []); };
  const ungroup = point => {
    const next = points.flatMap(item => item.id === point.id ? item.assetIds.map(assetId => ({ id: `photo-${assetId}`, type: 'photo', assetId })) : [item]);
    publish(next, sections.filter(section => section.id !== point.sectionId));
  };
  const create = () => {
    const ids = selected.filter(id => checked.includes(id)); if (ids.length < 2 || !groupName.trim()) return;
    const sectionId = `group-${crypto.randomUUID()}`, pointId = `point-${sectionId}`;
    const nextSections = sections.map(section => ({ ...section, assetIds: section.assetIds.filter(id => !ids.includes(id)) })).filter(section => section.assetIds.length);
    nextSections.push({ id: sectionId, title: groupName.trim(), subtitle: '', layout: 'cluster', assetIds: ids });
    const remaining = points.flatMap(point => point.type === 'photo' ? ids.includes(point.assetId) ? [] : [point] : nextSections.some(section => section.id === point.sectionId) ? [point] : []);
    const at = Math.min(points.findIndex(point => point.assetIds.some(id => ids.includes(id))), remaining.length);
    remaining.splice(Math.max(0, at), 0, { id: pointId, type: 'group', sectionId });
    publish(remaining, nextSections, { manual: [`section:${sectionId}:title`] }); setChecked([]); setGroupName('');
  };
  const movePhoto = (assetId, destination) => {
    const nextSections = sections.map(section => ({ ...section, assetIds: section.assetIds.filter(id => id !== assetId) })).filter(section => section.assetIds.length || section.id === destination);
    const nextPoints = points.filter(point => point.type !== 'photo' || point.assetId !== assetId).filter(point => point.type !== 'group' || nextSections.some(section => section.id === point.sectionId));
    if (destination) nextSections.find(section => section.id === destination)?.assetIds.push(assetId);
    else {
      const at = points.findIndex(point => point.assetIds.includes(assetId));
      nextPoints.splice(Math.min(at + 1, nextPoints.length), 0, { id: `photo-${assetId}`, type: 'photo', assetId });
    }
    publish(nextPoints, nextSections);
  };
  const moveWithin = (point, index, offset) => { const ids = [...point.assetIds]; [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]]; publish(points, sections.map(section => section.id === point.sectionId ? { ...section, assetIds: ids } : section)); };
  return <section className="cv-editor v3-panel" aria-label="Canvas checkpoint editor">
    <header><div><span>CANVAS / CHECKPOINTS</span><h2>Arrange the connected board.</h2><p>Keep photos on their own, or combine related photos into a group. The broken line follows this order.</p></div><button type="button" onClick={onPreview}><Eye size={17} />Preview Canvas</button></header>
    <div className="cv-editor-settings"><label>Arrangement<select value={value.arrangement} disabled={busy} onChange={event => onTextChange({ ...value, arrangement: event.target.value })}><option value="spatial">Staggered frames</option><option value="ordered">Aligned frames</option></select></label><label className="cv-editor-check"><input type="checkbox" checked={value.showGroupNotes} disabled={busy} onChange={event => onTextChange({ ...value, showGroupNotes: event.target.checked })} />Show group notes</label><button type="button" disabled={busy || !sections.length} onClick={singles}><Image size={17} />Keep every photo on its own</button></div>
    <div className="cv-editor-combine"><div><label>New group name<input value={groupName} maxLength={60} placeholder="For example, Family portraits" disabled={busy} onChange={event => setGroupName(event.target.value)} /></label><small>Select at least two photos below. Existing captions stay with their photos.</small></div><button type="button" disabled={busy || checked.filter(id => selected.includes(id)).length < 2 || groupName.trim().length < 2 || sections.length >= 5} onClick={create}><Layers size={17} />Combine {checked.filter(id => selected.includes(id)).length || ''} photos</button>{sections.length >= 5 && <p>You can have up to five groups. Move photos into an existing group or ungroup one first.</p>}</div>
    <ol className="cv-editor-points">{points.map((point, at) => <li key={point.id}>
      <div className="cv-editor-point-heading"><span>{String(at + 1).padStart(2, '0')}</span><strong>{point.type === 'group' ? `${point.title || 'Photo group'} · ${point.assetIds.length} photos` : 'Individual photograph'}</strong><div><button type="button" disabled={busy || at === 0} aria-label={`Move checkpoint ${at + 1} earlier`} onClick={() => move(at, -1)}><ArrowUp size={17} /></button><button type="button" disabled={busy || at === points.length - 1} aria-label={`Move checkpoint ${at + 1} later`} onClick={() => move(at, 1)}><ArrowDown size={17} /></button>{point.type === 'group' && <button type="button" disabled={busy} onClick={() => ungroup(point)}><Minus size={16} />Ungroup</button>}</div></div>
      {point.type === 'group' && <div className="cv-editor-group-words"><label>Group name<input value={point.title} maxLength={60} disabled={busy} onChange={event => onTextChange(null, point.sectionId, 'title', event.target.value)} /></label><label>Short note <small>Optional</small><textarea rows={2} maxLength={120} value={point.note} disabled={busy} onChange={event => onTextChange(null, point.sectionId, 'subtitle', event.target.value)} /></label></div>}
      <div className="cv-editor-photos">{point.assetIds.map((id, index) => <div className="cv-editor-photo" key={id}><label className="cv-editor-select"><input type="checkbox" aria-label={`Select photo ${selected.indexOf(id) + 1} to combine`} checked={checked.includes(id)} disabled={busy} onChange={event => setChecked(current => event.target.checked ? [...current, id] : current.filter(value => value !== id))} /><img src={byId.get(id)?.thumbnailUrl || byId.get(id)?.url} alt="" loading="lazy" /><span>Photo {String(selected.indexOf(id) + 1).padStart(2, '0')}</span></label><label className="cv-editor-destination"><span>Checkpoint</span><select disabled={busy} aria-label={`Move photo ${selected.indexOf(id) + 1} to checkpoint`} value={point.type === 'group' ? point.sectionId : ''} onChange={event => movePhoto(id, event.target.value)}><option value="">Individual photograph</option>{sections.map(section => <option key={section.id} value={section.id}>{section.title || 'Photo group'}</option>)}</select></label>{point.type === 'group' && <div className="cv-editor-photo-order"><button type="button" aria-label={`Move photo ${selected.indexOf(id) + 1} earlier in group`} disabled={busy || index === 0} onClick={() => moveWithin(point, index, -1)}><ArrowUp size={16} /></button><button type="button" aria-label={`Move photo ${selected.indexOf(id) + 1} later in group`} disabled={busy || index === point.assetIds.length - 1} onClick={() => moveWithin(point, index, 1)}><ArrowDown size={16} /></button></div>}</div>)}</div>
    </li>)}</ol>
    <label className="cv-editor-add-target">Place the next added photo<select aria-label="Place the next added photo" value={sections.some(section => section.id === addTarget) ? addTarget : ''} disabled={busy} onChange={event => onAddTarget(event.target.value)}><option value="">At a new individual checkpoint</option>{sections.map(section => <option key={section.id} value={section.id}>In {section.title || 'photo group'}</option>)}</select></label>
  </section>;
}
