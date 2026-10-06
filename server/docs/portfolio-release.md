# Portfolio creation, publishing and client viewing

The editor saves a private draft after a short pause. Publishing first finishes
pending saves, then checks that exact revision. A second tab cannot overwrite a
newer revision silently. The photographer can reload the saved version or
explicitly replace it with the version they have reviewed. Browser recovery is
kept in session storage for one day and cleared on logout.

The account studio name is the public name. A portfolio has at most 50 unique
photographs. Projects reference the same photo IDs, so using a photo in more
than one project does not consume another slot. At least four public photographs,
a bio and a valid cover are required to publish. New public photographs require
the photographer's permission confirmation. Source filenames remain picker
labels and do not become new public captions.

Public media requests check current account status, effective paid access,
publication state, photo membership and source ownership. The API prepares
private R2 variants at 400, 800 and 1600 pixels, plus a 1200×630 sharing image,
and streams them without exposing signed provider URLs. Responses
use `no-store` so making a portfolio private closes subsequent media requests.
A visitor who has already downloaded a photograph can retain that copy.

Deleting source photographs removes them from live and draft work and projects,
repairs covers and closes publication when fewer than four photographs remain.
A durable cleanup record survives process restarts. Archiving a delivery keeps
photos explicitly selected earlier. Account deletion and expired retention remove
portfolio jobs, handle claims and prepared-media records as well as portfolios.

Direction jobs hold an immutable draft snapshot and revision, with one active job
per portfolio. A worker heartbeat and lease protect against stale workers writing
after a retry or cancellation. Suggestions require review, never publish content,
and cannot be accepted after the input draft has changed. Analytics report visits,
visitors, project opens and contact clicks over 30 days; clicks are not bookings.

## Portfolio designs

The Design tab offers Editorial, Cinema, Gallery and Folio. Each has its own
opening, photograph arrangement and mobile composition. Cinema has one opening
photograph and category filmstrips. Every design keeps the main gallery first
unless the photographer chooses “Selected projects first” in Publishing. All designs share category
filters, project routes, the photograph viewer and contact links.

`direction.template` is validated on the server and stored in both the private
draft and published snapshot. Existing portfolios default to Editorial. No data
migration is needed for the design field. `direction.motion` accepts expressive,
subtle or still; browser reduced-motion preferences always take precedence and
are observed while the page is open. Filmstrip browsing is manual, without autoplay.

Previewing another design does not save it. Choosing a design applies its starting
colours, typography, spacing and motion to the private draft. The photographer can
adjust those settings before publishing. Project pages inherit the published
design, and saving a different design keeps the current public version unchanged.

Deploy the server with the new template and motion validation before the client.
An older server rejects the new design fields in draft saves.

## Categories and photograph placement

The Categories tab creates, renames and removes groups. Photographers can choose
group membership there, use the category selector in photograph/project details,
or assign selected photographs in bulk. Each photograph has one category; projects
have their own category labels. Removing a group resets its photo/project labels
to `Selected work` without deleting photographs or changing project photo IDs.

`categories` is an ordered string list in both the typed draft and live snapshot.
Empty groups remain in the editor but are hidden from public navigation. Labels
already stored on photographs/projects are folded into the list, so older
portfolios need no category migration. Validation rejects duplicate names ignoring
case/whitespace, non-text names, blank names, names longer than 50 characters, and
more than 100 groups. The category list uses the existing revision and explicit
publication checks. Deploy this API version before the category editor: the old
strict draft schema rejects `categories` in save requests.

The overview allocates photographs once across the opening, main gallery and
project cards. Projects whose covers are already on the page use text links
instead of repeated images. Category filters show their complete assigned set
(including opening photographs) while omitting the opening images and any
overlapping project thumbnails. Project pages likewise place their cover once.
All photographs remain available in the scoped viewer. The marketing sample
section has been removed from `/portfolio`. The private preview and public
portfolio still use the same renderer.

## Expanded portfolio content (schema version 3)

The Studio tab adds photographer/team details, specialties, service areas, travel,
process steps and explicit portrait/logo selection. Two profile images have a
separate allowance from the 50 work photographs. Uploads accept JPEG, PNG and
WebP up to 5 MB; known source sizes are checked again by the API. Existing
validated sources with no historical byte count retain their current handling.
Profile media uses the same preparation, ownership, publication and revocation
checks as work photographs. Removing a source repairs both snapshots.

Projects support shoot type, city, approved venue, brief, approach, credits, up
to six notes and related projects. Services support scope, deliverables, turnaround,
relevant work and optional naira pricing (hidden, starting, range or quote).
Content limits are six services, six testimonials, eight FAQs and five process
steps. Visible testimonials require the photographer's permission and attribution;
manual quotes are not marked verified. Empty sections do not render. Hidden
business sections and hidden enquiry contacts are removed from public JSON.
Incomplete hidden sections can be saved while other complete work is published.

Publishing manages optional-section order, enquiry options and share title,
description and approved cover. Work stays first and enquiries stay last. Explicit
publication applies to every new field; account-owned studio naming still follows
the existing separate rule. Older portfolios receive empty content defaults.
The migration preserves current addresses and backfills schema version 3.

