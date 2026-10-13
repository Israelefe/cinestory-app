import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { browserOptions } from './capture.mjs';
import { readKnowledge } from './knowledge.mjs';
import { setting, setSetting } from './database.mjs';
import { atomicWrite, contained, hash } from './storage.mjs';
import { structured } from '../providers/groq.mjs';
import { checkClaimRefusals } from '../providers/claim-checks.mjs';
import { scriptSchema } from '../contracts/index.mjs';
import { validateScripts, scriptWordLimits, scriptLengthRules } from '../contracts/validators.mjs';
import { capturesFor } from './pipeline.mjs';
import { providerDefaults } from './config.mjs';

export async function crawlSite({ config, db, signal, progress = () => {} }) {
  const base = setting(db, 'publicSite', 'https://veylo.com.ng'), browser = await chromium.launch(await browserOptions()), pages = [];
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => { const url = new URL(route.request().url()); return ['GET', 'HEAD'].includes(route.request().method()) && url.protocol === 'https:' && url.origin === base ? route.continue() : route.abort(); });
    for (const route of ['/', '/product', '/formats', '/gridboard', '/photoswap', '/video-delivery', '/portfolio', '/client-experience']) {
      if (signal?.aborted) throw new Error('Cancelled.'); const page = await context.newPage();
      const response = await page.goto(base + route, { waitUntil: 'networkidle', timeout: 30000 });
      if (!response?.ok()) throw new Error('The public page could not be read: ' + route);
      const text = (await page.locator('main').first().innerText().catch(() => page.locator('body').innerText())).replace(/\n{3,}/g, '\n\n').slice(0, 30000);
      pages.push({ url: base + route, title: await page.title(), purpose: route, text, digest: hash(text), verifiedAt: new Date().toISOString() }); await page.close(); progress(pages.length / 8, 'Read ' + route);
    }
    const previous = setting(db, 'crawl', {}), digest = hash(pages.map(({ url, digest }) => ({ url, digest })));
    await atomicWrite(contained(config.data, 'knowledge/site-pages.json'), pages);
    setSetting(db, 'crawl', { state: 'complete', digest, changed: Boolean(previous.digest && previous.digest !== digest), pages: pages.map(({ url, title, digest }) => ({ url, title, digest })), verifiedAt: new Date().toISOString(), message: 'Clean page text saved locally. Product conflicts need owner review.' });
  } finally { await browser.close(); }
}
export async function calibrate({ config, db, signal, progress = () => {} }) {
  const knowledge = await readKnowledge(config, db), captures = await capturesFor(config, db), eligible = knowledge.features.filter(feature => feature.eligible && captures.filter(clip => clip.featureId === feature.id && clip.approved && !clip.stale).length >= 3);
  if (!eligible.length) throw new Error('Approve features and their captures before the ten-job calibration.');
  const banned = JSON.parse(await fs.readFile(path.join(config.root, 'knowledge/banned-phrases.json'), 'utf8')), model = setting(db, 'models', providerDefaults.groq).model;
  const results = [];
  for (let i = 0; i < 10; i++) {
    const feature = eligible[i % eligible.length], sample = { audience: ['wedding', 'event', 'portrait', 'studio', 'commercial'][i % 5], seconds: 32, focus: feature.id }, start = Date.now(), mode = i < 5 ? 'none' : 'default';
    try {
      const output = await structured({ config, db, stage: 'calibration', schema: scriptSchema, model, reasoning: mode, system: scriptLengthRules + ' Write three different Veylo script variants: pain, result, curiosity. Never invent claims or statistics. Hook8 words, problem12, demo39, result9, CTA7. Use approved CTA exactly. Target Nigerian photographers. Return JSON.', input: { sample, feature, wordLimits: scriptWordLimits(sample.seconds), facts: knowledge.facts.filter(fact => fact.id === 'feature:' + feature.id), ctas: knowledge.offer.ctas, captures: captures.filter(clip => clip.featureId === feature.id && clip.approved && !clip.stale).map(({ id, description }) => ({ id, description })), banned }, maxOutput: 2200, signal, validate: output => validateScripts(output, { knowledge, captures, seconds: 32, banned }) });
      results.push({ sample, mode, elapsedMs: Date.now() - start, passed: true, output, ownerScore: null });
    } catch (error) { results.push({ sample, mode, elapsedMs: Date.now() - start, passed: false, error: error.message, ownerScore: null }); }
    progress((i + 1) / 12, `Calibration ${i + 1} of 10 complete.`);
  }
  const attacks = await checkClaimRefusals({ config, db, stage: 'claim_regression', model, reasoning: model === providerDefaults.groq.fallback ? 'low' : 'none', signal, progress });
  const report = { model, knowledgeDigest: knowledge.digest, createdAt: new Date().toISOString(), results, regressions: attacks, automaticPasses: results.filter(result => result.passed).length, ownerReviewRequired: true };
  setSetting(db, 'calibration', report); await atomicWrite(contained(config.data, 'knowledge/calibration.json'), report);
}
