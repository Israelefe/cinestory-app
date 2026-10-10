import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../../server/package.json', import.meta.url));
const sharp = require('sharp');

const root = fileURLToPath(new URL('../..', import.meta.url));
const binary = process.env.FFMPEG_PATH || (process.platform === 'win32' ? path.join(root, 'server/node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe') : 'ffmpeg');
const output = path.join(root, 'client/public/veylo/video');
await mkdir(output, { recursive: true });
const samples = [['light-study', 960, 540, 10], ['portrait-study', 540, 960, 8]];
const details = [];
for (const [name, width, height, seconds] of samples) {
  // Original motion graphics, generated from mathematical light fields.
  // These are explicitly labelled animations, never represented as client footage.
  const destination = path.join(output, name + '.mp4');
  const pcm = Buffer.alloc(seconds * 44100 * 2 + 44); const payload = pcm.length - 44;
  pcm.write('RIFF', 0); pcm.writeUInt32LE(payload + 36, 4); pcm.write('WAVEfmt ', 8); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(44100, 24); pcm.writeUInt32LE(88200, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(payload, 40);
  for (let index = 0; index < seconds * 44100; index++) { const time = index / 44100; const fade = Math.min(1, time, seconds - time); pcm.writeInt16LE(Math.round(Math.sin(time * 220 * Math.PI * 2) * 500 * fade), 44 + index * 2); }
  const audio = path.join(output, name + '.wav'); await writeFile(audio, pcm);
  const encoder = spawn(binary, ['-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-vcodec', 'png', '-framerate', '24', '-i', 'pipe:0', '-i', audio, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '25', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', '-shortest', '-y', destination], { shell: false, windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  let errors = ''; encoder.stderr.on('data', chunk => { errors += chunk; });
  const completed = new Promise((resolve, reject) => { encoder.once('error', reject); encoder.once('close', code => code ? reject(new Error(errors)) : resolve()); });
  for (let frame = 0; frame < seconds * 24; frame++) {
    const t = frame / 24; const rgb = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const glow = Math.exp(-Math.pow((x / width - .38 - .16 * Math.sin(t * .55)) / .16, 2)) * Math.exp(-Math.pow((y / height - .46 - .15 * Math.cos(t * .4)) / .55, 2));
      const ribbon = Math.exp(-Math.pow((x / width + y / height * .4 - .9 - .12 * Math.sin(t * .5)) / .08, 2));
      const at = (y * width + x) * 3; rgb[at] = 8 + 116 * glow + 62 * ribbon; rgb[at + 1] = 7 + 38 * glow + 22 * ribbon; rgb[at + 2] = 11 + 26 * glow + 26 * ribbon;
    }
    const image = sharp(rgb, { raw: { width, height, channels: 3 } });
    if (frame === 24) await image.clone().webp({ quality: 85 }).toFile(path.join(output, name + '.webp'));
    if (!encoder.stdin.write(await image.png().toBuffer())) await once(encoder.stdin, 'drain');
  }
  encoder.stdin.end(); await completed;
  const { unlink } = await import('node:fs/promises'); await unlink(audio);
  details.push({ name, width, height, duration: seconds, bytes: (await stat(destination)).size });
}
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(details, null, 2) + '\n');
console.log('Created original landscape and portrait playback samples.');
