# Six delivery formats — implementation results

Implemented the approved remaining scope from `six-delivery-formats-implementation-plan.md` on 3 October 2026. Existing caption policy, Photo Story, Reveal, Editorial, shared gallery, access flow and slideshow engines were preserved and integrated.

## Delivered

- Canvas: spatial wall and ordered arrangement, editable groups and covers, captions below photographs, retained-image focus view, immediate complete gallery.
- Chapters: cover/list directory, separate preview and introduction text, complete adaptive rooms, saved room positions, footer-based completion and restricted early enlargement.
- Album: editable single/pair/wide/triptych spreads, paper tones, retained decoded pages, explicit failed-page recovery, page overview, local resume, all-spread completion and a fresh reading run through Read again. Existing music remains.
- Event Coverage: selected highlights, active scene navigation, supplied date/venue, editable scenes and chosen lead photographs. Legacy fallback preserves contiguous order without invented chronology.
- Campaign: editable sets, real filenames/dimensions, supplied labels and roles, usage terms before approval, permission-aware file list and saved set filtering in the existing gallery. No generated file variants or rights claims.
- GridBoard: compact Find/More sheets, touch-accessible tile menus, editable introduction, retained/preloaded lightbox, focus/filter restoration and consistent sample preview controls. Existing arrangements, filters, Status cards, slideshow and music remain.
- Shared integration: production-owned renderers and schema-shaped demo fixtures, selected fonts, two-digit numbering and rules, light/dark contrast, responsive spacing and reduced-motion handling.
- Data contracts: ownership-checked saves, strict format-specific schemas, exact asset coverage, revision invalidation, scoped-reference filtering and existing writing review/repair/Undo extended to section bodies and spread notes.
- Permissions: individual photo endpoints now follow the individual-download flag; collection downloads follow the bulk flag. Status export keeps its existing permission policy.

## Verification

- Final server run: **161 passed** across presentation, V3, purpose wording, writing changes, Editorial and Reveal suites. Includes all four download-flag combinations, save round-trip, malformed coverage, manual spread writing and scoped references.
- Server syntax verification: **187 files checked**.
- Client production build: **passed**. Existing static/dynamic import and bundle-size warnings remain.
- Gallery completion and download/branding browser suites: **67 passed**, including legacy records and creator/demo/public gallery rules.
- Six-format and GridBoard browser run: **64 passed**, covering all six formats at 320, 390, 640, 768, 834, 1024, 1280 and 1440px, retained images, stale responses, failed Album spreads, focus return, seeking and creator save/reload.
- Further typography, slideshow, gallery swipe and six-format regression run: **114 passed**; one newly added Campaign set-filter assertion identified a missing explicit accessible label. That label was corrected, and the final targeted run of **11 tests passed**, including Campaign filtering, Read again, selected group leads and all six formats on a 320×568 white-themed screen.
- Screenshots reviewed at mobile/tablet sizes and on white backgrounds. Original photographs remain unchanged.

Creation round-trips and public records use mocked browser APIs and controller tests; this is not a live production publish or a live AI-provider certification. Physical-device frame-rate, constrained-network bandwidth and browser-native 200% zoom were not measured. No production records were migrated and no deployment was performed.

Unsaved presentation/introduction changes warn on reload and ordinary link navigation. Browser Back within the single-page router still follows the existing router behavior.
