import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DEMO_PRESETS } from '../../client/src/constants/demoStories.js';
import { photoStoryDemoDelivery } from '../../client/src/utils/photoStoryDemo.js';
import { NARRATION_BOOKEND_RENDER_VERSION, narrationLine } from '../src/services/narration.service.js';

test('all four demos have complete Hannah clips matching their visible messages and render settings', async () => {
  assert.equal(DEMO_PRESETS.length, 4);
  for (const preset of DEMO_PRESETS) {
    const delivery = photoStoryDemoDelivery(preset);
    const { narration } = delivery;
    assert.equal(delivery.v3.narrationChoice, 'voice');
    assert.equal(narration.voiceId, 'flux-hannah-en');
    assert.equal(narration.renderVersion, NARRATION_BOOKEND_RENDER_VERSION);
    assert.equal(narration.captions, undefined);
    for (const key of ['opening', 'closing']) {
      const clip = narration[key];
      assert.equal(clip.text, delivery.creativeDirection[key + 'Line']);
      const hash = createHash('sha256').update(JSON.stringify([narration.voiceId, narration.renderVersion, narrationLine(clip.text)])).digest('hex').slice(0, 12);
      assert.equal(clip.url, `/veylo/audio/demo-bookends/${preset.id}-${key}-${hash}.mp3`);
      const audio = await readFile(new URL('../../client/public' + clip.url, import.meta.url));
      assert.equal(audio.length, clip.bytes);
      assert.ok(audio.length >= 1024);
      assert.ok(audio.toString('ascii', 0, 3) === 'ID3' || audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0);
    }
  }
});

test('editing a demo message or using an unknown preset cannot play a stale recording', () => {
  const preset = structuredClone(DEMO_PRESETS[0]);
  preset.opening.copy = 'These are your finished studio portraits.';
  assert.equal(photoStoryDemoDelivery(preset).narration, undefined);
  assert.equal(photoStoryDemoDelivery(preset).v3.narrationChoice, 'skip');
  preset.id = 'unknown';
  assert.equal(photoStoryDemoDelivery(preset).narration, undefined);
});
