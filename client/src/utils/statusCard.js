function blendHex(first, second, share) {
  const source = /^#[0-9a-f]{6}$/i.test(first || '') ? first : '#111115';
  return '#' + [1, 3, 5].map(index => Math.round(parseInt(source.slice(index, index + 2), 16) * (1 - share) + parseInt(second.slice(index, index + 2), 16) * share).toString(16).padStart(2, '0')).join('');
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    const timer = window.setTimeout(() => { image.src = ''; reject(new Error('A photograph took too long to load. Please retry.')); }, 120000);
    image.crossOrigin = 'anonymous';
    image.onload = () => { window.clearTimeout(timer); resolve(image); };
    image.onerror = () => { window.clearTimeout(timer); reject(new Error('A photograph could not be loaded. Please retry.')); };
    image.src = url;
  });
}

export async function renderStatusCard(data) {
  if (!Array.isArray(data.photos) || data.photos.length < 1 || data.photos.length > 4) throw new Error('Choose one to four photographs.');
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1920;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This device could not prepare the Status card.');
  const accent = blendHex(data.palette?.accent, '#ffffff', .38);
  const brand = String(data.studioName || 'Veylo').slice(0, 38).toUpperCase();
  const [photos, qr] = await Promise.all([Promise.all(data.photos.map(loadImage)), loadImage(data.qrDataUrl)]);
  context.fillStyle = blendHex(data.palette?.background, '#08090b', .72); context.fillRect(0, 0, 1080, 1920);
  context.fillStyle = accent; context.fillRect(0, 0, 1080, 14);
  context.font = '700 24px Arial'; context.letterSpacing = '4px'; context.fillText(`PHOTOGRAPHED BY ${brand}`, 72, 94, 936);
  context.fillStyle = '#fffaf5'; context.font = '57px Georgia'; context.letterSpacing = '0'; context.fillText('The gallery is ready.', 72, 176, 936);
  const lines = [''];
  for (const word of String(data.title || 'Your photographs').split(/\s+/).filter(Boolean)) {
    const next = lines.at(-1) ? `${lines.at(-1)} ${word}` : word;
    if (next.length <= 34 || !lines.at(-1)) lines[lines.length - 1] = next;
    else if (lines.length < 2) lines.push(word);
    else { lines[1] = lines[1].slice(0, 30).trimEnd() + '…'; break; }
  }
  context.fillStyle = '#e7dfd8'; context.font = '31px Arial';
  lines.forEach((line, index) => context.fillText(line.slice(0, 35), 72, 245 + index * 39, 936));
  context.fillStyle = '#c7bfb8'; context.font = '21px Arial'; context.letterSpacing = '3px'; context.fillText(`${data.gallerySize} FINISHED PHOTOGRAPHS`, 72, 323, 936);
  const left = 72, top = 348, width = 936, height = 1170, gap = 18, half = (width - gap) / 2;
  const cells = photos.length === 1 ? [{ x: left, y: top, w: width, h: height }]
    : photos.length === 2 ? [{ x: left, y: top, w: width, h: 690 }, { x: left, y: top + 708, w: width, h: height - 708 }]
    : photos.length === 3 ? [{ x: left, y: top, w: width, h: 680 }, { x: left, y: top + 698, w: half, h: height - 698 }, { x: left + half + gap, y: top + 698, w: half, h: height - 698 }]
    : photos.map((_, index) => ({ x: left + index % 2 * (half + gap), y: top + Math.floor(index / 2) * 658, w: half, h: index < 2 ? 640 : height - 658 }));
  photos.forEach((image, index) => {
    const cell = cells[index];
    const scale = Math.max(cell.w / image.width, cell.h / image.height);
    const sourceWidth = cell.w / scale, sourceHeight = cell.h / scale;
    context.drawImage(image, (image.width - sourceWidth) / 2, (image.height - sourceHeight) / 2, sourceWidth, sourceHeight, cell.x, cell.y, cell.w, cell.h);
  });
  context.globalAlpha = .7; context.fillStyle = accent; context.fillRect(72, 1572, 936, 2); context.globalAlpha = 1;
  context.fillStyle = '#fffaf5'; context.font = '46px Georgia'; context.letterSpacing = '0'; context.fillText('See the full gallery.', 72, 1664, 710);
  context.fillStyle = '#c7bfb8'; context.font = '26px Arial'; context.fillText('Scan the code to open the private link.', 72, 1720, 710);
  context.fillStyle = accent; context.font = '700 21px Arial'; context.letterSpacing = '3px'; context.fillText(brand, 72, 1829, 936);
  context.fillStyle = '#a79f99'; context.font = '19px Arial'; context.letterSpacing = '0'; context.fillText('Finished photographs, delivered on Veylo', 72, 1871, 936);
  context.drawImage(qr, 802, 1623, 206, 206);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The Status card could not be prepared.')), 'image/png'));
}
