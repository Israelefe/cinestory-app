import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../..', import.meta.url));
export const repo = path.dirname(root);
// Read only this application's optional environment file; never the product's.
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}
export function configuration(overrides = {}) {
  const data = path.resolve(overrides.data || process.env.STUDIO_DATA_DIR || path.join(root, 'data'));
  const port = Number(overrides.port ?? process.env.STUDIO_PORT ?? 5056);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose a local port between 1024 and 65535.');
  return { root, repo, data, port, host: '127.0.0.1', origin: `http://127.0.0.1:${port}`, ...overrides };
}
export const providerDefaults = Object.freeze({
  groq: { endpoint: 'https://api.groq.com/openai/v1', model: 'qwen/qwen3.8-27b', fallback: 'openai/gpt-oss-120b', reasoning: 'none', rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000 },
  modelRates: { 'qwen/qwen3.8-27b': { input: .8, output: 4, vision: true }, 'openai/gpt-oss-120b': { input: .15, output: .6, vision: false } },
  tts: { endpoint: 'https://api.deepgram.com/v2/speak', voice: '', encoding: 'linear16', sampleRate: 48000 },
  stt: { endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions', model: 'whisper-large-v3-turbo' },
  caps: { job: 1, day: 5 },
  render: { fps: 30, width: 1080, height: 1920, concurrency: 1 },
});
