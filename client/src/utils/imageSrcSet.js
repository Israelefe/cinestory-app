// Keep signed media URLs intact when building responsive candidates.
// Candidates are separated after their width/density descriptor, not at every comma.
export function imageSrcSetCandidates(value) {
  return [...String(value || '').matchAll(/(?:^|,\s*)(\S+)\s+(\d+(?:\.\d+)?[wx])(?=\s*(?:,|$))/g)]
    .map(match => ({ url: match[1], descriptor: match[2], width: match[2].endsWith('w') ? Number.parseFloat(match[2]) : null }));
}

export function mapImageSrcSet(value, mapUrl) {
  if (!value) return value;
  return imageSrcSetCandidates(value).map(candidate => `${mapUrl(candidate.url)} ${candidate.descriptor}`).join(', ');
}
