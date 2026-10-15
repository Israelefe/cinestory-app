# Veylo blog

The blog is available at `/blog`. In the admin, choose **Blog** (`/?section=blog`). Superadmins and operations administrators can write and publish; read-only administrators can inspect articles and previews.

## Writing and publication

1. Enter a topic and choose **Generate article**, or choose **Suggest topics** to get different angles on that subject. Leave the topic empty for suggestions drawn from Veylo's current features and existing articles.
2. **Write this article** on a suggestion immediately starts the draft. No separate draft creation or generation click is required. SEO fields and a cover designed from a real Veylo demo photo are prepared with the article. **New article** remains available for manual writing; **Write with AI** can generate from its title, target search phrase and notes. **Rewrite article** replaces an existing article's title, excerpt, body, SEO fields and cover design in one click. Rewrites use the saved draft as context, correct it against current product knowledge, and retain the chosen source photograph. A published article keeps its existing URL and live content until the reviewed rewrite is explicitly published with **Publish update**.
3. Read and edit the article. Use Markdown headings, lists, bold text and links. Preview the result and check the search appearance.
4. Keep the cover, choose a photograph from Veylo's public demo collection, or upload a photo you have permission to publish. Code crops the photograph and adds the article title, Veylo colours and typography. **Update cover design** uses the current title and retains the selected photograph. Accepted uploads are still JPEG, PNG or WebP, at most 5 MB and at least 480 × 320 pixels. Describe the visible photograph in the alt text and add a credit when appropriate.
5. Save the draft, review the facts and photo permissions, then publish. Saving edits to a published article does not change the live article; choose **Publish update** when ready.

The URL can be edited before first publication and is then fixed to preserve shared links. **Unpublish** removes an article from the public blog. **Archive** also locks editing until **Restore as draft** is chosen. Neither action deletes the article.

Concurrent saves return a conflict instead of overwriting another editor. Keep your unsaved text if a conflict occurs, reload the current draft, and apply the changes again.

## AI and storage

No additional provider account is required. Articles, topic suggestions and duplicate checks use Qwen through the existing server-side providers: `GROQ_BLOG_MODEL=qwen/qwen3.8-27b`, with `ALIBABA_BLOG_MODEL=qwen-plus` as the configured fallback. These blog settings are independent of the model used for delivery captions and assistant replies. If neither provider is configured, manual writing and publishing remain available. Generation uses the existing shared model scheduler and budget controls; it is not charged to a photographer's delivery allowance.

Articles use the same maintained product knowledge as Veylo's assistant, with plan limits, enabled formats and feature availability refreshed from runtime settings for each job. Admin notes guide the chosen angle. The feature does not search the web or measure keyword volume. Suggestions and drafts still need editorial review. Do not publish invented statistics, testimonials, sources or unsupported product claims.

Every generated article receives a separate Qwen product-fact check against that knowledge before it can replace the saved draft. Unsupported claims trigger one full correction pass and a second check. Remaining claims or an incomplete check stop generation safely. The prompts explicitly distinguish Photo Swap's finished-photo stack from editing and approval workflows, and GridBoard from Photo Library preselection. This is model-assisted checking, not proof that every statement is correct; the administrator still reviews the facts and permissions before publication.

Topic checks scan the full published catalogue, including older articles. Equivalent titles are rejected locally. A model compares each proposed question against the ten most relevant published summaries retrieved from that complete catalogue, including headings and excerpts, to catch differently worded repeats. Suggestions also check against each other. Sharing a broad keyword or feature is allowed when the practical question differs. The writer checks again after generation against refreshed publication state. Duplicate warnings link to the existing article so an administrator can update it. Updating that same article excludes its own published snapshot from the comparison. An incomplete topic check stops generation safely; it does not overwrite the saved draft. Semantic matching can still miss overlap, so review remains necessary.

The API process starts the MongoDB-backed blog worker. Queued jobs survive restarts. An interrupted running job becomes retryable after its lease expires (two minutes without a heartbeat). Cancelling does not change the published article. One active generation is allowed per administrator; article edits are locked while that article is being generated. The workspace restores recent topic suggestions after reopening.

Uploaded cover photos use the existing private R2 configuration. The source upload is stored unchanged and privately so a new title treatment can reuse the photograph without repeatedly cropping a previous cover. Original files are never exposed by the blog media endpoints. Designed versions are re-encoded without embedded metadata into 480, 960 and 1440 pixel WebP images and a 1200 × 630 share image. Code-designed covers from public demo photographs store their source ID and title and render through the same protected media endpoints. The allowlist in `server/src/constants/blogCoverPhotos.js` contains only existing public Veylo demo assets; the renderer uses local assets when packaged with the API, otherwise a fixed Veylo host. Arbitrary remote URLs and private client galleries cannot be selected. There is no AI image generation call or image provider account required.

Only published cover references are served publicly. Admin previews require an authenticated request. Previously published photos may remain in browser caches for up to five minutes after unpublishing. Uploading or generating a cover does not publish it; save the draft and explicitly publish the article when ready.

MongoDB collections `blogposts`, `bloggenerationjobs` and `blogassets` are created automatically. Startup creates the unique article URL and active-job indexes. No existing content migration is needed. Blog actions appear in the existing immutable admin audit log.

## SEO and deployment

Deploy the API, admin build and client worker together. The client worker configuration now routes `/blog`, `/blog/*` and `/blog-sitemap*.xml` before the SPA asset fallback. Keep the existing `VEYLO_API_ORIGIN`, `VEYLO_WEB_ORIGIN` and edge client-IP configuration. Deploying only the client JavaScript will not enable server-rendered articles.

Published pages return visible article text, canonical metadata, social previews, `BlogPosting` and breadcrumb structured data before JavaScript runs. React then displays the same published snapshot. Missing, unpublished and archived articles return HTTP 404; backend outages return HTTP 503 with `Retry-After`. Public HTML is revalidated instead of serving stale publication data. Cover URLs are stable, and `robots.txt` allows crawlers to retrieve the published cover images.

Submit `https://veylo.com.ng/blog-sitemap.xml` in Google Search Console after deployment. The index points to paginated sitemap files and includes only published articles. Use URL Inspection on the first published article to check the rendered content and canonical. Validate its structured data with Google's Rich Results Test and inspect mobile performance with PageSpeed Insights. Track indexing, impressions, clicks and search queries in Search Console. These tools require the site's verified account; the feature does not connect to or submit through that account automatically.

SEO checks flag missing required fields and offer guidance on heading structure, descriptions and internal links. They do not estimate a ranking score or guarantee search positions. Publication dates remain stable, and modification dates change when an updated revision is published.

## Verification

From `server`: `npm run verify:blog`, `npm run verify:syntax`, and `npm run verify:model-scheduling`.

From `client`: `npm run build`, `npm run verify:share-meta`, and `npx playwright test --config playwright.blog.config.js`. The browser suite also starts the admin development server and covers the full editing workflow, read-only access, keyboard focus, reduced-motion emulation and widths 320, 390, 768, 834, 1024 and 1440.

From `admin`: `npm run build`. Both builds retain the required motion-policy verification.

The dependency audit during implementation found no advisories for the new Markdown renderer or sanitizer. It reported an existing high-severity `braces` advisory through the development-only `chokidar`/`nodemon` chain; no forced dependency downgrade was applied.
