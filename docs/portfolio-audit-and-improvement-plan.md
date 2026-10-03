# Veylo portfolio audit and improvement plan

Date: 3 October 2026.

The portfolio presents photographs well, but gives visitors too little information to choose a photographer confidently. The strongest next step is to add a clear account of the photographer, their services, their previous shoots and how to enquire, while keeping the photographs prominent.

This report is a proposal for review. No application code, database records or deployed settings were changed.

Follow-up scope: remove the entire “See how your portfolio can look.” sample section from the `/portfolio` marketing page. This includes its design buttons, screen-size controls, embedded sample and “Explore the sample” anchor. The four designs and private previews remain available in the photographer's editor. The expanded [full build plan](portfolio-full-build-plan.md) records additions, removals, editor changes and implementation order.

## Scope and evidence

Reviewed the public portfolio renderer, all four designs, category and project presentation, the management editor, draft handling, publication validation, public media access, analytics, sharing metadata and the hosting Worker. Compared the product with published guidance from photography platforms and public Nigerian photography websites.

Browser checks used local fixtures and real local image assets. They cover 320, 390, 640, 768, 834, 1024 and 1440px widths across the relevant tests; each individual test uses its own subset. Screenshots were inspected for Editorial and Folio on a phone, Cinema on a tablet, and Gallery on desktop. An additional phone check covered a first-time visitor, category navigation and project titles.

Validation results:

- 27 existing portfolio browser tests passed across two runs. The first run passed 18 before the local preview server stopped responding. All nine interrupted checks passed after restarting it.
- 32 server portfolio checks passed.
- 19 presentation and sharing-shell checks passed.

These results establish the tested local behavior. They do not measure production mobile-network speed, prove search rankings, verify live WhatsApp preview caching, or replace testing against production media providers. Commercial benefits below are product judgments to validate with photographers and prospective clients, not measured conversion results.

## What already works

| Capability | Current behavior |
| --- | --- |
| Public address | A studio has an `@handle` address, with redirects and reservations when its handle changes. |
| Four designs | Editorial, Cinema, Gallery and Folio have different openings and responsive compositions. |
| Photo selection | The photographer chooses finished photos from their deliveries or library, orders them, chooses a cover, and edits captions, alt text and crop focus. |
| Categories | Named groups can be created and ordered. Empty categories stay private. Category-only photos can stay out of the main gallery. |
| Projects | Each project has a title, introduction, category, ordered photos, cover and public URL. |
| Viewer | Photos open in a modal with keyboard navigation, swipe support, focus restoration and browser Back behavior. |
| Contact | Nigerian phone numbers are normalized for WhatsApp. Instagram links are validated. Project enquiries include the project name and URL. |
| Private drafting | Autosaves, recovery, revision checks and explicit publication keep pending edits separate from the public version. |
| Publication safety | Ownership, permission confirmation, account access and photo membership are checked. Public responses omit provider photo IDs. |
| Media | Prepared 400, 800 and 1600px WebP variants, responsive sources, lazy loading and a separate sharing image already exist. |
| Sharing | The Worker supplies portfolio/project metadata, canonical links, handle redirects and real unavailable-page statuses. |
| Activity | The photographer sees visits, visitors, project opens and contact clicks for the last 30 days. |

The current foundation should be extended. Rebuilding the draft and publication system would introduce unnecessary risk.

## What visitors currently experience

The usual sequence is:

**Studio name and Work/Contact navigation → opening photograph and headline → main gallery → projects → categories → contact/about details → footer.**

Visitors can judge the photography, open individual images and enquire. Their answers to these questions depend almost entirely on what the photographer puts into a short introduction:

- Is this the right photographer for my traditional wedding, birthday shoot or commercial brief?
- Where are they based, and do they travel?
- Who will I be working with?
- What is included in a shoot, and how will I receive the finished photographs?
- What have previous clients said?
- How do I ask about my date, and what happens next?

Changing the design currently changes the composition much more than it changes the information available to the visitor.

## Highest-priority findings

