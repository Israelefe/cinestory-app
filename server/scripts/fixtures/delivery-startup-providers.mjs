// Loaded only by the production-startup test, never by the application.
import assert from 'node:assert/strict';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.api.ping = async () => ({ status: 'ok' });
globalThis.fetch = async (url, options) => {
  assert.match(String(url), /^https:\/\/test\.aliyuncs\.com\//, 'Startup tests must not contact real providers');
  if (!String(url).endsWith('/chat/completions')) return new Response('{}');
  const content = JSON.parse(options.body).messages[1].content;
  const output = Array.isArray(content)
    ? { photographs: JSON.parse(content[0].text).ids.map(id => ({ id, description: 'A person in a studio portrait.', group: 'Studio portraits', emphasis: 3 })) }
    : { title: 'Ada at 30', openingLine: '', closingLine: '', beats: [{ position: 0, text: 'Celebrating Ada and her 30th birthday.' }] };
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }));
};
