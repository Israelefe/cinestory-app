import dotenv from 'dotenv';
import { checkMediaWorker } from '../src/services/cloudflareMedia.service.js';
dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });
try {
  const result = await checkMediaWorker();
  if (result.protocol !== 2 || !result.storage || !result.images || !result.authorization) throw new Error('Deploy the updated Cloudflare helper and check its R2, Images and API settings.');
  console.log('Cloudflare file service: connected.');
  console.log(result.narration ? 'Narration: configured.' : 'Narration: add DEEPGRAM_API_KEY to the Cloudflare helper.');
  if (!result.narration) process.exitCode = 1;
} catch (error) {
  console.error(error.status ? error.message : 'The Cloudflare file service could not be checked. Review the setup guide.');
  process.exitCode = 1;
}