| Priority | Finding and evidence | Effect on visitors | Recommended change |
| --- | --- | --- | --- |
| High | Services, testimonials, FAQs and a substantial photographer profile are absent from the public schema and renderer. | Visitors have to start a conversation to learn basic business details. | Add structured, optional sections for these details. |
| High | Categories and projects follow the main gallery. In an additional six-photo Editorial fixture at 390×844px, project content began around 2,614px, categories at 2,942px and contact at 3,253px. | A visitor looking specifically for weddings must browse a mixed gallery first. Longer selections can increase this distance. | Put category links near the opening; provide earlier project access and an optional project-led home layout. |
| High | The header's Contact link scrolls to the contact section; the actual WhatsApp/Instagram links are there. The header is not sticky. | A visitor ready to enquire while browsing has to navigate back to the contact route. | Add a direct opening enquiry action and a restrained, optional mobile enquiry bar. |
| High | There is only a location string. It appears near the bottom, with no structured service area or travel information. | Visitors cannot quickly tell whether the photographer covers their location. | Show the base city near the opening; add optional travel areas and travel-policy text. |
| High | Biography content is either opening copy or content in the contact section, depending on the opening line and visibility settings. There is no photographer portrait or team section. | The person or studio behind the photographs remains indistinct. | Add a dedicated About section with a short introduction, approach and optional portrait/team image. |
| High | Projects hold only title, description up to 400 characters, category, cover and photo references. | A project page is largely another gallery, with limited explanation of the shoot. | Add optional location, shoot type, brief, approach, credits and a related testimonial. |
| Medium | The presentation allocator reserves visible photos and suppresses overlapping project images. In the reviewed fixtures, project cards became text-only links. | Complete sets have less visual presence than the individual gallery. | Offer an explicit project-led allocation that gives approved covers their own place. Preserve existing main-gallery choices and avoid repeating photos. |
| Medium | Categories are string labels and in-memory filters, with no description, cover or persistent URL. A browser probe confirmed that choosing Weddings left the URL unchanged. | A photographer cannot send a focused category link; refresh loses the selection. | Introduce stable category IDs/URLs, descriptions and optional approved covers. |
| Medium | WhatsApp enquiry text includes the project context but omits the selected category. Confirmed in the browser. | The photographer receives a generic message even when the visitor browsed wedding work. | Include the selected category, service or project and its public link. |
| Medium | There is no on-page enquiry submission or enquiry inbox. | Clicking a contact link provides no saved lead and does not show whether a message was sent. | Keep direct WhatsApp and add an optional short enquiry form backed by a studio-owned inbox. |
| Medium | Publication requires a bio and four public photos, but permits no usable contact route. | A public page can have no way for a visitor to enquire. | Add a readiness warning; allow an explicitly chosen showcase-only mode rather than silently publishing a disconnected page. |
| Medium | The first-visit storage notice is visible on public portfolios. At 390×844px it covered part of the opening headline. Most existing portfolio test fixtures pre-acknowledge the notice. | A first-time visitor sees Veylo's operational explanation over the photographer's introduction. | Design a compact, accessible notice for this surface and reserve space where needed. Retain clear disclosure and access to details. |

### Additional findings

