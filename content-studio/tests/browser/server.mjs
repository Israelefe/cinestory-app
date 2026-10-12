import { createStudio } from '../../src/server/app.mjs';
import { root } from '../../src/server/config.mjs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const studio = await createStudio({ port: 5059, worker: false, data: path.join(root, 'data/tests/browser-' + randomUUID()) }); await studio.listen();
for (const name of ['SIGINT', 'SIGTERM']) process.on(name, async () => { await studio.close(); process.exit(0); });
