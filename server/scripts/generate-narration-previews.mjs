import dotenv from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NARRATION_VOICES } from '../src/constants/narrationVoices.js';
import { narrationVoicePreview } from '../src/services/narration.service.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
const folder = new URL('../../client/public/veylo/audio/voices/', import.meta.url);
await mkdir(folder, { recursive: true });
for (const voice of NARRATION_VOICES) {
  try {
    const audio = await narrationVoicePreview(voice.id);
    if (audio.length < 1024 || !(audio.toString('ascii', 0, 3) === 'ID3' || audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0)) throw Object.assign(new Error('The sample is not MP3 audio.'), { code: 'INVALID_VOICE_SAMPLE' });
    await writeFile(new URL(voice.previewUrl.split('/').at(-1), folder), audio);
    console.log(JSON.stringify({ voice: voice.name, bytes: audio.length, saved: true }));
  } catch (error) {
    console.error(JSON.stringify({ voice: voice.name, code: error.code || 'VOICE_SAMPLE_FAILED' }));
    process.exitCode = 1;
  }
}