| Finding | Recommendation |
| --- | --- |
| Project browser tabs still say `Studio — Portfolio`. The Worker has project-specific sharing titles, but the client overwrites the browser title with the generic portfolio title. | Use project-specific titles in the client and retain consistent metadata during navigation. |
| Sharing metadata exists, but the Worker returns a client-rendered body. No portfolio sitemap or structured business data was found in the reviewed source paths. | Add crawler-readable published content, sitemap generation and appropriate structured data. Verify discovery and rendering through Search Console; do not promise rankings. |
| Image `sizes` uses the same broad assumptions across different layouts. A paired phone image or narrow desktop frame can be much smaller than the declared slot. | Match sizes to the actual design and placement; measure selected image dimensions and bytes before adding more variants. |
| Public media is streamed through the API with current access checks and `no-store`. | Measure latency and load. Any caching proposal must preserve revocation after unpublishing, access expiry or source deletion. Do not remove access checks for speed. |
| An individual image failure offers explanatory text but no explicit retry control. The page error treats temporary outages and missing portfolios with the same heading. | Add useful image retry behavior and distinguish an unavailable address from a temporary connection failure. |
| The editor's address hint uses `veylo.com`, while public marketing and hosting use `veylo.com.ng`. | Generate public addresses from one configured origin. |
| Release documentation says Folio places projects before individual photographs, but the current renderer and browser tests place photographs first. | Update documentation or deliberately introduce an opt-in project-led layout with matching tests. |
| The stored `layout` setting produces a CSS class, but no `layout-*` rules were found in PortfolioCanvas.css. Template-specific rules drive the visible layout. | Remove unused configuration or define its intended behavior before exposing it as a meaningful control. |
| Location, opening-line and contact-label limits differ between editor inputs and server validation; Instagram limits also differ between validation and the model. | Share field constraints so the editor, draft and published model agree. |
| Activity totals are recorded from public API requests and contact-link events. Refreshes and automated requests can affect totals. | Define visits consistently, separate contact channels and filter automated/duplicate activity where appropriate. |
| Both WhatsApp and Instagram clicks produce an additional `enquiry.clicked` event. The displayed contact total currently sums the channel events, so this is not a demonstrated double-counting bug. | Document one funnel definition before building new reports; avoid summing all three event types together. |
| The maximum is 50 unique portfolio photos across all projects, not 50 per project. | Keep this quota for the first content expansion. Explain reuse clearly; evaluate a separate quota change from actual usage and delivery cost. |

## What to add, and what each feature should do

### 1. A proper photographer introduction

Give the photographer fields for a short public name/introduction, portrait or studio image, base city, specialties, approach and travel coverage. A solo photographer should be able to speak in the first person; a studio should be able to introduce its team.

Example structure, to be completed with the photographer's own facts:

> Wedding and portrait photography in Lagos.
>
> I photograph traditional weddings, birthdays and studio portraits. Based in Lekki, available for shoots across Nigeria.

The portrait needs its own upload/ownership/publication checks. Do not pull an account avatar or private delivery photo into the public page automatically.

### 2. Services visitors can understand

Start with a small number of services, each linked to relevant work. A service can include:

- A name such as Traditional weddings, Birthday portraits, Studio portraits or Commercial lookbooks.
- What the service covers and who it suits.
- Optional session length or event coverage.
- Deliverables and the photographer's stated delivery time.
- Optional starting price in naira, a price range, or a request-for-quote label.
- An enquiry action that carries the service name.

Photographer service prices are separate from Veylo's subscription prices. Never use Veylo's ₦25,000 Pro price as a photographer's shoot price. Optional pricing should accommodate both fixed portrait packages and custom wedding/commercial quotes.

### 3. Projects with enough context to assess the work

Keep the existing project routes and ordered photo references. Add optional details around them:

| Field | Purpose |
| --- | --- |
| Shoot type | Makes the relevance of the set clear. |
| City and optional venue | Shows where the work happened, with the client's permission. |
| Short brief | Explains what the client wanted. |
| Approach | Explains lighting, coverage or direction in language a client understands. |
| A few narrative blocks | Connects the approved photos without requiring a long article. |
| Credits | Acknowledges a stylist, makeup artist, planner or brand when appropriate. |
| Client feedback | Links real feedback to the work it describes. |
| Related work | Gives the visitor a useful next set to open. |
| Contextual enquiry | Lets the visitor ask about a similar shoot. |

A wedding set can show preparation, ceremony, family portraits and reception. A commercial set can explain the brief, intended use and final images. Avoid automatically publishing private briefs, dates, client names, exact addresses or delivery links. Public project text must be written or reviewed for publication.

### 4. Real client feedback

Offer a restrained testimonial block with the quote, approved attribution and optional linked project. Collecting feedback from a finished delivery could become a useful Veylo feature later, but requesting feedback and approving its public use are separate steps.

