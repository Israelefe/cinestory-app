import React, { useMemo, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { EDITORIAL_LIMITS as L, EDITORIAL_LAYOUTS, EDITORIAL_TREATMENTS, editorialLayoutLabel, editorialTreatmentLabel } from '../../utils/editorial.js';
import './EditorialEditor.css';

function WritingField({ label, value, onChange, limit, onRegenerate, disabled, optional = false }) {
  const [suggestion, setSuggestion] = useState(null);
  async function regenerate() {
    const text = await onRegenerate();
    if (typeof text === 'string') setSuggestion(text);
  }
  return <div className="ed-edit-writing"><label>{label}{optional && <small>Optional</small>}<textarea rows={4} maxLength={limit} value={value} onChange={event => { onChange(event.target.value); setSuggestion(null); }} /><small>{value.length} / {limit}</small></label>{onRegenerate && <button type="button" className="ed-edit-regenerate" onClick={regenerate} disabled={disabled}><RefreshCw size={15} />Suggest new text</button>}{suggestion !== null && <div className="ed-edit-suggestion" role="status"><span>Suggested text</span><p>{suggestion}</p><div><button type="button" onClick={() => { onChange(suggestion); setSuggestion(null); }}>Use this text</button><button type="button" onClick={() => setSuggestion(null)}>Keep current text</button></div></div>}</div>;
}

export function EditorialDesignControls({ value, onChange }) {
  return <section className="ed-edit-design"><h2>Publication style</h2><p>The photographs and text stay in your chosen order.</p><label>Layout treatment<select value={value.treatment} onChange={event => onChange({ ...value, treatment: event.target.value })}>{EDITORIAL_TREATMENTS.map(id => <option key={id} value={id}>{editorialTreatmentLabel[id]}</option>)}</select></label></section>;
}

export function EditorialPhotoControls({ value, onChange, activeId, settings, onSettingsChange, onOrderChange, onMove, busy = false }) {
  const sectionId = value.sections.find(section => section.assetIds.includes(activeId))?.id || '';
  function moveToSection(targetId) {
    const sections = value.sections.map(section => ({ ...section, assetIds: section.assetIds.filter(id => id !== activeId) }));
    sections.find(section => section.id === targetId)?.assetIds.push(activeId);
    const next = sections.filter(section => section.assetIds.length);
    if (onMove) { onMove({ ...value, sections: next }, next.flatMap(section => section.assetIds), activeId); return; }
    onChange({ ...value, sections: next });
    onOrderChange(next.flatMap(section => section.assetIds), activeId);
  }
  return <div className="ed-photo-controls"><label>Editorial section<select disabled={busy} value={sectionId} onChange={event => moveToSection(event.target.value)}>{value.sections.map((section, index) => <option key={section.id} value={section.id}>{String(index + 1).padStart(2, '0')} / {section.title || 'Selected photographs'}</option>)}</select></label><label>Photo framing<select disabled={busy} value={settings.imageFit || 'contain'} onChange={event => onSettingsChange({ ...settings, imageFit: event.target.value })}><option value="contain">Show the whole photograph</option><option value="cover">Fill the frame</option></select></label><label>Framing focus<select disabled={busy} value={settings.focalPoint || '50% 50%'} onChange={event => onSettingsChange({ ...settings, focalPoint: event.target.value })}>{[['50% 50%', 'Centre'], ['50% 20%', 'Upper part'], ['50% 80%', 'Lower part'], ['20% 50%', 'Left side'], ['80% 50%', 'Right side']].map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label></div>;
}

export default function EditorialEditor({ value, onChange, assets, frames, onRegenerate, busy, openingLine, closingLine, onOpeningChange, onClosingChange, openingAssetId, closingAssetId }) {
  const byId = useMemo(() => new Map(assets.map(asset => [asset.assetId, asset])), [assets]);
  const frameById = useMemo(() => new Map(frames.map(frame => [frame.assetId, frame])), [frames]);
  const updateSection = (index, patch) => onChange({ ...value, sections: value.sections.map((section, at) => at === index ? { ...section, ...patch } : section) });
  const regen = (block, ids, previous) => onRegenerate(block, ids, previous);
  function addSection() {
    const index = value.sections.findLastIndex(section => section.assetIds.length > 1);
    if (index < 0 || value.sections.length >= 7) return;
    const sections = value.sections.map(section => ({ ...section, assetIds: [...section.assetIds] }));
    const id = sections[index].assetIds.pop();
    sections.splice(index + 1, 0, { id: `feature-${Date.now()}`, title: frameById.get(id)?.headline || '', body: '', pullLine: '', layout: 'auto', assetIds: [id] });
    onChange({ ...value, sections });
  }
  return <section className="v3-panel ed-editor"><div className="v3-panel-heading"><span>02</span><div><h2>Shape the Editorial feature.</h2><p>Keep the suggested sections, or adjust the text and spreads.</p></div></div>
    <WritingField label="Cover summary" value={openingLine} onChange={onOpeningChange} limit={L.summary} disabled={busy} onRegenerate={() => regen('summary', [openingAssetId], openingLine)} />
    <WritingField label="Feature introduction" value={value.introduction} onChange={text => onChange({ ...value, introduction: text })} limit={L.introduction} optional disabled={busy} onRegenerate={() => regen('introduction', value.sections.flatMap(section => section.assetIds), value.introduction)} />
    <div className="ed-edit-section-heading"><h3>Photo sections</h3><button type="button" onClick={addSection} disabled={busy || value.sections.length >= 7 || !value.sections.some(section => section.assetIds.length > 1)}><Plus size={16} />Add section</button></div>
    <div className="ed-edit-sections">{value.sections.map((section, index) => {
      const pullOptions = [...new Set([section.body, ...section.assetIds.map(id => frameById.get(id)?.caption || '')].flatMap(text => text.match(/[^.!?]+[.!?]?/g) || []).map(text => text.trim()).filter(text => text.length > 8 && text.length <= L.pullLine))];
      if (section.pullLine && !pullOptions.includes(section.pullLine)) pullOptions.unshift(section.pullLine);
      const previousSection = value.sections[index - 1];
      const mergedBody = previousSection ? [previousSection.body, section.body].filter(Boolean).join('\n\n') : '';
      return <details key={section.id} className="ed-edit-section" open={index === 0}><summary><span>{String(index + 1).padStart(2, '0')}</span><strong>{section.title || 'Selected photographs'}</strong><small>{section.assetIds.length} photos</small></summary><div className="ed-edit-section-body">
        <div className="ed-edit-photo-strip">{section.assetIds.map(id => <img key={id} src={byId.get(id)?.thumbnailUrl || byId.get(id)?.url} alt={frameById.get(id)?.headline || 'Section photograph'} loading="lazy" />)}</div>
        <label>Section {index + 1} heading<input value={section.title} maxLength={L.sectionTitle} onChange={event => updateSection(index, { title: event.target.value })} /></label>
        <WritingField label={`Section ${index + 1} paragraph`} value={section.body} onChange={body => updateSection(index, { body, pullLine: body.includes(section.pullLine) ? section.pullLine : '' })} limit={L.sectionBody} optional disabled={busy} onRegenerate={() => regen('section', section.assetIds, section.body)} />
        <div className="ed-edit-row"><label>Section {index + 1} layout<select value={section.layout} onChange={event => updateSection(index, { layout: event.target.value })}>{EDITORIAL_LAYOUTS.map(id => <option key={id} value={id}>{editorialLayoutLabel[id]}</option>)}</select></label><label>Section {index + 1} pull line<select value={pullOptions.includes(section.pullLine) ? section.pullLine : ''} onChange={event => updateSection(index, { pullLine: event.target.value })}><option value="">No pull line</option>{pullOptions.map(text => <option key={text} value={text}>{text}</option>)}</select><small>Choose a line from the paragraph or captions.</small></label></div>
        {index > 0 && <button type="button" className="ed-edit-merge" disabled={busy || mergedBody.length > L.sectionBody} onClick={() => { const sections = value.sections.map(item => ({ ...item, assetIds: [...item.assetIds] })); sections[index - 1] = { ...sections[index - 1], body: mergedBody, assetIds: [...sections[index - 1].assetIds, ...section.assetIds] }; sections.splice(index, 1); onChange({ ...value, sections }); }}>Merge with previous section</button>}
      </div></details>;
    })}</div>
    <WritingField label="Editorial closing note" value={closingLine} onChange={onClosingChange} limit={L.closing} disabled={busy} onRegenerate={() => regen('closing', [closingAssetId], closingLine)} />
    <details className="ed-edit-extras"><summary>Photographer’s note, credits and issue label</summary><div><WritingField label="Photographer’s note" value={value.note} onChange={note => onChange({ ...value, note })} limit={L.note} optional /><label>Issue label (optional)<input maxLength={32} value={value.issue} onChange={event => onChange({ ...value, issue: event.target.value })} placeholder="e.g. Birthday portraits / 2026" /></label><div className="ed-edit-section-heading"><h3>Credits</h3><button type="button" disabled={value.credits.length >= 8} onClick={() => onChange({ ...value, credits: [...value.credits, { role: '', name: '' }] })}><Plus size={16} />Add credit</button></div>{value.credits.map((credit, index) => <div key={index} className="ed-edit-credit"><label>Credit {index + 1} role<input maxLength={60} value={credit.role} onChange={event => onChange({ ...value, credits: value.credits.map((item, at) => at === index ? { ...item, role: event.target.value } : item) })} placeholder="e.g. Makeup" /></label><label>Credit {index + 1} name<input maxLength={100} value={credit.name} onChange={event => onChange({ ...value, credits: value.credits.map((item, at) => at === index ? { ...item, name: event.target.value } : item) })} /></label><button type="button" aria-label={`Remove credit ${index + 1}`} onClick={() => onChange({ ...value, credits: value.credits.filter((_, at) => at !== index) })}><Trash2 size={17} /></button></div>)}<p className="ed-edit-hint">Add real names supplied for this shoot. Credits and the photographer’s note are never invented.</p></div></details>
  </section>;
}
