import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { motionPolicyViolations } from '../../client/scripts/verify-motion-policy.mjs';
import { VEYLO_MOTION_CONFIG } from '../../client/src/utils/motionPolicy.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Content Studio is maintained separately and excluded from this admin operations change.
const paths = ['src/main.jsx', 'src/pages/AdminDashboardPage.jsx', 'src/components/AdminShell.jsx', 'src/components/OperationsWorkspace.jsx', 'src/components/AdminMfaGate.jsx', 'src/components/AdminWorkspace.css'];
for (const path of paths) assert.deepEqual(motionPolicyViolations(await readFile(resolve(root, path), 'utf8')), [], path);
assert.deepEqual(VEYLO_MOTION_CONFIG, { reducedMotion: 'never' });
assert.ok((await readFile(resolve(root, 'src/main.jsx'), 'utf8')).includes('<MotionConfig {...VEYLO_MOTION_CONFIG}>'));
console.info('Admin operations motion policy verified.');
