import sharp from 'sharp';
import QRCode from 'qrcode';

const WIDTH = 1080;
const HEIGHT = 1920;
const LEFT = 72;
const PHOTO_TOP = 348;
const PHOTO_HEIGHT = 1170;
const PHOTO_WIDTH = WIDTH - LEFT * 2;
const GAP = 18;

function safeHex(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
}

function blendHex(first, second, secondShare) {
  const a = safeHex(first, '#17171b');
  const b = safeHex(second, '#08090b');
  return '#' + [1, 3, 5].map(index => {
    const value = Math.round(parseInt(a.slice(index, index + 2), 16) * (1 - secondShare) + parseInt(b.slice(index, index + 2), 16) * secondShare);
    return value.toString(16).padStart(2, '0');
  }).join('');
}

function xmlText(value) {
  return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

function titleLines(value) {
  const words = String(value || 'Your photographs').trim().split(/\s+/).filter(Boolean);
  const lines = [''];
  for (const word of words) {
    const next = lines.at(-1) ? `${lines.at(-1)} ${word}` : word;
    if (next.length <= 34 || !lines.at(-1)) lines[lines.length - 1] = next;
    else if (lines.length < 2) lines.push(word);
    else { lines[1] = `${lines[1].slice(0, 30).trimEnd()}…`; break; }
  }
  return lines.map(line => line.length > 35 ? `${line.slice(0, 32).trimEnd()}…` : line);
}

function photoCells(count) {
  if (count === 1) return [{ x: LEFT, y: PHOTO_TOP, width: PHOTO_WIDTH, height: PHOTO_HEIGHT }];
  if (count === 2) return [
    { x: LEFT, y: PHOTO_TOP, width: PHOTO_WIDTH, height: 690 },
    { x: LEFT, y: PHOTO_TOP + 690 + GAP, width: PHOTO_WIDTH, height: PHOTO_HEIGHT - 690 - GAP }
  ];
  if (count === 3) return [
    { x: LEFT, y: PHOTO_TOP, width: PHOTO_WIDTH, height: 680 },
    { x: LEFT, y: PHOTO_TOP + 680 + GAP, width: Math.floor((PHOTO_WIDTH - GAP) / 2), height: PHOTO_HEIGHT - 680 - GAP },
    { x: LEFT + Math.ceil((PHOTO_WIDTH + GAP) / 2), y: PHOTO_TOP + 680 + GAP, width: Math.floor((PHOTO_WIDTH - GAP) / 2), height: PHOTO_HEIGHT - 680 - GAP }
  ];
  const cellWidth = Math.floor((PHOTO_WIDTH - GAP) / 2);
  const topHeight = 640;
  const bottomHeight = PHOTO_HEIGHT - topHeight - GAP;
  return [
    { x: LEFT, y: PHOTO_TOP, width: cellWidth, height: topHeight },
    { x: LEFT + cellWidth + GAP, y: PHOTO_TOP, width: cellWidth, height: topHeight },
    { x: LEFT, y: PHOTO_TOP + topHeight + GAP, width: cellWidth, height: bottomHeight },
    { x: LEFT + cellWidth + GAP, y: PHOTO_TOP + topHeight + GAP, width: cellWidth, height: bottomHeight }
  ];
}

export async function renderGridboardStatusCard({ imageBuffers, title, studioName, gallerySize, privateUrl, palette = {} }) {
  if (!Array.isArray(imageBuffers) || imageBuffers.length < 1 || imageBuffers.length > 4) throw new Error('Choose one to four photographs.');
  const background = blendHex(palette.background, '#08090b', .72);
  const surface = blendHex(palette.surface, '#151519', .72);
  const accent = blendHex(palette.accent, '#ffffff', .38);
  const heading = titleLines(title);
  const brand = xmlText(String(studioName || 'Veylo').slice(0, 38).toUpperCase());
  const cells = photoCells(imageBuffers.length);
  const photos = await Promise.all(imageBuffers.map((input, index) => sharp(input).rotate().resize(cells[index].width, cells[index].height, { fit: 'cover', position: 'attention' }).jpeg({ quality: 88, mozjpeg: true }).toBuffer()));
  const qr = await QRCode.toBuffer(privateUrl, { type: 'png', width: 206, margin: 2, color: { dark: '#111115', light: '#ffffff' }, errorCorrectionLevel: 'M' });
  const backgroundSvg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${background}"/><rect x="0" y="0" width="100%" height="14" fill="${accent}"/><rect x="${LEFT}" y="${PHOTO_TOP}" width="${PHOTO_WIDTH}" height="${PHOTO_HEIGHT}" fill="${surface}"/></svg>`);
  const overlaySvg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><text x="${LEFT}" y="94" fill="${accent}" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="4">PHOTOGRAPHED BY ${brand}</text><text x="${LEFT}" y="176" fill="#fffaf5" font-family="Georgia, serif" font-size="57">The gallery is ready.</text><text x="${LEFT}" y="245" fill="#e7dfd8" font-family="Arial, sans-serif" font-size="31" font-weight="500">${xmlText(heading[0])}</text>${heading[1] ? `<text x="${LEFT}" y="284" fill="#e7dfd8" font-family="Arial, sans-serif" font-size="31" font-weight="500">${xmlText(heading[1])}</text>` : ''}<text x="${LEFT}" y="323" fill="#c7bfb8" font-family="Arial, sans-serif" font-size="21" letter-spacing="3">${Math.max(1, Number(gallerySize) || imageBuffers.length)} FINISHED PHOTOGRAPHS</text><rect x="${LEFT}" y="1572" width="${PHOTO_WIDTH}" height="2" fill="${accent}" opacity=".7"/><text x="${LEFT}" y="1664" fill="#fffaf5" font-family="Georgia, serif" font-size="46">See the full gallery.</text><text x="${LEFT}" y="1720" fill="#c7bfb8" font-family="Arial, sans-serif" font-size="26">Scan the code to open the private link.</text><text x="${LEFT}" y="1829" fill="${accent}" font-family="Arial, sans-serif" font-size="21" font-weight="700" letter-spacing="3">${brand}</text><text x="${LEFT}" y="1871" fill="#a79f99" font-family="Arial, sans-serif" font-size="19">Finished photographs, delivered on Veylo</text></svg>`);
  return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background } })
    .composite([
      { input: backgroundSvg },
      ...photos.map((input, index) => ({ input, left: cells[index].x, top: cells[index].y })),
      { input: overlaySvg },
      { input: qr, left: 802, top: 1623 }
    ]).png({ compressionLevel: 8 }).toBuffer();
}
