function downloadUrl(value) {
  if (typeof value !== 'string' || !value) throw new Error('The download link is missing.');
  const url = new URL(value, location.href);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('The download link is invalid.');
  return url.href;
}

function clickDownload(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = String(filename || 'photograph.jpg').replace(/[\\/\x00-\x1f]/g, '_');
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function downloadPhotograph(url, filename, { signal } = {}) {
  // The signed link carries media permission. Never forward the delivery's
  // access headers to a different origin or assume an anchor click succeeded.
  const response = await fetch(downloadUrl(url), { signal, credentials: 'omit' });
  if (!response.ok) throw new Error('The photograph could not be downloaded. Please try again.');
  const blob = await response.blob();
  if (!blob.size || !/^image\/(?:jpeg|png|webp)(?:;|$)/i.test(blob.type)) throw new Error('The download did not contain a photograph. Please try again.');
  const objectUrl = URL.createObjectURL(blob);
  clickDownload(objectUrl, filename);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export async function downloadGalleryArchive(url, filename, { signal } = {}) {
  const href = downloadUrl(url);
  // ZIPs can be several GB. Check the signed endpoint before handing streaming
  // to the browser, so the complete gallery never sits in mobile JS memory.
  const response = await fetch(href, { method: 'HEAD', signal, credentials: 'omit' });
  if (!response.ok || !/^application\/(?:zip|x-zip-compressed|octet-stream)(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('The gallery download could not be prepared. Please try again.');
  clickDownload(href, filename);
}
