const apiRoot = 'https://api.cloudflare.com/client/v4/';
const uidPattern = /^[a-f\d]{32}$/i;
function streamAccount() {
  const value = process.env.CLOUDFLARE_STREAM_ACCOUNT_ID || '';
  if (!/^[a-f\d]{32}$/i.test(value)) throw Object.assign(new Error('Video playback is not configured.'), { status: 503, code: 'VIDEO_NOT_CONFIGURED' });
  return value;
}

async function cloudflare(path, { method = 'GET', body, token = process.env.CLOUDFLARE_STREAM_API_TOKEN } = {}) {
  let response;
  try { response = await fetch(apiRoot + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(90_000) }); }
  catch { throw Object.assign(new Error('The video service could not be reached. Please try again.'), { status: 502, code: 'VIDEO_PROVIDER_NETWORK' }); }
  if (response.status === 404) throw Object.assign(new Error('Video not found.'), { status: 404 });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false || data.errors?.length) throw Object.assign(new Error('The video service could not complete this request.'), { status: response.status === 429 ? 429 : 502, code: 'VIDEO_PROVIDER_FAILED' });
  return data.result ?? data.data;
}

export async function deleteLegacyStreamVideo(uid) {
  if (!uid) return;
  if (!uidPattern.test(uid) || !process.env.CLOUDFLARE_STREAM_API_TOKEN) throw new Error('Legacy Stream cleanup needs its original credentials.');
  try { await cloudflare('accounts/' + streamAccount() + '/stream/' + uid, { method: 'DELETE' }); }
  catch (error) { if (error.status !== 404) throw error; }
}

export async function workersAI(model, input) {
  const account = process.env.CLOUDFLARE_AI_ACCOUNT_ID || '';
  if (!/^[a-f\d]{32}$/i.test(account) || !['@cf/meta/llama-3.2-11b-vision-instruct', '@cf/qwen/qwen3-30b-a3b-fp8', '@cf/openai/whisper-large-v3-turbo'].includes(model)) throw new Error('Video analysis is not configured.');
  return cloudflare('accounts/' + account + '/ai/run/' + model, { method: 'POST', token: process.env.CLOUDFLARE_AI_API_TOKEN, body: input });
}
