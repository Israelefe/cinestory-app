import { configuration } from '../src/server/config.mjs';
import { initialiseStorage, contained } from '../src/server/storage.mjs';
import { run, tool, probe, assembleVoice, mixAudio, beatMap } from '../src/server/media.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
const config = configuration(); await initialiseStorage(config); await fs.mkdir(contained(config.data, 'jobs/audio-proof/audio'), { recursive: true });
const clips = {};
for (const section of ['hook', 'problem', 'demo', 'result', 'cta']) { const relative = 'jobs/audio-proof/audio/' + section + '.wav'; await run(tool('ffmpeg'), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1', contained(config.data, relative)]); clips[section] = { path: relative }; }
const job = { id: 'audio-proof', revision: 1 }, voice = await assembleVoice(config, job, clips, { hook: 3, problem: 5, demo: 5, result: 4, cta: 3 });
const track = { id: 'test-tone', path: 'jobs/audio-proof/audio/hook.wav' };
console.log('Voice:', (await probe(contained(config.data, voice.path))).duration);
console.log('Beat detector:', await beatMap(config, track));
const mix = await mixAudio(config, job, voice, track, [0, 3, 8, 13, 17]);
console.log('Normalized mix:', await probe(contained(config.data, mix.path)));
