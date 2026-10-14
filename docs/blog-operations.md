# Veylo blog

The blog is available at `/blog`. In the admin, choose **Blog** (`/?section=blog`). Superadmins and operations administrators can write and publish; read-only administrators can inspect articles and previews.

## Writing and publication

1. Choose **Suggest topics**, select an idea, or choose **New article** and enter your own title.
2. Add a target search phrase and notes with useful facts or examples. **Write with AI** creates a complete draft with SEO fields. Generating again asks before replacing the saved draft text.
3. Read and edit the article. Use Markdown headings, lists, bold text and links. Preview the result and check the search appearance.
4. Upload a cover photo you have permission to publish. Accepted files are still JPEG, PNG or WebP, at most 5 MB and at least 480 × 320 pixels. Add descriptive alt text and an optional photo credit.
5. Save the draft, review the facts and photo permissions, then publish. Saving edits to a published article does not change the live article; choose **Publish update** when ready.

The URL can be edited before first publication and is then fixed to preserve shared links. **Unpublish** removes an article from the public blog. **Archive** also locks editing until **Restore as draft** is chosen. Neither action deletes the article.

Concurrent saves return a conflict instead of overwriting another editor. Keep your unsaved text if a conflict occurs, reload the current draft, and apply the changes again.

## AI and storage

No additional provider account is required. Writing uses the existing server-side Groq text configuration, with Alibaba Model Studio as the configured fallback. If neither is configured, manual writing and publishing remain available. Generation uses the existing shared model scheduler and budget controls; it is not charged to a photographer's delivery allowance.

Articles use verified final-delivery facts, current plan configuration and admin notes. The feature does not search the web or measure keyword volume. Suggestions and drafts still need editorial review. Do not publish invented statistics, testimonials, sources or unsupported product claims.

The API process starts the MongoDB-backed blog worker. Queued jobs survive restarts. An interrupted running job becomes retryable after its lease expires (two minutes without a heartbeat). Cancelling does not change the published article. One active generation is allowed per administrator; article edits are locked while that article is being generated. The workspace restores recent topic suggestions after reopening.

Cover photos use the existing private R2 configuration. Only the blog's published cover references are served publicly. Admin previews require an authenticated request. Uploaded images are decoded and re-encoded without embedded metadata into 480, 960 and 1440 pixel WebP versions and a 1200 × 630 share image. Client delivery media cannot be selected through the blog upload API. Previously published photos may remain in browser caches for up to five minutes after unpublishing.

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
