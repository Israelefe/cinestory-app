# Veylo portfolio: full build plan

Date: 3 October 2026. Status: approved; implemented locally. Staging/provider and production rollout checks remain pending.

This plan builds on the [portfolio audit](portfolio-audit-and-improvement-plan.md). Its goal is to help a visitor understand the photographer's work, services and approach, then make a useful enquiry. The public page should feel like that photographer's studio, with their photographs leading the experience.

## 1. Remove the requested marketing section

Remove the entire **“See how your portfolio can look.”** section from `/portfolio`, including:

- Its heading, introductory text and sample description.
- Editorial, Cinema, Gallery and Folio sample-switching buttons.
- Full-width and phone sample controls.
- The embedded scrollable sample portfolio.
- The hero's “Explore the sample” link and its `#portfolio-showcase` anchor.

Implementation touches `PortfolioPage.jsx`, its `PortfolioShowcase` import and sample-specific browser checks. Remove `PortfolioShowcase.jsx` and its stylesheet only after confirming there are no remaining consumers. Update the sample-specific test to reflect the removal; retain actual public/editor design coverage.

Keep the marketing page's opening photography, product explanation, creation workflow, privacy/mobile/contact information and pricing invitation. Adjust spacing after removal. Do not automatically insert another interactive sample section in its place. Descriptions of new capabilities should appear on the marketing page when those capabilities are available.

The four portfolio designs and the editor's private previews remain part of the product.

Acceptance: the section is absent, there is no dead sample link, the page remains balanced at phone/tablet/desktop widths, and its primary account/editor action still works.

## 2. Add clear photographer identity

Add an optional public studio logo, photographer/studio portrait, display introduction, About text, base city, specialties, service areas and travel-policy text. A studio can introduce its team; a solo photographer can speak in the first person.

Show the specialty and base city near the opening photograph. Place the fuller introduction in About. Use the photographer's own wording and only real credentials, publications or client references they supply.

Portraits and logos need explicit public selection, file validation, media preparation and removal handling. They must not become public simply because they exist in account settings.

## 3. Improve the opening and navigation

The opening should contain a strong approved photograph, headline, brief introduction, city and a direct enquiry action. Provide nearby category access so visitors can immediately find relevant work.

Navigation links should reflect the content present: Work, About, Services and Enquire. A small phone should show a clear studio identity and enquiry route, with the remaining links in an accessible menu if needed. An optional mobile enquiry bar must respect safe areas and leave room for page content and notices.

Avoid adding a large collection of buttons to the hero. One primary enquiry action and a secondary work link are sufficient.

## 4. Make categories useful to share

Extend category labels with stable identity, an optional description and an optional approved cover. Give a category a public link that survives reload and browser Back. Renaming it must not break links already sent to clients.

Keep existing photo membership and order. Empty categories remain hidden. Do not add a photo to the main gallery just because it belongs to a category. Include category context when the visitor starts an enquiry.

Choose the final route structure during technical design; retain existing portfolio and project URLs.

## 5. Build richer project pages

Keep ordered photos and the existing shareable project addresses. Add optional shoot type, city, venue, brief, approach, narrative blocks, credits, related work and an approved testimonial.

Project pages should open with the title, photograph and concise context, then show the set, additional details and a contextual enquiry action. A wedding can explain coverage across its stages; a lookbook can describe the brief and intended use. Public details must be separately reviewed, even if the shoot already exists as a private delivery.

Offer an opt-in project-led homepage for photographers who prefer complete sets. Its cover allocation must be visible in the editor and preserve the current rules against unexpected images and unnecessary repetition. Do not automatically change existing photographers' chosen main galleries.

## 6. Add services and optional pricing

Each service should support a title, description, relevant work, scope, optional coverage/session length, deliverables, stated delivery time and enquiry action.

Price display options: no public price, starting price, price range or request a quote. Use naira by default for Nigerian studios. Photographer service prices are independent of Veylo subscription prices.

Proposed initial content bounds: up to six services, six published testimonials, eight FAQs and five process steps. These are editing safeguards for review, not new paid-plan quotas. The server and editor must share the same approved bounds.

## 7. Add client feedback, process and FAQs

Testimonials require a real quote, approved attribution and permission to publish. They can link to the relevant project. Never generate feedback or label manual entries as verified.

Process steps explain what happens from enquiry to receiving finished photos. FAQs answer practical questions about travel, date reservation, outfit changes, delivery, albums, usage and rescheduling. Published promises must come from the photographer.

Empty sections and their navigation links should disappear. No public placeholders or default commitments.

## 8. Make enquiries easier and more useful

Keep direct WhatsApp, Instagram and optional public email. WhatsApp messages should carry the selected category, service or project and its public URL.

Add an optional form with name, one reply method, shoot type and message. Date should allow “Not decided yet”; location and budget can remain optional. Require only information needed for a useful reply.

Save submissions to a private studio inbox before acknowledging success. Notify the photographer with reliable delivery/retry handling. Enquiry submission must not claim to reserve a date or confirm a booking. Suggested inbox statuses are New, Replied and Closed, with filtering and source context.

The receiving studio is resolved server-side. Add validation, limits, spam controls, duplicate-submission protection and owner-only access. Keep visitor messages and contact information out of analytics events.

## 9. Improve the photographer's editor

Organize editing into Work, Categories, Projects, Studio, Services, Client feedback, FAQs, Design and Publishing. Put process and travel details within Studio. Keep the enquiry inbox as a separate workspace so visitor submissions are not mixed with content editing.

