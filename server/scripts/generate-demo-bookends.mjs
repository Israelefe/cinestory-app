import dotenv from 'dotenv';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DEMO_PRESETS } from '../../client/src/constants/demoStories.js';
import { narrationVoice } from '../src/constants/narrationVoices.js';
import { NARRATION_BOOKEND_RENDER_VERSION, narrationLine, synthesizeBookendAudio } from '../src/services/narration.service.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const voice = narrationVoice('flux-hannah-en');
const folder = new URL('../../client/public/veylo/audio/demo-bookends/', import.meta.url);
const manifestFile = new URL('../../client/src/constants/demoNarration.json', import.meta.url);
const mp3 = buffer => buffer.length >= 1024 && (buffer.toString('ascii', 0, 3) === 'ID3' || buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
const manifest = {};
await mkdir(folder, { recursive: true });

try {
  for (const preset of DEMO_PRESETS) {
    if (!/^[a-z0-9-]+$/.test(preset.id)) throw new Error('Invalid demo identifier.');
    const entry = { voiceId: voice.id, voiceName: voice.name, renderVersion: NARRATION_BOOKEND_RENDER_VERSION };
    for (const [key, original] of [['opening', preset.opening?.copy || preset.storySummary], ['closing', preset.finale?.copy]]) {
      const text = narrationLine(original);
      const hash = createHash('sha256').update(JSON.stringify([voice.id, NARRATION_BOOKEND_RENDER_VERSION, text])).digest('hex').slice(0, 12);
      const name = `${preset.id}-${key}-${hash}.mp3`;
      const file = new URL(name, folder);
      let buffer = await readFile(file).catch(() => null);
      if (!buffer || !mp3(buffer)) {
        buffer = await synthesizeBookendAudio(text, { voiceId: voice.id });
        if (!mp3(buffer)) throw Object.assign(new Error('The demo clip is not MP3 audio.'), { code: 'INVALID_DEMO_AUDIO' });
        await writeFile(file, buffer);
      }
      entry[key] = { url: `/veylo/audio/demo-bookends/${name}`, text: original, bytes: buffer.length };
      console.log(JSON.stringify({ demo: preset.id, part: key, voice: voice.name, bytes: buffer.length, saved: true }));
    }
    manifest[preset.id] = entry;
  }
  // Publish metadata only when every demo has both valid clips.
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
} catch (error) {
  console.error(JSON.stringify({ code: error.code || 'DEMO_NARRATION_FAILED', type: error.name, cause: error.cause?.code }));
  process.exitCode = 1;
}
