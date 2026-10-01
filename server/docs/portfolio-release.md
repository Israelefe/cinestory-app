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
authenticated Cloudinary variants at 400, 800 and 1600 pixels, plus a 1200×630
sharing image, and streams them without exposing signed provider URLs. Responses
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
opening, photograph arrangement and mobile composition. Cinema includes manual
cover crossfades and a swipeable filmstrip; Folio places projects before individual
photographs and includes project preview strips. All designs share category
filters, project routes, the photograph viewer and contact links.

`direction.template` is validated on the server and stored in both the private
draft and published snapshot. Existing portfolios default to Editorial. No data
migration is needed for the design field. `direction.motion` accepts expressive,
subtle or still; browser reduced-motion preferences always take precedence and
are observed while the page is open. Cover browsing is manual, without autoplay.

Previewing another design does not save it. Choosing a design applies its starting
colours, typography, spacing and motion to the private draft. The photographer can
adjust those settings before publishing. Project pages inherit the published
design, and saving a different design keeps the current public version unchanged.

Deploy the server with the new template and motion validation before the client.
An older server rejects the new design fields in draft saves.

## Deployment sequence

1. Back up MongoDB. Use a replica set or sharded cluster; publishing fails closed
   on standalone MongoDB. Deploy while portfolio editing is briefly unavailable
   to avoid writes during migration.
2. Run `node scripts/migrate-portfolios.mjs` in `server` to audit existing content
   and handle reservations. Correct any reported duplicate photos, unavailable
   covers, invalid contact details or conflicting handle reservations. The audit
   is read-only.
3. With the production Cloudinary account configured, run
   `node scripts/migrate-portfolios.mjs --apply`. This prepares display variants,
   keeps current addresses and reservations, assigns stable photo IDs, types the
   draft and backfills job snapshots. Rerunning is supported.
4. Deploy the API, portfolio worker and client Worker together. Ensure
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
`node --test scripts/portfolio-shell.test.mjs` in `client`.
