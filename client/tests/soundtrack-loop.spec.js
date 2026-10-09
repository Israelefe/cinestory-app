import { expect, test } from '@playwright/test';

function toneWav() {
  const rate = 8000, samples = rate * 4;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1) wav.writeInt16LE(Math.round(Math.sin(index * 2 * Math.PI * 220 / rate) * 8000), 44 + index * 2);
  return wav;
}

for (const webAudio of [true, false]) test(`soundtrack loops overlap and respect playback controls with ${webAudio ? 'Web Audio' : 'native audio'}`, async ({ page }) => {
  await page.addInitScript(enabled => {
    if (!enabled) { window.AudioContext = undefined; window.webkitAudioContext = undefined; return; }
    const createGain = AudioContext.prototype.createGain;
    window.__loopGains = [];
    AudioContext.prototype.createGain = function (...args) { const gain = createGain.apply(this, args); window.__loopGains.push(gain); window.__loopContext = this; return gain; };
  }, webAudio);
  await page.route('**/test-loop.wav', route => route.fulfill({ contentType: 'audio/wav', body: toneWav() }));
  await page.goto('/demo/gridboard?phoneView=1');
  await page.evaluate(async () => {
    const { attachSmoothSoundtrackLoop } = await import('/src/utils/smoothSoundtrackLoop.js');
    const NativeAudio = window.Audio;
    window.Audio = function (...args) { const audio = new NativeAudio(...args); window.__incoming = audio; return audio; };
    const player = document.createElement('audio');
    player.src = '/test-loop.wav'; player.loop = true; player.volume = .8;
    document.body.appendChild(player);
    window.__player = player;
    window.__disposeLoop = attachSmoothSoundtrackLoop(player);
    window.Audio = NativeAudio;
    await player.play();
    player.currentTime = 3.15;
  });
  await expect.poll(() => page.evaluate(() => {
    const nativeVolume = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
    const incoming = window.__loopGains?.length === 2 ? window.__loopGains[1].gain.value : window.__incoming.volume;
    const outgoing = window.__loopGains?.length === 2 ? window.__loopGains[0].gain.value : nativeVolume.get.call(window.__player);
    return !window.__incoming.paused && incoming > .05 && outgoing < .75;
  })).toBe(true);
  await page.evaluate(() => { window.__player.volume = .16; window.__player.pause(); });
  expect(await page.evaluate(() => window.__incoming.paused)).toBe(true);
  expect(await page.evaluate(() => window.__player.volume)).toBe(.16);
  await expect.poll(() => page.evaluate(() => window.__loopGains?.length === 2 ? window.__loopGains.reduce((sum, node) => sum + node.gain.value, 0) : Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume').get.call(window.__player) + window.__incoming.volume)).toBeCloseTo(.16, 4);
  if (webAudio) await page.evaluate(() => window.__loopContext.suspend());
  await page.evaluate(() => window.__player.play());
  if (webAudio) await expect.poll(() => page.evaluate(() => window.__loopContext.state)).toBe('running');
  await expect.poll(() => page.evaluate(() => !window.__player.paused && window.__player.currentTime < 2), { timeout: 6000 }).toBe(true);
  await page.evaluate(() => { window.__player.muted = true; });
  await expect.poll(() => page.evaluate(() => window.__incoming.muted)).toBe(true);
  await page.evaluate(() => { window.__disposeLoop(); window.__player.pause(); });
  expect(await page.evaluate(() => window.__incoming.paused && !window.__incoming.getAttribute('src') && window.__player.loop && !Object.hasOwn(window.__player, 'volume'))).toBe(true);
});

test('every music format uses the shared loop player in its demo', async ({ page }) => {
  for (const route of ['/demo', '/demo/reveal', '/demo/album', '/demo/gridboard']) {
    await page.goto(`${route}?phoneView=1`);
    await expect.poll(() => page.locator('audio').evaluateAll(players => players.some(player => Object.hasOwn(player, 'volume') && !player.loop))).toBe(true);
  }
});
