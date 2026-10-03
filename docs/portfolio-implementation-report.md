# Portfolio expansion implementation

3 October 2026. The approved portfolio expansion is implemented locally. No
deployment or publication of a photographer's portfolio was performed.

The “See how your portfolio can look.” marketing section, sample controls and
dead anchor have been removed, along with the unused showcase component. The
four designs and private previews remain. Existing marketing copy now describes
the services and enquiry features that are available in this build.

Visitors can browse categories near the opening, share a persistent category or
project link, read fuller project context and learn about the photographer,
services, optional prices, client feedback, process and FAQs. The photographer
controls what appears and its order. Contact supports contextual WhatsApp,
Instagram, email and an optional form, with an optional phone shortcut.

The editor adds the new fields to private autosaved drafts and explicit
publishing. A portrait and logo use a separate two-image allowance. Source
deletion, account deletion, retained access and publication revocation cover the
new data. Hidden business sections and contacts are omitted from public output.

Form enquiries save to an owner-only inbox before success is shown. Unchanged
retries reuse their identity. Notifications use a durable outbox, leases,
idempotent email delivery and retry handling. New/Replied/Closed statuses are
follow-up labels; they do not confirm a booking. Enquiry messages and reply
details do not enter analytics. The privacy page explains this use.

The client Worker serves published HTML and bootstrap data, page/share metadata,
business structured data and paginated portfolio sitemaps. Activity distinguishes
enquiries from contact clicks and reports category/service interest, with common
crawler filtering and short-window repeat suppression.

## Validation

- 36 portfolio browser checks passed, including four expanded designs across
  320, 390, 640, 768, 834, 1024 and 1440px, editor previews, source exclusions,
  reduced motion, category rename/reload/Back, form retry/context, inbox status,
  first-visit notice placement, image retry, profile selection and short landscape screens.
- 42 portfolio server checks passed for ownership, draft/public separation,
  revisions, publication consent, content bounds, hidden sections, profile media,
  duplicate enquiries, notifications, sitemap access and activity handling.
- 23 client Node checks passed for presentation, crawler shells, safe JSON,
  sitemap output and parity between the isolated client/server content contracts.
- 37 billing regression checks passed, including account deletion of the new
  enquiry and profile-media records while financial evidence remains restricted.
- Production client build passed; existing application bundle-size warnings remain.
  The portfolio viewer is a separate lazy-loaded chunk.
- Server syntax checks and Git whitespace checks passed.

Expanded screenshots are available in `.visual-review/portfolio-designs`, named
`<design>-expanded-<width>.png` at 390, 834 and 1440px. They use local fixtures;
they do not represent a real studio's published content or measured mobile speed.

## Release conditions

Deploy the compatible server/portfolio worker before the new client and client
Worker. Real Cloudinary media, WhatsApp/social share rendering, Resend delivery,
worker retries, public sitemap/crawler responses, and live access revocation
still need staging verification. Measure mobile loading and image bytes before
making performance claims. No real email delivery or production speed result is
claimed from fixture tests.

Existing portfolio/category addresses are preserved. New optional fields default
to empty; category identity survives renaming. The configured server deployment
root remains unchanged. See the [release guide](../server/docs/portfolio-release.md)
for contract sync, migration and rollout details, and the
[approved plan](portfolio-full-build-plan.md) for scope and later extensions.