Show two or three useful quotes initially. Label imported feedback accurately; do not mark a manually entered quote as verified or generate testimonials.

### 5. What working with the photographer involves

Let photographers explain their actual process: enquiry, agreeing the shoot, preparation, photography and receiving finished work. Keep it brief and editable.

Do not assume every photographer requires the same deposit, provides same-day previews or promises a particular turnaround. Any published commitment comes from the photographer.

### 6. FAQs that remove practical uncertainty

Suggested prompts: Do you travel outside Lagos? How do I reserve a date? How many outfits can I bring? When will I receive the edited photos? What happens if I need to reschedule? Do you provide albums? What usage is included for a commercial shoot?

Only show questions the photographer has answered. Empty/default answers should never appear on the public page.

### 7. An enquiry route suited to WhatsApp and email

Keep one-tap WhatsApp as the primary route where configured. Add an optional form requiring a name, one reply method, shoot type and short message. Date should support an undecided option; location and budget can be optional.

After submission, state that the enquiry was received and what the photographer says to expect next. Submission is not a booking confirmation or a reserved date. A studio inbox should show New, Replied and Closed enquiries, with source project/service and date received. Notification delivery needs retries; enquiries must remain saved if email delivery fails.

Apply server validation, owner-only inbox access, request limits, duplicate-submission handling and spam controls. Keep enquiry content out of analytics metadata. Direct WhatsApp must remain usable without completing the form.

### 8. Better sharing and discovery

Add copy-link and native sharing actions with a clipboard fallback. Enable category/service links for Instagram bios, WhatsApp proposals and campaigns. Let the photographer preview the public title, description and cover used when sharing.

Later, offer custom domains once ownership verification, TLS, canonical URLs, routing and lifecycle handling are designed. QR codes are useful for printed studio materials; they are a later convenience, not the first improvement visitors need.

## Suggested public page structure

1. **Header:** studio identity, Work, About, Services and Enquire when those sections exist. On a phone, keep the studio name and enquiry action visible; place remaining navigation in a roomy menu.
2. **Opening:** one strong approved photograph, clear specialty, base city and a direct enquiry action.
3. **Browse work:** category links and a short selection, respecting the photographer's existing main-gallery choices.
4. **Selected projects:** complete sets with clear titles and context; use an opt-in project-led home layout where appropriate.
5. **About:** the photographer or team, their approach and travel coverage.
6. **Services:** the work offered, optional prices and relevant project links.
7. **Client feedback:** a few specific, approved quotes.
8. **Process and FAQs:** concise answers to common booking questions.
9. **Enquire:** direct WhatsApp, optional form, email if configured and realistic response expectations.
10. **Footer:** studio identity, social links, privacy information and quiet Veylo attribution.

This is a default order, not a requirement to fill every section. Omit empty sections and their navigation links. A specialist may need fewer sections than a studio with several services.

Keep the four existing designs and adapt the added content to them: Editorial can use photo-and-text spreads; Cinema can place readable business content beneath its image opening; Gallery can use restrained framed projects and simple text; Folio can offer an explicitly chosen project-led opening. All four need the same usable information and enquiry options.

The current rule that selected photos should not repeat or appear unexpectedly remains valuable. Project-led layouts must show photographers which approved image occupies each homepage position. Changing the allocation must be an explicit choice, preserve category membership and never reveal an excluded photo automatically.

## Research and how it informs this plan

These sources support the direction, but they do not establish a conversion increase for Veylo.

