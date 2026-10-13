const mediaKind = file => /\.(mp4|webm)$/i.test(file.name) ? 'video' : /\.(jpe?g|png|webp)$/i.test(file.name) ? 'image' : null;

export function matchSlotUploads(files, requests, slots = {}, selectedSlotId = '') {
  if (selectedSlotId && files.length !== 1) throw new Error('Choose one file for this scene.');
  const claimed = new Set();
  const matches = files.map(file => {
    const kind = mediaKind(file);
    if (!kind) throw new Error('Choose a JPEG, PNG, WebP, MP4 or WebM file.');
    const name = file.name.replace(/\.[^.]+$/, '').toLowerCase();
    const request = requests.find(request => selectedSlotId ? request.id === selectedSlotId : request.id.toLowerCase() === name);
    if (selectedSlotId && !request) throw new Error('This scene is no longer available. Refresh the project.');
    if (request) {
      if (request.kind !== kind) throw new Error(`This scene needs ${request.kind === 'video' ? 'a video clip' : 'an image'}.`);
      if (request.use === 'finished_work') throw new Error('Add your finished photograph through Media library, then assign it to this scene.');
      if (claimed.has(request.id)) throw new Error('Choose one file per scene.');
      claimed.add(request.id);
    }
    return { file, kind, request };
  });
  for (const match of matches.filter(match => !match.request)) {
    const candidates = requests.filter(request => request.use === 'context' && request.kind === match.kind && !slots[request.id]?.assetId && !claimed.has(request.id));
    const remaining = matches.filter(item => !item.request && item.kind === match.kind);
    if (candidates.length !== 1 || remaining.length !== 1) throw new Error('Choose Upload clip or Upload image on the scene you want to use. You can keep the original filename.');
    match.request = candidates[0]; claimed.add(match.request.id);
  }
  return matches;
}