Category identity is independent of its label. Public category links use
`/@handle?category=<id>`; renaming preserves that identity. Service context uses
`?service=<id>`. Existing `projects/<id>` addresses remain unchanged. Main-gallery
exclusions remain in force in the optional project-led mode. “Gallery arrangement”
offers the design default, an even grid or columns; Cinema retains its photo
strips. Legacy `direction.layout` remains accepted for old clients but does not
silently change an existing design.

The API and client each ship a portable copy of the content contract so isolated
deployment roots remain supported. The server copy in `src/shared` is canonical.
Run `node server/scripts/sync-portfolio-content.mjs --write` from the repository
root after changing it. The parity test checks both copies. This avoids imports
outside Render's service root, which are unavailable at build/runtime under
[Render's monorepo rules](https://render.com/docs/monorepo-support).

## Enquiries and activity

Public forms are optional and available only on accessible published portfolios
with enquiries enabled. Submissions resolve the receiving studio on the server,
validate reply details and source references, and require visitor consent.
The IP limit is five requests per hour, with an additional honeypot. Shared
mobile-network addresses can share this limit; direct contact routes remain
available when configured. Unique portfolio/request IDs and content fingerprints
make unchanged retries idempotent, including a lost success response.

The enquiry is stored before acknowledgement. Notification work is persisted,
leased and retried; email contains an inbox link without visitor contact/message
details. The portfolio worker processes the outbox. The worker must be running
for notifications to progress; saved enquiries remain accessible during an email
outage. Runtime configuration can disable the notification template. Configure
Resend and the public web origin before validating email delivery.

`/portfolio/enquiries` is a separate protected workspace with status filtering,
paging and direct reply links. New/Replied/Closed describes the studio's follow-up,
not a booking. Owner checks cover list and updates. Enquiries are deleted with
the account or expired portfolio retention. Unpublishing closes new submissions
while preserving the retained inbox.

Activity shows submitted enquiries separately from contact clicks, plus category
selections and service interest. It excludes identified common crawlers and
best-effort repeats within 15 seconds. Returning to the main gallery is not a
category selection. Analytics accepts known public categories only and receives
no visitor enquiry messages or contact details. It is not a booking report.

## Published pages and discovery

The client Worker returns current published HTML, safely serialized bootstrap
data, matching page/share metadata and business structured data. JavaScript
replaces the fallback with the interactive design and rechecks API access. An
unavailable portfolio is a real 404; provider failures are retryable 503 responses.
Public responses retain `no-store` and live media access checks.

`/portfolio-sitemap.xml` indexes bounded sitemap pages containing current,
accessible portfolio, project and category URLs. Private drafts and expired or
suspended accounts are omitted. `/robots.txt` advertises the sitemap and excludes
the inbox/editor/API. Worker routing includes these paths in `run_worker_first`,
using the supported [Cloudflare path patterns](https://developers.cloudflare.com/workers/static-assets/binding/).

## Deployment sequence

1. Back up MongoDB. Use a replica set or sharded cluster; publishing fails closed
   on standalone MongoDB. Deploy while portfolio editing is briefly unavailable
   to avoid writes during migration.
2. Run `node scripts/migrate-portfolios.mjs` in `server` to audit existing content
   and handle reservations. Correct any reported duplicate photos, unavailable
   covers, invalid contact details or conflicting handle reservations. The audit
   is read-only.
3. With production R2 credentials configured, run
   `node scripts/migrate-portfolios.mjs --apply`. This prepares display variants,
   keeps current addresses and reservations, assigns stable photo IDs, types the
   draft and backfills job snapshots. Rerunning is supported.
4. Deploy the compatible API and portfolio worker before the new client/Worker. Ensure
   `VEYLO_API_ORIGIN`, `VEYLO_WEB_ORIGIN` and `CLIENT_URL` agree. Public `@` and
   project URLs must pass through the Worker, including direct page refreshes.
5. `PORTFOLIO_REDESIGN_ENABLED=false` disables publishing new project sets while
   keeping draft recovery and core fixes. The runtime `portfolioRedesign` flag
   overrides this environment default. This is a project rollout switch, not a
   rollback of revision checks or media access controls. Do not roll the API back
   to a writer that overwrites typed drafts without revision checks.
6. In staging, use real authenticated photos: portrait and landscape originals,
   phone/tablet/desktop srcset variants, a sharing crawler request, then unpublish,
   suspend the account, end paid access and delete a source. Verify subsequent
   media and metadata requests close. Provider delivery and CDN behaviour require
   this staging check; local tests use prepared-media fixtures.

Local checks: `node --test scripts/portfolio-draft.test.mjs`,
`node scripts/security-audit-delivery-v2.mjs`, client `npm run build`,
`npx playwright test tests/portfolio.spec.js`, and
`node --test scripts/portfolio-shell.test.mjs scripts/portfolio-presentation.test.mjs`
in `client`, adding `scripts/portfolio-content.test.mjs` to the Node checks.
Browser checks include 320, 390, 640, 768, 834, 1024 and 1440px views, photograph
uniqueness, category lifecycle, reduced motion, all four expanded designs,
enquiry retry/context, inbox status, notice placement and image retry.

Before production, validate real R2 variants and sharing previews,
Resend notifications and retry recovery, Worker sitemap/crawler output and
revocation after unpublishing, suspension, paid expiry and source deletion.
Measure actual mobile LCP/INP/CLS, image bytes and failures. Local fixtures and
responsive screenshots cannot establish live network performance or conversion.
