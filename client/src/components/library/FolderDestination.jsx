import React, { useState } from 'react';
import { FolderOpen } from 'lucide-react';

export const folderLabel = value => !value || ['Unfiled', 'All photographs'].includes(value) ? 'Not in a folder' : value;

export default function FolderDestination({ value, onChange, folders = [] }) {
  const names = [...new Set(folders.map(folder => typeof folder === 'string' ? folder : folder.name))].filter(name => name && !['Unfiled', 'All photographs'].includes(name));
  const [creating, setCreating] = useState(false);
  const selected = value || 'Unfiled';
  return <div className="lib-folder-destination">
    <label><span><FolderOpen size={16} />Save photographs in</span><select value={creating ? '__new' : selected} onChange={event => { const next = event.target.value; setCreating(next === '__new'); onChange(next === '__new' ? '' : next); }}>
      <option value="Unfiled">Not in a folder</option>
      {!creating && selected !== 'Unfiled' && !names.includes(selected) && <option value={selected}>{selected}</option>}
      {names.map(name => <option key={name} value={name}>{name}</option>)}<option value="__new">Create folder…</option>
    </select></label>
    {creating && <label>Folder name<input autoFocus maxLength={100} value={value} onChange={event => onChange(event.target.value)} placeholder="For example, Ada’s birthday portraits" /></label>}
    <p className="lib-fine">Folders keep photographs from the same client or session together. You can organise them later too.</p>
  </div>;
}
