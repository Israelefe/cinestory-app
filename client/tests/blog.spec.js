import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const id = '0123456789abcdef01234567';
const article = { slug: 'deliver-wedding-photos', title: 'How to deliver wedding photographs to your clients', excerpt: 'A practical guide to sending finished photographs through a private link, with a message that makes sense.', bodyHtml: '<p>You have finished the edit. Your client is waiting to see their photographs.</p><h2 id="section-prepare">Prepare the photographs</h2><p>Check your exports and make sure the delivery contains the finished photographs you agreed to provide.</p><h2 id="section-message">Write a clear delivery message</h2><p>Explain how to open the link and where to find the downloads. <a href="/formats">Explore Veylo delivery formats</a>.</p>', toc: [{ id: 'section-prepare', text: 'Prepare the photographs', level: 2 }, { id: 'section-message', text: 'Write a clear delivery message', level: 2 }], seoTitle: 'How to deliver wedding photos to clients · Veylo', metaDescription: 'A practical guide for Nigerian photographers on preparing finished wedding photos, sending a private link and helping clients find their downloads.', readingMinutes: 4, publishedAt: '2026-10-14T10:00:00Z', updatedAt: '2026-10-14T10:00:00Z', cover: null, coverId: null, coverAlt: '', coverCredit: '', keyword: 'deliver wedding photos' };
const draft = () => { const { slug, publishedAt, updatedAt, cover, ...value } = article; return { ...value, markdown: '## Prepare the photographs\n\nCheck the exports.\n\n## Write a clear delivery message\n\nSend a [private link](/formats).' }; };
async function common(page) {
  await page.addInitScript(() => localStorage.setItem('veylo_cookie_preferences_v1', JSON.stringify({ version: 4, necessary: true, serviceAnalytics: true })));
  await page.route('**/api/v1/**', route => route.fulfill({ json: { success: true, user: null, data: {} } }));
}
async function mockPublic(page) {
  await common(page);
  await page.route('**/api/v1/blog/posts**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: { data: path.endsWith('/posts') ? { kind: 'index', posts: [article, { ...article, slug: 'birthday-portraits', title: 'A better way to send finished birthday portraits' }, { ...article, slug: 'studio-delivery-message', title: 'What to include in your studio’s delivery message' }], page: 1, pages: 1, total: 3 } : { kind: 'article', post: article, related: [] } } });
  });
}
async function noOverflow(page) { await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1); }
for (const width of [320, 390, 768, 834, 1024, 1440]) test(`public blog and article work at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await mockPublic(page);
  await page.goto('/blog'); await expect(page.locator('.vb-index-header h1')).toContainText('Good photographs.'); await noOverflow(page);
  await expect(page.locator('.vb-card')).toHaveCount(3);
  await page.locator('.vb-card h2 a').first().click();
  await expect(page.locator('.vb-article h1')).toHaveText(article.title);
  await expect(page).toHaveTitle(article.seoTitle);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://veylo.com.ng/blog/deliver-wedding-photos');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', article.metaDescription);
  await expect(page.locator('script[data-blog-schema]')).toHaveCount(2);
  await noOverflow(page);
  await page.getByRole('link', { name: 'Write a clear delivery message', exact: true }).click();
  await expect(page.locator('#section-message')).toBeInViewport();
  if ([320, 834, 1440].includes(width)) { await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await mkdir('../.visual-review/blog', { recursive: true }); await page.screenshot({ path: `../.visual-review/blog/article-${width}.png`, fullPage: true }); }
});
test('blog keeps animation and keyboard access when the browser requests reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1000 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await mockPublic(page);
  await page.goto('/blog/deliver-wedding-photos'); await expect(page.locator('.vb-article h1')).toBeVisible();
  await expect(page.locator('.vb-page').locator('..')).toHaveAttribute('style', /opacity/);
  await page.getByRole('link', { name: 'Prepare the photographs', exact: true }).focus();
  await expect(page.getByRole('link', { name: 'Prepare the photographs', exact: true })).toBeFocused();
  const outline = await page.getByRole('link', { name: 'Prepare the photographs', exact: true }).evaluate(el => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe('none');
});
test('missing public articles show an honest error and noindex metadata', async ({ page }) => {
  await common(page); await page.route('**/api/v1/blog/posts/missing', route => route.fulfill({ status: 404, json: { message: 'Article not found.' } }));
  await page.goto('/blog/missing'); await expect(page.getByRole('heading', { name: 'Page not found.' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
});
test('responsive cover photos retain their description and a stable share image', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 }); await common(page);
  const covered = { ...article, coverAlt: 'A finished studio portrait', coverCredit: 'Veylo demo photograph', cover: { src: '/veylo/web/demo-ada-1-960.webp', srcSet: '/veylo/web/demo-ada-1-480.webp 480w, /veylo/web/demo-ada-1-960.webp 960w, /veylo/web/demo-ada-1-1440.webp 1440w', og: '/api/v1/blog/media/demo/og', width: 960, height: 1200 } };
  await page.route('**/api/v1/blog/posts/**', route => route.fulfill({ json: { data: { kind: 'article', post: covered, related: [] } } }));
  await page.goto('/blog/deliver-wedding-photos');
  await expect(page.getByAltText('A finished studio portrait')).toBeVisible();
  await expect.poll(() => page.getByAltText('A finished studio portrait').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://veylo.com.ng/api/v1/blog/media/demo/og');
  await noOverflow(page);
});
async function mockAdmin(page, role = 'superadmin') {
  await page.addInitScript(() => localStorage.setItem('veylo_admin_token', 'offline-browser-test-token'));
  let post = { id, slug: 'deliver-wedding-photos', status: 'draft', draft: draft(), notes: '', revision: 1, publishedRevision: 0, hasUnpublishedChanges: true, checks: { errors: [], warnings: [] }, activeJobId: null };
  let exists = false, job = null, generationCount = 0; const requests = [];
  await page.route('**/api/v1/admin/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method();
    const input = req.postData() && !req.headers()['content-type']?.includes('multipart') ? req.postDataJSON() : null;
    requests.push({ path, method, input });
    let data = {};
    if (path.endsWith('/auth/me')) data = { admin: { id: 'editor', username: 'editor', name: 'Veylo editor', role, sections: ['overview', 'blog'], mfaRequired: false } };
    else if (path.endsWith('/blog/generations') && method === 'GET') data = { jobs: [] };
    else if (path.endsWith('/blog/posts') && method === 'GET') data = { posts: exists ? [{ ...post, title: post.draft.title }] : [], page: 1, pages: 1, activeJobs: [], aiConfigured: true };
    else if (path.endsWith('/blog/posts') && method === 'POST') { exists = true; data = { post }; }
    else if (path.endsWith(`/posts/${id}`) && method === 'GET') data = { post };
    else if (path.endsWith(`/posts/${id}`) && method === 'PATCH') {
      expect(input.draft.bodyHtml).toBeUndefined(); expect(input.draft.toc).toBeUndefined();
      post = { ...post, ...input, draft: { ...input.draft, bodyHtml: article.bodyHtml, toc: article.toc, readingMinutes: 4 }, revision: post.revision + 1 }; data = { post };
    } else if (path.endsWith('/blog/generations') && method === 'POST') {
      job = { id: `generation-${++generationCount}`, postId: input.postId || null, kind: input.kind, status: 'queued', active: true }; data = { job };
    } else if (/\/generations\/generation-\d+$/.test(path)) {
      job = { ...job, status: 'ready', active: false, topics: [{ title: article.title, keyword: article.keyword, angle: article.excerpt }] };
      if (job.kind === 'article') post = { ...post, draft: draft(), revision: post.revision + 1, activeJobId: null }; data = { job };
    } else if (path.endsWith('/publish')) { expect(input.reviewed).toBe(true); post = { ...post, status: 'published', publishedRevision: post.revision, hasUnpublishedChanges: false, firstPublishedAt: '2026-10-14T10:00:00Z' }; data = { post }; }
    else if (path.endsWith('/preview')) data = { bodyHtml: article.bodyHtml, toc: article.toc, readingMinutes: 4 };
    else if (path.endsWith('/unpublish')) { post = { ...post, status: 'draft' }; data = { post }; }
    else if (path.endsWith('/archive')) { post = { ...post, status: 'archived' }; data = { post }; }
    else if (path.endsWith('/restore')) { post = { ...post, status: 'draft' }; data = { post }; }
    return route.fulfill({ json: data });
  });
  return { requests, setExists: () => { exists = true; } };
}
test('admin can suggest a topic, generate, edit, preview, publish and unpublish', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); const { requests } = await mockAdmin(page);
  await page.goto('http://127.0.0.1:5184/?section=blog');
  await page.getByRole('button', { name: 'Suggest topics', exact: true }).click();
  await expect(page.locator('.bw-topics h3').first()).toHaveText(article.title);
  await page.getByRole('button', { name: 'Use this topic' }).click();
  await expect(page.getByLabel('Article title', { exact: true })).toHaveValue(article.title);
  await page.getByRole('button', { name: 'Write with AI' }).click();
  // Existing text is explicitly replaced only after confirmation.
  await page.getByRole('button', { name: 'Generate new draft', exact: true }).click();
  await expect(page.getByText('Your draft is ready.', { exact: false })).toBeVisible();
  await page.getByLabel('Article title', { exact: true }).fill('A practical guide to delivering finished wedding photos');
  await expect(page.getByRole('button', { name: 'Publish article', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('.bw-preview .vb-prose')).toContainText('Check your exports');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Publish article', exact: true }).click();
  await expect(page.getByRole('link', { name: 'View live' })).toBeVisible();
  expect(requests.filter(r => r.path.endsWith('/publish'))).toHaveLength(1);
  await page.getByRole('button', { name: 'Unpublish', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm unpublish', exact: true }).click();
  await expect(page.getByText('Article unpublished. Your draft is saved.', { exact: true })).toBeVisible();
});
for (const width of [320, 390, 768, 834, 1024, 1440]) test(`admin editor stays spacious at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 }); const fixture = await mockAdmin(page); fixture.setExists();
  await page.goto(`http://127.0.0.1:5184/?section=blog&post=${id}`);
  await expect(page.getByLabel('Article title', { exact: true })).toBeVisible(); await noOverflow(page);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('.bw-preview .vb-prose')).toBeVisible(); await noOverflow(page);
  if ([320, 834, 1440].includes(width)) { await mkdir('../.visual-review/blog', { recursive: true }); await page.screenshot({ path: `../.visual-review/blog/admin-${width}.png`, fullPage: true }); }
});
test('read-only administrators can inspect and preview but cannot edit or publish', async ({ page }) => {
  const fixture = await mockAdmin(page, 'read-only'); fixture.setExists();
  await page.goto(`http://127.0.0.1:5184/?section=blog&post=${id}`);
  await expect(page.getByLabel('Article title', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Publish article', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('.bw-preview .vb-prose')).toBeVisible();
});