Add a simple section manager to show/hide supported sections and reorder them within sensible limits. Provide guided field hints and previews rather than a blank general-purpose page builder. Keep Work available as the main selection surface.

Every section uses the existing private draft, autosave, recovery, revision checks and explicit publication. Show missing contact details as a readiness warning, with an intentional showcase-only setting for photographers who do not want enquiries.

Keep phone, tablet and desktop preview choices. Add a sharing preview for the title, description and cover. Extend existing behavior without losing draft-conflict protection or publication consent.

## 10. Apply the content to all four designs

| Design | Direction |
| --- | --- |
| Editorial | Photo-and-text spreads, strong project introductions and restrained business sections. |
| Cinema | A photographic opening followed by readable work navigation, profile and service content. |
| Gallery | Framed photographs, clear captions and simple, spacious text sections. |
| Folio | Optional project-led browsing, clear collection context and a strong studio introduction. |

All designs should provide the same essential information and enquiry options. Their arrangement and typography can differ. Preserve existing portfolio content when switching designs.

## 11. Remove or correct confusing behavior

| Current issue | Planned treatment |
| --- | --- |
| Categories buried after the gallery | Make browsing available near the opening. |
| Contact action reachable mainly through the final section | Add a direct opening action and consider the optional mobile bar. |
| Automatic text-only project cards | Make image allocation deliberate; retain text-only cards only when intentionally appropriate. |
| Generic project browser titles | Use the project and studio names consistently. |
| Wrong domain in the editor address hint | Generate addresses from the configured public origin. |
| First-visit notice covering the opening | Make the notice compact and accessible without obscuring key content; retain disclosure. |
| Image errors without a retry action | Provide useful retry behavior and clearer connection/error states. |
| Unused layout configuration | Remove it or give it a defined, tested role. |
| Conflicting field limits | Align editor, validation and model constraints. |
| Documentation disagreeing with Folio ordering | Update it to the shipped behavior and any explicit layout options. |

Keep original photographs, consent, private deliveries, category exclusions, photo reuse and subscription access protections. Retain the current 50 unique portfolio-photo allowance initially. New portrait/logo media needs a separately defined allowance.

## 12. Add discovery, sharing and useful reporting

Improve project titles and descriptions, image-slot sizing, approved share covers, copy-link/native sharing, crawler-readable published content, sitemap generation and appropriate business structured data. Include only published, accessible content and close access correctly when publication ends.

Report visits, category/project/service interest, contact clicks and submitted enquiries with clear definitions. Exclude automated and duplicate activity where appropriate. A click is not a sent message; an enquiry is not a booking.

Measure real mobile loading, image bytes and media failures before changing variants or caching. Faster media must preserve current access checks and revocation.

## 13. Final public page order

Default: studio header → opening photograph and introduction → category browsing and selected work → featured projects → About → Services → client feedback → process and FAQs → enquiry → footer.

Allow sensible section reordering. Omit empty sections. Public project and category pages provide focused work, context, navigation back and an enquiry route.

## 14. Delivery phases

| Phase | Scope | Completion criteria |
| --- | --- | --- |
| A: Marketing cleanup and current fixes | Remove the requested sample section and anchor; fix address hints, project titles, category-aware contact, notice/error handling and early navigation. | No broken marketing links; current exclusions and privacy hold; updated regression checks pass. |
| B: Photographer identity and work depth | Profile media, About, city/travel details, richer projects, persistent category links and opt-in project-led presentation. | Old links remain usable; new fields stay private until publication; all four designs render the content well. |
| C: Services and trust | Service/pricing options, testimonials, process, FAQs and section management. | Optional content hides cleanly; all public statements are owner-controlled; phone/tablet editing and viewing work. |
| D: Enquiry handling | Optional public form, owner-only inbox, notifications, statuses and submission recovery. | Abuse/access checks pass; messages remain saved after notification failure; no false booking confirmation. |
| E: Discovery and measurement | Published-content rendering, sitemap/structured data, sharing preview/actions and useful activity reports. | Direct links and metadata agree; unpublication closes access; staging performance and crawler checks pass. |

Treat each phase as a reviewable release. Do not promise a fixed delivery time before design and infrastructure decisions are resolved.

## 15. Validation and release

Test 320, 390, 640, 768, 834, 1024 and 1440px widths, including shorter landscape screens. Check long studio names, long service labels, mixed photo shapes, empty sections, menus, forms, notices, viewers and mobile safe areas. Use restrained opacity/transform animations and honor reduced motion.

Extend existing tests for meaningful new behavior: private/public section separation, category routes, owner-only enquiries, stale publication, consent, source deletion, notification failure and metadata. Update the removed marketing sample test instead of keeping it pointed at deleted content.

Deploy compatible server validation before clients send new fields. Plan migrations/backfills so existing portfolios keep their content and URLs. Validate real media, sharing and revocation in staging before production rollout. Establish a performance and enquiry baseline before claiming improvement.

## 16. Later extensions

Custom domains, external scheduling, QR sharing, optional behind-the-scenes clips, multilingual content and a client-feedback collection flow can follow. Booking calendars, deposits, contracts, ecommerce and a general blog require separate scope and demand validation.

The initial portfolio expansion should give visitors the information they need to choose and contact a photographer, while keeping setup manageable for a busy studio.
