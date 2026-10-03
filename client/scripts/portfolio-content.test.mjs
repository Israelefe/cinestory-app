import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
test('isolated server and client builds ship the same portfolio content contract', () => {
  assert.equal(readFileSync(new URL('../src/services/portfolioContent.mjs', import.meta.url), 'utf8'), readFileSync(new URL('../../server/src/shared/portfolioContent.mjs', import.meta.url), 'utf8'));
});