| Source | What it shows | Implication for Veylo |
| --- | --- | --- |
| [Pixieset: essential photography website pages](https://blog.pixieset.com/blog/essential-pages-photography-website/) | Guidance covers work, about, services, testimonials and contact. | Add business information around the photographic selection. These can initially be sections rather than seven separate pages. |
| [Pixieset: contact forms](https://help.pixieset.com/hc/en-us/articles/18408676126349-Capturing-Leads-and-Contacts-with-Contact-Forms) | Forms can capture dates and other details, create contacts, and send submissions to an inbox/email. | An enquiry should be saved and actionable; a click is only the beginning. |
| [Format: photographer website checklist](https://www.format.com/magazine/resources/photography/photography-website-checklist) | Discusses photographer identity, contact and descriptive website information. | A short biography alone leaves useful context missing. |
| [Gaspo Studios: Book a Shoot](https://www.gaspostudios.com/book) | A Nigerian studio presents services with coverage, deliverables and date selection. | Local visitors can benefit from concrete service details. This is an observed website example, not verified pricing or measured booking success. |
| [Izzy of Lagos: wedding services](https://izzyoflagos.com/wedding/) | Public packages include travel-related conditions and adjustable coverage. | Travel expectations and scope belong alongside relevant work. |
| [Google: image SEO](https://developers.google.com/search/docs/appearance/google-images) | Descriptive text, alt text and the context around images help search engines understand them. | Add meaningful public context and accurate image descriptions, rather than keyword-filled captions. |
| [Google: Web Vitals](https://web.dev/articles/vitals) | Defines good LCP at 2.5s or less, INP at 200ms or less and CLS at 0.1 or less, assessed at the 75th percentile. | Use real mobile experience as a release goal; responsive screenshots alone do not measure speed. |
| [W3C: target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) | WCAG 2.2's minimum target criterion uses 24×24 CSS pixels, with exceptions including spacing. | Retain Veylo's more comfortable 44px touch-target goal and check narrow controls in both dimensions. |

## Implementation plan for approval

| Phase | Work | Relative effort | Release condition |
| --- | --- | --- | --- |
| 1: Improve the current visitor path | Remove the “See how your portfolio can look.” marketing sample and its anchor; add earlier category access, direct opening enquiry, category-aware WhatsApp text, correct titles/address hints, intentional project-card treatment, improved first-visit notice and image errors. | Small to medium | Marketing navigation has no dead sample anchor; main-gallery exclusions and privacy still hold; navigation/contact work at 320, 768 and 834px; applicable checks remain green. |
| 2: Add photographer and service details | About/portrait, service areas, services, optional starting prices, process, FAQs, approved testimonials and richer project context. Extend the editor and private/public snapshots together. | Medium to large | Every visible statement is editable, optional sections disappear when empty, and pending edits never reach public APIs or share metadata. |
| 3: Capture and follow up enquiries | Optional form, private inbox, source context, delivery notifications, reply status and reliable submission handling. | Large | Ownership, spam handling, duplicate submissions, failure recovery and public/private data separation are verified. |
| 4: Improve discovery and measurement | Stable category/service routes, published-content rendering, sitemap, structured data, sharing controls, useful funnel reports and measured media improvements. | Medium to large | Direct links, crawler responses, canonical metadata, revocation and real mobile performance are verified. |

Basic category URLs and metadata corrections can be brought into Phase 1 if they fit cleanly. The heavier publication rendering and custom-domain work should remain separate. Effort labels describe scope, not delivery-date commitments.

### Technical approach

Extend the existing portfolio rather than build a separate general page builder. Use typed, bounded section objects for about details, services, testimonials, process and FAQs. Introduce stable category IDs when creating category routes; keep project IDs and existing URLs working.

New public fields must follow the same path through model validation, draft schema, normalization, editor state, autosave, revision checks, publication, output filtering and sharing metadata. Store them in the private draft and the published snapshot. Reading new business sections from mutable account settings would undermine explicit publication; account-owned studio naming already has distinct behavior and should be documented separately.

Keep existing photo references and the 50-photo limit in the first release. Additional portrait/logo media needs a defined allowance, preparation and cleanup policy. Add bounded content limits and allowlisted links; do not accept arbitrary HTML or embed code in the first version.

The enquiry inbox should use a separate studio-owned data model. Public portfolio responses must never include enquiry records, contact messages or internal notes. Use opaque public references, and derive the receiving owner server-side.

### Responsive design and verification

Use single-column reading on small phones, balanced paired content on tablets and bounded multi-column layouts on desktop. Test both 768 and 834px explicitly, including landscape and shorter-height viewports. An enquiry bar must respect safe areas, avoid covering the final content and coexist with the storage notice. Keep menus, FAQ controls, viewer buttons and form actions comfortably separated.

Animate opacity and transforms with restrained reveals and press feedback. Honor reduced motion throughout. Expanded content, long studio names, unusual image ratios and longer service labels must be part of testing. Do not add auto-playing music or video to the default portfolio.

Before release, verify public/private separation for each new field, unauthorized media and inbox access, stale publication attempts, invalid links, long input, duplicate enquiries, unavailable images, notification failures, and unpublication after the page has been shared. Provider/CDN and mobile-network checks must use staging assets, not only fixtures.

## Features to consider later

Custom domains, optional behind-the-scenes video, publication/client logos with permission, external scheduling links, downloadable capability statements for commercial work, multilingual content and QR sharing are useful extensions. A small feedback-request flow tied to completed deliveries could help photographers build honest testimonials.

A full booking calendar, deposits, contracts, ecommerce or a general blog would each create a substantial new product area. Prioritize them only after enquiries and photographer demand justify the work. In the first release, external scheduling links can serve studios that already use a booking system.

## How to judge whether the improvement worked

Interview photographers from wedding, portrait/birthday and commercial studios, and prospective clients with a real shoot in mind. Ask visitors to identify the photographer's city and specialty, find relevant work, explain what a service includes, and start an enquiry on their phones without assistance. Compare the current experience with a reviewed prototype before choosing a final layout.

Track contact-click rate, saved enquiries, the proportion the photographer considers relevant, and which projects/services led to enquiries. A WhatsApp click cannot establish that a message was sent; a submitted enquiry cannot establish a booking. Confirmed bookings need an explicit later workflow or photographer reporting.

Measure mobile loading, interaction responsiveness, layout stability, image bytes and media failures. Establish the baseline first. Avoid inventing a target conversion uplift before traffic and visitor behavior are known.

Recommended first release: a clear opening with city and enquiry action, early category access, richer selected projects, About, Services, a few approved client quotes and FAQs. This supplies the information clients need while the photography remains the main reason to visit.

## Code and review references

- Public rendering and contact behavior: [PortfolioCanvas.jsx](../client/src/pages/PortfolioCanvas.jsx), [PortfolioCanvas.css](../client/src/pages/PortfolioCanvas.css), [PublicStudioPortfolio.jsx](../client/src/pages/PublicStudioPortfolio.jsx).
- Photo allocation and categories: [portfolioPresentation.js](../client/src/services/portfolioPresentation.js), [portfolioCategories.js](../client/src/services/portfolioCategories.js).
- Editor and public form fields: [ManagePortfolio.jsx](../client/src/pages/ManagePortfolio.jsx), [portfolio.js](../client/src/services/portfolio.js), [usePortfolioDraft.js](../client/src/hooks/usePortfolioDraft.js).
- Models, validation and public output: [Portfolio.js](../server/src/models/Portfolio.js), [portfolio.js](../server/src/utils/portfolio.js), [portfolioV2.controller.js](../server/src/controllers/portfolioV2.controller.js).
- Sharing and delivery infrastructure: [portfolioShell.js](../client/worker/portfolioShell.js), [portfolioMedia.service.js](../server/src/services/portfolioMedia.service.js), [portfolio-release.md](../server/docs/portfolio-release.md).
- First-visit notice and measurement: [CookiePreferences.jsx](../client/src/components/CookiePreferences.jsx), [analytics.js](../client/src/services/analytics.js).
- Browser verification: [portfolio.spec.js](../client/tests/portfolio.spec.js).
- Screenshots: [Editorial phone](../.visual-review/portfolio-designs/editorial-390.png), [Folio phone](../.visual-review/portfolio-designs/folio-390.png), [Cinema tablet](../.visual-review/portfolio-designs/cinema-834.png), [Gallery desktop](../.visual-review/portfolio-designs/gallery-1440.png), [first-time visitor on a phone](../.visual-review/portfolio-designs/audit-first-visit-390.png).
