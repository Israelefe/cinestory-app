# Canvas, Chapters, Album, Event Coverage, Campaign and GridBoard

## Audit and implementation handoff — 2 October 2026

This document is the proposed implementation specification for the six remaining delivery formats. It includes the shared foundations, format-specific changes, creation controls, writing rules, demo requirements and acceptance checks. No viewer redesign was implemented as part of this audit. The implementing agent must follow this document after the owner approves implementation; approval of earlier format work does not automatically approve every new feature below.

### How to use this document

Implement the genuinely new work and identified extensions in sections 3–11 in the order in section 12. Section 0 takes precedence: existing completed behavior is a preservation requirement, not another implementation task. Do not substitute a generic gallery for a format's presentation. Do not implement a feature only in its demo. Every saved option must affect the creator preview and published client view identically.

The workspace contains unrelated edits, including billing and Photo Swap work. Record the initial status, preserve those edits, and stage only files or hunks owned by this implementation. Do not commit another agent's work.

## 0. Completed work excluded from rebuilding — checked 3 October 2026

Compared this plan with the current source and earlier commits. This is a scope correction, not a claim that every existing feature was retested live. In the remaining sections, a description of an existing feature specifies the behavior that must survive the redesign. It does not authorize rebuilding that feature.

| Area | Already implemented: preserve and reuse | Actual remaining work |
| --- | --- | --- |
| Caption/headline alignment | Shared shoot-type, purpose and format policy; regeneration, bounded repair, manual protection, suggestions and Undo (`3b2d8b6`; `deliveryWriting.js`, `deliveryWritingChanges.js`) | Associations/validation for new section bodies and Album spread notes; Canvas grouping; copy for changed sample records. No rewriting the existing caption system. |
| Selected fonts | Shared heading/body/UI font mapping and propagation through all current viewers and gallery (`c0068a9`; `deliveryTypography.js`, `DeliveryTypography.css`) | Apply those existing variables to redesigned elements. Fix any local CSS override; no second font standardization. |
| Shared gallery | Designed grid/lightbox, numbering, captions, favourites, downloads, swipe, keyboard, modal focus, grid scroll/focus return and neighbour preloading (`141bc71`, `c0068a9`, `7a3f103`; `ClientGallery.jsx`) | Preserve the gallery. Connect new format labels/groups where needed; image-retention changes only if a specific missing behavior is demonstrated. No gallery redesign in this phase. |
| Full-gallery completion | Chapters all-room endings; Album all displayed spreads plus last page; Event/Campaign observed closing/handoff; Canvas/GridBoard immediate access (`7a3f103`) | Preserve policy and existing hook. Album alone needs viewed-state readiness/visibility for new tall spreads and sticky completion while revisiting. Do not rebuild the gates for the other formats. |
| Single-photo early viewing | `ClientGallery.singlePhoto` restricts early enlargement to the clicked asset (`7a3f103`) | Retain existing callbacks/guards when moving components; no second restricted-gallery implementation. |
| GridBoard collection/features | Three validated full-set arrangements, moment editing, colour filters, Similar Shot, scoped links, slideshow setup, speeds, navigation and Status cards already exist | Reorganize controls and improve the specific lightbox/preview gaps. Do not reimplement analysis, filtering, Status export or arrangement generation. |
| Image loading | Reveal has decoded-image caching, retained image and stale-request protection (`8955ab5`); shared gallery preloads neighbours; GridBoard slideshow caches/preloads and advances only when the requested image is loaded (`b769aee`) | Add missing readiness to Album/Canvas focus and other redesigned presentation surfaces. Keep established loaders. GridBoard lightbox may gain neighbour readiness; its slideshow is not rebuilt. |
| Music | Smooth looping is shared; GridBoard already has slideshow-only music, fades, pause/resume and failure handling; Album uses the loop helper (`b769aee`; `smoothSoundtrackLoop.js`) | Preserve audio behavior while layouts change. No new loop engine, audio steps, voice or Hannah regeneration. |
| Motion | Shared gallery and GridBoard already have reveals, transitions, tactile controls and reduced-motion treatment | Tune redesigned format surfaces. Do not replace working gallery/slideshow motion to match arbitrary new timings. |
| Colour/branding | Creator/server text-contrast validation, GridBoard readable/photo-led palettes, shared brand mark and studio initials, and earlier Story/Reveal contrast fixes exist | Fix residual hardcoded colours on the six remaining format surfaces, including Album paper. Reuse helpers; no palette-selection or branding-system rebuild. |
| Demo/preview rendering | Demo and client already use the same viewer components; creation uses those viewers and the shared branding decision | Correct mismatched demo record shapes/counts and GridBoard controls hidden in preview. Renderer extraction is a code move, not creation of a new parity system. |
| Creation/access/publishing | Upload recovery, draft media merge, preview sizing/dialog focus, PIN/expiry handling, approval revisions and publish recovery already have implementations and earlier fixes | Persist/validate new presentation settings within existing flow. Do not rebuild the wizard, upload pipeline, access gate or publishing. |
| Download choices | Access toggles and enforcement exist; however current individual endpoints allow either individual or bulk permission while the shared gallery checks the individual flag separately | This discrepancy remains an identified correction. Keep its scope explicit and test all permission combinations; do not describe the whole access system as unfinished. |

Before editing an existing subsystem, identify the specific remaining gap in this table. Prefer a small extension or integration. If current code already meets a requirement, preserve it and perform only appropriate regression checks. Do not extract or rewrite completed systems merely to make the file organization uniform.

## 1. Decisions to preserve

1. Keep the two-digit numbering, fine dividing lines, progress rules and restrained corner marks. Use `String(number).padStart(2, '0')`; the existing `0${number}` pattern breaks for double-digit values.
2. Keep original photograph colours and files. Layout, typography and surrounding surfaces may change. Do not apply automatic regrading, image replacement or generated photographic details.
3. Use the photographer's chosen display font for headings and their chosen body font for every caption and supporting paragraph. Use the fixed delivery UI font for controls, counters and labels. Do not change caption font from photo to photo.
4. Canvas and GridBoard remain freely browsable from the start. Album, Chapters, Event Coverage and Campaign retain presentation completion before full-gallery access.
5. A photo enlargement before completion must show only that clicked photo. It must not expose the full grid, neighbouring unvisited photos or download-all. Preserve `ClientGallery`'s `singlePhoto` behavior.
6. Current audio capability stays intact: Album uses the existing music step and soundtrack requirement; GridBoard has optional music during slideshow only. Canvas, Chapters, Event Coverage and Campaign remain silent. Do not add narration to these six formats.
7. Keep the already approved Photo Story, Photo Reveal and Editorial experiences. Shared changes must receive regression checks against them.
8. Strong motion remains the default when appropriate. Reduced motion applies when the viewer requests it through their device preference; it is not a blanket reduction of the normal experience.
9. These are finished-photo delivery formats. Likes/favourites, where already supported, help clients revisit photographs; they must not become proofing, approval or photo-selection workflows.

## 2. Current audit findings

### Evidence and limits

Reviewed the viewer implementations, shared gallery, renderer registry, V3 creation flow, GridBoard creation flow, server validation, grouping and writing services. A local isolated preview was used because unrelated in-progress workspace changes can prevent the full app from building. Initial demo checks at 320, 390, 768, 834 and 1440px completed without uncaught page errors or document-level horizontal overflow. These checks were not a complete interaction or performance certification. Later checks were interrupted; do not describe them as completed.

Visual checks confirmed very small supporting labels, captions over photos in several formats, and a white Album heading against a pale paper surface. Source inspection established the production/demo and data-contract problems below. Deferred offscreen images in the initial browser results were lazy-loading, not evidence of broken files.

| Format | What is worth keeping | Confirmed problems to address |
| --- | --- | --- |
| Canvas | Spatial identity, group navigation, fine paths, photo numbering, focus view | Public sample has six photos; the production minimum is eight. Above six photos the layout switches to a conventional grid. The generator gives Canvas one generic section rather than useful clusters. Captions and controls are too small; copy assumes portraits regardless of shoot. |
| Chapters | Choice of starting chapter, distinct covers, chapter numbers, viewed state | Sample has five photos while production requires eight. Section subtitle is reused as both preview line and room introduction. All photo counts above one use the same pair treatment. Captions cover photographs. Footer is absolutely positioned. Layout choices do not provide a complete adaptive room system. Legacy narration handling remains despite the silent capability. |
| Album | Cover, paper feel, page counter, music, page navigation | Only opening, wide and finale templates exist. V3 ignores generated sections when building spreads. Real pairings and spread editing are absent. Non-V3 sections can lose additional assigned photos because templates consume only one or two. Current year is substituted for shoot date. Page changes use clip-path animation. Completion is recorded on mount rather than image readiness. |
| Event Coverage | Highlights, scene navigation, photo counts, useful event sample | Fallback grouping distributes photos round-robin rather than preserving order. Production frames do not normally contain the category fields used by demo filters. Copy includes product explanations instead of event information. Captions are small overlays; highlights repeat the first four photos. Sticky navigation has multiple stacked control rows. |
| Campaign | Presentation followed by handoff, named sets, usage terms | Static MASTER / WEB CROP / SOCIAL CROP badges imply actual variants without checking files. Category filters depend on fields not normally saved in the V3 frame contract. First-four highlights repeat assets. Set writing is brief and generic. Usage terms are entered late and must be carried into the final preview. |
| GridBoard | Complete collection, three arrangements, moment/colour groups, Similar Shot, slideshow, Status card | Several rows of tools compete with photos on mobile. Sample mixes unrelated shoots. Creation preview hides client actions, weakening parity. Lightbox uses a separate implementation without the shared focus helper. Board description is displayed but not exposed as an editable V3 save field. Every-photo share/download tools add visual noise. |

### Important contract findings

- `server/src/constants/deliveryV3.js` currently permits Canvas 8–18, Chapters 8–20, Album 6–16, Event Coverage 10–24 and Campaign 6–16 showcase photos. GridBoard requires at least one photo and keeps the full collection. Preserve these bounds.
- `groupV3Sections` in `deliveryV3AI.service.js` creates meaningful groups only for Chapters, Event Coverage and Campaign. Canvas and Album receive a generic `showcase` section.
- All five Showcase formats here currently have a 180-character frame-caption ceiling. Non-Editorial section-body writing blocks are capped at 120 characters. Keep frame-caption compatibility; introduce the section-specific limits below.
- Current `CreateDeliveryV3.jsx` exposes format-specific design controls for Editorial and Reveal, but not these five. The older `DeliveryDirectionStudio` has more controls; its presence does not mean those controls are available in the active V3 flow.
- V3 showcase save accepts limited `sectionWriting`; it does not persist arbitrary new section layouts or per-frame visual settings for these formats. A frontend dropdown alone is insufficient.
- `normalizeDeliveryPhotos` normally resolves curated photos for a presentation and all photos for the gallery. Canvas's comment about every photograph does not change this selection behavior. Its copy must distinguish showcased photos from the full collection.
- `useClosingGallery` unlocks scroll formats when the closing section appears. That is the current agreed completion mechanism; do not silently replace it with timed viewing or forced scrolling through every section.
- Individual-download endpoints currently permit a download when either individual or bulk downloads are enabled. `ClientGallery` checks the individual flag separately. Audit this discrepancy and make the UI and server follow the intended independent toggles as specified in section 11.

## 3. Shared visual and interaction foundation

### 3.1 Layout and type

Use shared delivery tokens; keep each format's composition distinct.

These sizes guide the new format layouts. Existing compliant gallery/control styles do not need to be replaced. The font-selection and propagation system already exists; this section does not add it again.

| Element | Required treatment |
| --- | --- |
| Outer padding | 16px at 320–639px; 24px at 640–767px; 32px at 768–1023px; 48px above that |
| Content width | Maximum 1240px; reading paragraphs maximum 62 characters per line |
| Section separation | 48px mobile; 64px tablet; 88px desktop |
| Photo-to-caption gap | 12–16px; caption is in normal flow |
| Caption/body | 15–17px mobile; 16–18px tablet/desktop; line-height 1.5–1.65 |
| Control label | 13–14px; avoid all-caps for sentence-length labels |
| Small metadata | Minimum 12px, line-height at least 1.4 |
| Main heading | Responsive 34–48px mobile, 48–68px tablet, 64–96px desktop; line-height 1.05–1.15 |
| Section heading | 26–34px mobile; 34–52px larger screens |
| Targets | Minimum 44×44px; 8px minimum separation between separate targets |
| Lines | 1px intentional rules; visible against both light and dark surfaces |

Do not solve overflow by truncating meaningful captions or hiding navigation. Let titles wrap. Unbroken filenames may wrap with `overflow-wrap:anywhere`; ordinary prose should retain natural word boundaries. At narrow widths move actions to a second row or an accessible menu.

Keep the existing desktop phone presentation as the default route behavior. Test the underlying renderer at full desktop width too. Do not silently change the desktop behavior of the previously approved formats. Creator previews must continue using the real renderer, including when displayed in a phone frame.

### 3.2 Captions and branding

Default caption position: below the photograph on a solid, theme-aware surface. Image composition and people's faces take priority. Group introduction, section heading and photo caption are separate fields; do not repeat all three.

Use `deliveryTypography.js` and existing `DeliveryTypography.css`. Caption styling may change weight or spacing, never the selected font family. Light and dark delivery palettes both need legible studio name, recipient, counters, progress, borders and actions.

Derive muted text from a readable foreground; do not use a fixed white opacity on a white background. Check normal text at 4.5:1 and meaningful controls/boundaries at 3:1 against adjacent surfaces. Choose black or white ink for accent buttons based on contrast. A logo needs a neutral backing plate when its transparency would make it disappear. Do not recolour uploaded logos.

Keep the shared gallery's existing standard chrome unless its contrast needs fixing. Carry the selected fonts and appropriate branding into it; do not introduce six separate gallery skins.

### 3.3 Motion specification

Normal motion must feel deliberate and responsive:

The timings below apply to new or redesigned format surfaces. Existing shared-gallery and GridBoard slideshow motion is already implemented and stays intact unless an identified local defect needs fixing.

- Buttons: 160–200ms feedback; hover lift 2px; active scale 0.98.
- Section arrival: opacity 0→1, translateY 16→0, 450ms, easing `[0.22, 1, 0.36, 1]`; viewport once, amount 0.15.
- Photo/card stagger: 45ms per visible item, capped at 225ms. Do not multiply delay by total collection index.
- Modal entrance: opacity and scale 0.98→1, 280–340ms. Exit 180–220ms. Restore focus after closing.
- Album page change: outgoing opacity/translateX 0→−18px, incoming +18px→0; reverse for previous. Total interaction budget at most 450ms. Use opacity and transforms instead of animated clip-path, width or height.
- Group/filter changes: 180–260ms opacity transition; stable keyed assets; preserve visible focus and scroll anchor.
- Fine progress rules: animate scaleX with transform-origin left, not continuous width changes.
- Optional pointer depth only on Canvas with a fine pointer: maximum 4px displacement, one rAF update, no touch tilt. No movement of text controls.

Reduced motion disables parallax, photo drift, repeated zoom and travel effects. State changes remain visible immediately or through a short opacity change up to 120ms. Respect both device preference and any existing creator animation-off option. Keyboard and touch navigation must still work.

### 3.4 Image readiness and mobile loading

Reveal, shared-gallery neighbour preloading and GridBoard slideshow readiness already work as described in section 0. Preserve those implementations. Reuse their patterns for missing readiness on the new format surfaces; introduce a small helper for those surfaces only if it avoids duplication. Do not require migration of the already working loaders. The following describes the target behavior, with code changes only where a gap exists:

1. Load the current display-sized image first. Retain its thumbnail while it decodes.
2. For new page/focus loading, preload the next two presentation images and previous one; Canvas/GridBoard lightboxes preload only immediate neighbours. Cap new background concurrency at two. Preserve GridBoard's existing slideshow preload behavior.
3. Use responsive display derivatives for browsing. Reserve original files for explicit downloads.
4. On Save-Data or a slow connection preload only the next image. Abort or disregard obsolete requests after photo, format or delivery changes.
5. Keep the current photo visible while the requested next image loads. Show a quiet loading indicator after 300ms. Never show the new caption against the previous photo.
6. Preserve GridBoard's existing slideshow advancement guard: its timer runs only when the displayed asset matches the requested visit/asset. Do not implement this guard a second time.
7. On failure keep the current view and offer Retry. A failed asset must not silently count as viewed. Give an explicit Continue without this photo recovery so a broken file cannot trap the client; record that exception in local presentation state.
8. Lazy-load below-the-fold media and reserve aspect ratio. Do not fetch all 500 originals or preload every full-resolution image.

## 4. Shared architecture, creation and writing contract

### 4.1 Renderer ownership

Shared demo/client rendering already exists. The extraction below moves existing components/helpers so the production code no longer depends on the demo page. It must preserve their behavior and registry interface; do not build a parallel viewer or preview runtime.

Extract production Canvas, Chapters and Album viewers from `pages/FormatDemo.jsx` into `components/delivery/CanvasViewer.jsx`, `ChaptersViewer.jsx` and `AlbumViewer.jsx`, each with its own stylesheet. Move common photo normalization, theme and motion helpers into delivery utilities. Production viewers must not depend on demo fixtures or use a sample person's name as fallback.

Update `viewerRegistry.jsx`. Keep `FormatDemo.jsx` as route selection and demo wrappers. Event/Campaign viewers must also import shared utilities rather than importing production helpers through the demo page. Do this extraction without behavior changes before redesigning layouts.

### 4.2 Saved structure

Use the following namespaces; do not put settings only in React state:

```text
creativeDirection.sections[]:
  id, title, subtitle, body, assetIds, coverAssetId, layout
formatConfig.canvas:
  version: 1, arrangement: 'spatial' | 'ordered', showGroupNotes: boolean
formatConfig.chapters:
  version: 1, directoryLayout: 'covers' | 'list', showPhotoCaptions: boolean
formatConfig.album:
  version: 1, paperTone: 'theme' | 'light' | 'dark',
  spreads[]: { id, layout: 'single' | 'pair' | 'wide' | 'triptych',
               assetIds, heading, note }
formatConfig.eventCoverage:
  version: 1, highlightAssetIds, showSceneNotes: boolean,
  eventDate?: supplied ISO date, venue?: supplied text
formatConfig.campaign:
  version: 1, highlightAssetIds,
  assetLabels[]: { assetId, label, role },
  fileSets[]: { id, title, assetIds }
formatConfig.usageTerms: existing photographer-supplied string
pinboard.description: editable gallery introduction
```

Role enum for Campaign: `hero`, `detail`, `in-use`, `supporting`, `other`. Roles describe supplied photographs; they do not assert available crops, licences or marketing claims. File sets group existing delivery asset IDs only. No generated variants or transformation endpoints are included in this phase.

Create strict shared/paired validation schemas, following the existing Editorial/Reveal pattern. Validate on the server even if the underlying Mongoose field is Mixed. Extend V3 theme input with a format-specific `presentation` object and save it under the matching `formatConfig` namespace. Reject a presentation object for the wrong format.

Extend showcase `sectionWriting` to persist section title, subtitle, body, layout, cover and membership. Permit structure edits for Canvas/Chapters/Event/Campaign through this explicit contract. Require 1–5 nonempty sections and a unique assignment of every showcased asset. Covers must belong to their sections. Allow one honest group for a homogeneous shoot; do not force invented changes.

Album spreads must include every selected showcase asset exactly once across their `assetIds`. Each layout must have the matching count: single/wide=1, pair=2, triptych=3. Limit spreads to 16. Keep cover/closing assets separate; their decorative reuse does not count as body coverage. Stable IDs are identifiers, not template selectors.

All asset references must belong to the owned delivery and permitted presentation pool. Changes invalidate approval and increment the existing revision. Preserve PIN, expiry, access grants and publish recovery. Do not migrate live deliveries or rewrite their copy automatically.

For old deliveries, normalize structure at read time into safe defaults. Preserve old text and asset order. Missing optional settings use the defaults in each format section. Malformed references are discarded with a non-crashing fallback. Never populate an empty real delivery with demo photos.

### 4.3 Active V3 editor

Extend the existing creation flow. Its upload recovery, preview branding/sizing, access, approval and publishing fixes are completed work. Keep GridBoard's existing layout, group, font, colour, music and access controls; reorganizing their placement does not mean replacing their logic.

Add `DeliveryStructureEditor.jsx` for Canvas/Chapters/Event/Campaign and `AlbumEditor.jsx` for spreads. Mount structure editing in Showcase and presentation controls in Design. Support keyboard/touch move buttons as well as any drag interaction.

Photographers must be able to rename groups, edit introduction/body, choose cover, move/reorder photos, add/merge groups and choose a supported layout. Keep total bounds unchanged. Show selection count and full-gallery count separately. Removing a photo from the presentation leaves it in the gallery.

Persist edits on save/continue, show Saved/Unsaved status and prevent silent navigation loss. Preview local edits immediately using the same delivery record shape the server will return. After saving, reload and compare the result; no settings may disappear during serialization. Final approval must preview the latest saved access and usage terms as well as the layout.

For GridBoard, extend `pinboardInput`, save payload and Design controls with `description`, trimmed, maximum 240 characters. Keep the three validated layouts and complete-collection invariant. Do not reintroduce the removed purpose questionnaire.

### 4.4 Preserve completed writing alignment; support new text fields

The shared caption/headline alignment, shoot-type and purpose rules, automatic photo-change regeneration, automatic repair, manual-edit protection and Undo were completed in earlier work. They are existing behavior to preserve and regression-test, not a second caption-system rebuild. Do not change the established frame-caption voice, generation pipeline or limits merely because a viewer is redesigned.

The new writing work in this plan is limited to supporting newly introduced chapter/scene introductions and Album spread headings/notes, adding meaningful Canvas grouping, and authoring copy for the updated demo records. Reuse the existing generation and repair mechanisms for those fields; extend their validated field associations and limits only where the new UI requires it. The instructions below describe the policy and behavior to retain as well as those narrow extensions.

The existing shoot-type/purpose policy remains authoritative. Use photographer context first, visual observations second, and format writing rules third. A recipient is not automatically the person photographed. Never identify a person, relationship, venue, speaker, date, fabric, product material or usage right from pixels.

| Format | Main writing job | Hard limits and recommended length |
| --- | --- | --- |
| Canvas | Useful group labels and short personal or factual notes | Group title 60; subtitle 120; body 180; frame caption 180, aim 50–110 |
| Chapters | Distinct chapter headings and a useful introduction | Title 60; subtitle 120; body 320; frame caption 180, aim 70–140 |
| Album | Restrained keepsake writing, photographs carry the page | Spread heading 70; note 180, aim 40–100; frame caption 180 |
| Event Coverage | Accurate scene context, clear group names, multi-subject record | Title 60; subtitle 120; body 360; frame caption 180, aim 60–140 |
| Campaign | File role, supplied product/campaign context, practical handoff | Title 60; subtitle 120; body 320; frame caption 180, aim 60–150 |
| GridBoard | Client-specific introduction and plain moment labels | Description 240, aim 80–160; moment title stays 40 |

Keep opening 140 and closing 160 for these Showcase formats. Keep current saved frame captions valid. A frame headline may remain in the record even when a layout does not display it. Do not force heading+caption+section note onto every image.

Extend the existing writing-block definitions, creator limits and server validation together only for the new section/spread fields. Reuse the current policy in `deliveryWriting.js` and generation/repair service in `deliveryV3AI.service.js`; do not replace them. Replace hardcoded non-Editorial section-body limits with per-format lookup for these longer introductions. Add Canvas grouping; build Album spread suggestions from aspect ratios and approved order with a deterministic valid fallback. Do not make image grouping invent chronology.

Personal shoots: refer to the person and reason for the session; visual details are secondary. Event: describe actual scenes without birthday wishes or invented speakers/venues. Campaign: visible product details are useful but material, durability, brand claims and rights require supplied facts. Memorial: respectful, restrained language. No automatic clothing commentary just because the image analysis detected an outfit.

Reuse automatic regeneration/repair from `deliveryWritingChanges.js`: replacing a photo regenerates its frame text and reviews affected section/spread writing; changing opening/closing photos reviews their messages; moving photos reviews old/new groups. Regrouping does not rewrite untouched chapters.

Preserve manually edited fields. Offer changed wording as suggestions with Keep mine / Use suggestion and Undo. Include Album spread heading/note keys in provenance tracking and writing-block validation. Use request versions/cancellation so late responses cannot overwrite newer edits. Repair within bounded retries; preserve valid text, and expose retry/manual editing when a provider cannot finish. Rights, credits, dates and venue fields are never generated or automatically repaired.

## 5. Canvas specification

### Target experience

A spacious photo wall that invites free exploration. The wall must still feel like Canvas with 8–18 showcased photos, not only with the six-photo demo.

1. One compact opening: studio header, delivery title, optional opening note, and clear `Explore the canvas`. Avoid a second full-screen bookend before another introductory hero.
2. Show a group rail with two-digit indices and group names. Include `All groups`; changing groups highlights or scrolls to them without hiding access to the complete gallery.
3. Mobile: two-column irregular grid, gap 12px; group lead can span both columns. At 320px use one column if the intended tile width would fall below 140px. No absolute-position overlap or compulsory pinch/pan.
4. Tablet: three-column composition, gap 18px, deliberate wide lead tiles. Desktop: six-track grid where ordinary photos span two tracks and selected leads span three. Maintain DOM reading order. Do not create inaccessible visual-only ordering.
5. Use portrait and landscape ratios derived from assets; preserve focal points. Keep frames, fine connector/rule details and `01` style numbering. Never draw connector lines over faces.
6. All approved showcased photos remain reachable. Full-gallery access is available immediately and contains all uploaded photos. Say `8 photos on the canvas · 12 in your gallery` when counts differ; remove “every portrait is here” in that case.
7. Caption below each tile, maximum two visible lines with an explicit Read more expansion if longer. Expanded text stays in flow. No hover-only essential caption.
8. Selecting a tile opens a large image with its caption beneath and previous/next within the showcase; preserve the opening tile's scroll position and focus on return. Use shared gallery/lightbox infrastructure where it supports this without adding completion gating.
9. Closing note is short, with `Open full gallery`; no forced ending or unlock message.

Existing group notes/navigation, pointer depth and Canvas dialog focus handling are preserved, then adapted to the new composition. New work: generated/editable grouping that matches the V3 creation flow, spatial/ordered arrangement choice, readable caption placement and missing neighbour readiness in the focus view. Defaults: spatial arrangement, group notes shown. Creator must choose group covers and adjust grouping. Motion: bounded group stagger and existing focus transition adapted to the new layout; no continuously moving wall.

Acceptance: 8, 12 and 18-photo layouts retain Canvas identity; no covered caption or unreachable tile; one group works; real delivery with no client name has neutral copy; gallery is available before exploring.

## 6. Chapters specification

### Target experience

Choose a chapter, see its complete photographs, return or move to another chapter. The room must support more than two photos without clipping or enormous empty areas.

1. Directory begins with delivery title and opening line, then chapter covers. Do not stack a separate generic V3 opening bookend before this directory.
2. Mobile: one cover per row with 3:2 image and copy below. Tablet: two columns. Desktop: three columns, except one/two chapters use balanced narrower cards. Use consistent heights instead of arbitrary staggered cover lengths.
3. Each cover displays number, title, subtitle and photo count. A subtle check plus `Viewed` appears after reaching that chapter's real ending. Preserve two-digit oversized chapter numerals as background accents with readable foreground text.
4. Room header: `All chapters`, chapter number, title and body introduction. On desktop a reading sidebar may be sticky; mobile/tablet use an ordinary header above photos.
5. Render all assigned photographs. Supported layouts: `single`, `pair`, `triptych`, `grid`; they are repeating section compositions, not permission to show only the first N images. Mobile stacks; tablet pair/grid uses two columns; desktop pair two, triptych three, grid up to three. Lead portrait can be larger without cropping people.
6. Captions sit below photos. No absolute footer over images. Room footer comes after the last photo: Previous chapter, All chapters, Next chapter as appropriate.
7. Completion remains reaching each room's footer. Opening a cover or starting animation does not mark it viewed. After all chapters have been explored, show the full-gallery action in directory/header/footer. Keep individual-photo enlargement restricted before completion.
8. Offer `Continue with an unviewed chapter` when returning to a partly explored directory. It chooses the first unviewed chapter in saved order; it does not force a linear order.
9. Save room scroll position per chapter within the current presentation. Back restores directory position. Transition focus to room heading on entry and return to originating cover on exit.

Chapter choice, Viewed indicators, footer-based exploration tracking, gallery unlocking and restricted early enlargement already exist. Preserve their logic; new work is adaptive complete rooms, separate body text, new creator controls and room/directory position restoration.

Creator: edit title, subtitle, body, cover, photo membership/order and room layout; default directory `covers`, captions shown. Remove active silent-format narration controls; retain legacy compatibility only where it cannot activate forbidden audio.

Motion: directory-to-room 320ms opacity/12px travel; photos reveal once as they approach viewport. Do not stagger the entire 20-photo room eagerly.

Acceptance: rooms with 1, 2, 3, 7 and 12 photos show every asset; no footer overlay; out-of-order exploration works; gallery appears only after all room endings; identity changes reset completion.

## 7. Album specification

### Target experience

A composed album with varied, editable spreads, readable paper typography and responsive page navigation. Preserve music and the sense of turning pages.

1. Cover uses saved opening photo, delivery title and opening note. Display shoot date/year only if explicitly supplied; never replace it with the browser's current year.
2. Generate/save actual spreads. Default grouping: landscape stands alone; consecutive suitable portraits pair; an unmatched final photo stands alone. Photographer can change valid layouts, pairings, ordering, heading and note.
3. `single`: one complete photo plus optional quiet note. `pair`: two images side by side at tablet/desktop, stacked in one spread on mobile. `wide`: one landscape image, full-width, caption below. `triptych`: three supporting photos, stacked mobile/two-column tablet/three-column desktop.
4. Render templates by `spread.layout`; never by an arbitrary spread ID like `together`. All assigned photos must render. A photograph cannot disappear because a template expects fewer assets.
5. Reader uses image region + copy region + navigation in normal flow. At short heights allow vertical scrolling within the reader; keep controls reachable, avoiding fixed heights that crop notes. Mobile pair/triptych remains one spread for completion even when vertically stacked.
6. Paper tone `theme` uses readable palette-derived surface; light uses a warm light surface with dark text; dark uses a deep surface with light text. Validate each region independently. Fix the existing pale heading on pale paper.
7. Show two-digit current/total and a fine progress rule. Previous/Next targets are 48px. Up to ten spreads use accessible numbered controls; above ten use a `Pages` sheet with thumbnails. Direct seeking stays available but cannot bypass completion.
8. Enable left/right keys outside form fields and horizontal swipe only when horizontal movement clearly exceeds vertical movement. Vertical swiping must remain ordinary scroll.
9. Count a spread viewed only after visible photos decode and the spread becomes visible. For a tall mobile spread, observe its ending too. Completion requires all spreads plus reaching the final closing page. Once completed, gallery access stays unlocked while revisiting pages within that identity.
10. Closing uses supplied closing photo/note, `View full gallery` and `Read again`. If pages remain unseen, show `You have N pages left` plus `Go to the next unread page`; do not expose the full gallery yet.
11. Music begins from the Open album interaction, follows current smooth-loop handling, has visible sound control, survives page changes and pauses/fades on close. Playback failure must not stop album reading. Preserve the current server music requirement.

Existing cover, page counters, Previous/Next, keyboard navigation, swipe, music loop and all-spreads gate remain. Extend the existing swipe handler to distinguish vertical scrolling, and the existing gate to wait for photo readiness/visibility; do not replace them wholesale. New features: spread editor, page overview, next-unread-page action, stable local resume and a dedicated Read again action. Resume storage contains only delivery identity/revision and page/visited IDs; no PIN, private URLs or client text. Changed spread membership invalidates saved completion. `Read again` resets the reading run deliberately.

Acceptance: 6/9/16 showcase photos each appear exactly once in body spreads; covers do not substitute for body coverage; mobile stacked pages remain readable; seeking to end cannot unlock; slow images cannot falsely complete; soundtrack does not restart every page.

## 8. Event Coverage specification

### Target experience

A useful record of the event, with highlights and meaningful scenes. Clients should quickly find people, programme and details without reading an explanation of Veylo.

1. Hero: event title, supplied opening note, optional supplied date/venue, one lead photo and `View the highlights`. Studio name remains readable on any palette.
2. Follow with 3–6 selected highlights; creator explicitly chooses them. Defaults choose varied assets from different scenes, not merely the first four. Captions below images. Mobile highlight strip uses scroll snap and 84% width; tablet two columns; desktop three.
3. Combine event summary and navigation into a compact area. Show actual full-photo count and scene count. Do not substitute `Conference` for a missing shoot type.
4. Sticky scene rail has one row of scene buttons and a compact current-scene label. At 320px it horizontally scrolls within the rail without horizontal document overflow. Active scene follows viewport position. Anchors use stable section IDs and account for header height.
5. Scene block: number, title, optional body, lead photograph and supporting photos. `hero`, `grid` and `strip` are genuine supported layouts. Mobile stacks, tablet grid two columns, desktop three. Captions below images, details in 12px metadata.
6. Replace the hardcoded manifesto/product description with actual event scenes or omit it. Do not assert nothing important was missed.
7. Remove demo-only People/Programme filters unless backed by saved, creator-editable data. Main scope uses scene navigation consistently for demos and production; do not add a separate inferred-person filter.
8. When groups are absent, use contiguous chunks in saved photo order, labelled Scene 01 etc. Never round-robin shuffle or fabricate a chronology. Only use timeline/time labels when the photographer supplies them.
9. Closing shows closing note/photo and gallery/download actions after its observed handoff. Early photo enlargement remains singleton. Scene navigation is freely available before completion; jumping to closing retains the existing scroll completion policy.

Creator: edit scenes/notes/covers/order/layout, choose highlights, optionally supply event date and venue. Defaults: notes shown, highlight count up to four unless changed. Metadata fields are optional and omitted when absent.

Existing scene groups/anchors, highlight display, singleton enlargement and closing-based gallery gate remain. New features: active scene tracking, creator-selected highlights, optional factual event details and return to exact scene/photo. Rework the layout and remove the documented fallback/filter mismatch; do not regenerate the whole section-writing system. No face recognition or invented programme schedule.

Acceptance: conference, church gathering, owambe and memorial contexts use appropriate language; scene anchors survive reorder; 10/24 showcases render completely; gallery contains all uploads; supplied metadata survives save/reopen; sticky controls do not cover scene headings.

## 9. Campaign Delivery specification

### Target experience

Show the campaign clearly, then make the supplied final files easy for the team to identify and download. Every file label must tell the truth.

1. Hero: campaign title, brand/client context from supplied brief, lead photo, short opening note. Numbered fine rule identifies the presentation; no duplicate introduction block.
2. Highlights: 3–5 creator-selected assets, varied by actual role. No automatic duplicate first-four strip if it adds nothing; omit highlights when the sets already form a concise presentation.
3. Sets have number, title, body and exact file count. Lead photo plus supporting photos uses `hero`, `grid`, `strip` or `spread` with all assigned assets visible. Mobile stacks; tablet two columns; desktop up to three supporting columns.
4. File cards expose photographer-supplied label or original filename, actual dimensions if known, and explicit role if supplied. File size appears only when recorded. Make filename wrapping usable and offer Copy filename.
5. Remove MASTER / WEB CROP / SOCIAL CROP and other unsupported output badges. A crop/variant exists only when a real uploaded asset has been intentionally included in that file set. Do not generate crops automatically or imply rights from a role.
6. Use saved set/role data for navigation. Remove current demo-only category filters until the real contract supports them. The new role enum is editable in creation and can power an optional role filter only when multiple roles exist.
7. Handoff includes full collection count, actual file-set names and photographer-supplied usage terms. Empty terms display `Ask the studio about usage terms.` Never imply unrestricted or exclusive rights.
8. After observed handoff completion, expose gallery and permission-appropriate downloads. Opening early images stays singleton. Set grouping in the gallery must use the same asset IDs and saved labels.
9. Provide an optional `File list` download containing label/filename, dimensions, role and set title for currently accessible files. Produce this from the authorized public record only; include no storage identifiers, access tokens or private administrative fields. Do not call it a licence or legal agreement.

Creator: set names and writing, lead/supporting membership, highlights, labels, roles and file sets; edit usage terms before final approval. Final preview includes the saved terms. No extra file type uploads or automatic exports are part of this phase.

Generated Campaign sections, existing usage-terms entry/storage, handoff gate and singleton enlargement already exist. Reuse them. New work adds editable file metadata/set membership, truthful file presentation and carrying the saved terms into the final review. Do not add a second usage-terms store or rebuild rights generation; rights remain supplied text.

Motion: image/set arrivals and quiet active-navigation indicator. File tools should respond immediately; no animated scanner, spinning stamp or marketing badge.

Acceptance: portrait branding, product, food/property and lookbook contexts remain factual; no absent variants shown; supplied rights are verbatim plain text; restricted grants cannot expose other sets/files in the manifest; no download actions before handoff or when permission is off.

## 10. GridBoard specification

### Target experience

A beautiful complete gallery with useful tools that stay secondary to the photos. Preserve existing capabilities rather than rebuilding the board as another Showcase.

1. Header: studio mark/name, gallery title and one primary action appropriate to permissions. Move Status card and secondary sharing actions into a labelled More menu on narrow screens.
2. Intro: photographer-editable description. Keep count and privacy label, with readable 12px metadata. Do not require a full-screen cover before the board.
3. Main toolbar: current group and count, `Find photos`, Slideshow, More. `Find photos` opens a sheet containing moment groups and existing outfit/background-colour filters. On desktop these may appear as an expanded rail. This removes several competing rows on mobile.
4. Filtering is optional exploration: always offer Show all, never force a group choice. Preserve full collection, selected layout and approved order. Do not use outfit classification as the caption voice.
5. Keep creator grid controls: mobile 1–2, tablet 2–3, desktop 3–5 columns. Default 2/3/4, regular gap. At 320px use one column if the available tile width would be below 140px. Resize must not lose current selection.
6. Photo tiles retain natural-looking ratios, stable loading placeholders and restrained reveal. Essential actions must be reachable on touch; remove permanently prominent share/download chrome from every tile. Put actions in the photo lightbox and accessible tile menu.
7. Preserve Similar Shot and its factual visual grouping. Label it `Similar photos`; never suggest identity matching. Preserve slideshow of all photos, filtered group or related photos.
8. Lightbox: use the shared dialog focus/scroll-lock patterns, Escape, previous/next, swipe, contain fit, loading retention and focus return. Similar-photo row must not push main actions below short tablet screens. Use a collapsible related-photo section where needed.
9. Preserve the current decoded-slide timing, neighbouring preload, music start interaction, pause/resume, progress, replay and ending. Progress uses transform animation. No slideshow requirement to unlock the board or gallery.
10. Preserve Status card 1–4 image selection, download/share/copy link and server permission checks. Keep server exports authoritative for published deliveries. Do not modify original files when producing a card.
11. Creation preview and demo show the same buttons and layout as the client. Preview handlers simulate actions without contacting real recipients or downloading client originals. Do not hide buttons with `preview` if the client would see them; show a short preview message on activation.
12. Deep-linked photos/moments respect existing PIN, expiry and scoped sharing. On close, restore board position and active filter. Broken group IDs safely fall back to all accessible photos.

New features: combined Find photos sheet, editable introduction and compact actions menu. Targeted extensions: lightbox focus trapping/return and neighbour readiness, plus visibility/safe simulation of actions currently hidden in creation preview. Existing filters, three layouts, Similar Shot, music, slideshow loading/timing/replay and Status-card service are preserved. Existing three layout choices remain a creator decision. Do not enable client layout switching merely because a legacy flag exists.

Acceptance: 1/8/100/500 photos remain reachable, layouts contain every asset once, filters reset safely, preview controls match public controls, music only plays during slideshow, no overflow at 320px or clipping at 834px landscape.

## 11. Demo parity, shared gallery and permissions

### 11.1 Demos

Demo/client viewer sharing is already implemented. Build production-shaped demo records in `constants/deliveryDemoFixtures.js` with `schemaVersion:3`, stable UUID asset IDs, valid showcased counts, saved section/spread settings, opening/closing IDs, palette, typography, branding and access flags. Keep using the same existing registry/viewer; the work is correcting data/settings parity, not introducing shared rendering. No separate demo-only scene renderer, animation, caption branch or hidden feature. Do not redo the already completed Photo Story/Reveal/Editorial demo copy or Hannah narration.

Current Courage/Folake/Adeyemi samples have too few distinct photos for their production bounds. Do not duplicate derivatives under new IDs or lower production limits to make them pass. Use these concrete available asset sets for the main compliant samples:

- Canvas: first eight existing campaign demo photos as the showcase, all twelve in its immediately available gallery; title `The carry collection`, commercial context, groups Lead photographs / Details / In use.
- Chapters: first ten existing event demo photos in meaningful scene groups; title `The conference, in chapters`, documentary event context. Preserve the wedding sample only as a secondary short example if clearly labelled and separately tested; it is not the production-parity demo.
- Album: all six existing `demo-lora-1` through `demo-lora-6` photos; title `Lora's birthday album`, Birthday context. Do not infer an age. Use varied single/pair spreads and personal captions.
- Event Coverage: existing sixteen event photos, explicitly supplied sample event context, four/five honest scene groups.
- Campaign: existing twelve campaign photos, actual file labels and sets; terms presented as sample photographer-supplied text, never real rights advice.
- GridBoard: the six Lora birthday photos as one coherent shoot; moments only where supported by visible differences, keeping the three full-set arrangements.

Write demo copy against those actual photographs. Aim for warm specificity without invented events. For Lora: `Lora, your birthday portraits are ready to keep.` For documentary scenes: `Arrivals and check-in` with factual supporting text. For product files: `Lead photograph` / `Clasp detail` only when those details are visible. Do not reuse outfit descriptions as personal captions or repeat the client's name on every card.

Demo actions may use demo-local handlers and public sample files. Creator simulations must not trigger real publishing, client notifications, sharing or protected downloads. Interaction placement, empty/loading behavior and permissions must otherwise match.

### 11.2 Gallery integration

Reuse `ClientGallery.jsx`; preserve typography, favourites, downloads, swipe, focus handling and `singlePhoto`. Canvas/GridBoard never receive completion gates. Album/Chapters/Event/Campaign must guard both the visible controls and the callback that opens the full gallery.

These gallery features and completion guards already exist. Preserve them when moving the presentation components. Do not schedule a gallery redesign, a second gate implementation or a second focus/scroll-return system. Only new format integrations and documented permission/readiness gaps are implementation work here.

Full-gallery counts and assets are based on all accessible uploads, not only the showcase. Return from gallery preserves existing presentation state, soundtrack state and focus. Do not reset chapter progress or album page. Keep existing gallery neighbour preloading; any additional decoding/retention change requires a demonstrated gap rather than a blanket loader replacement.

Completion is a presentation rule, not an authorization boundary. Server PIN/expiry/grant/download enforcement remains independent. Do not treat a local `completed` flag as permission to access private files.

### 11.3 Download consistency

The creation UI exposes independent individual and complete-gallery download choices. Align affected server download endpoints and viewers with those names: individual flag controls one-photo downloads; bulk flag controls download-all. For a scoped share use the effective grant permissions, never the parent delivery's broader flags. Keep existing Status-card permission policy unless changed explicitly in the approved implementation; do not loosen it as a side effect.

Test all four combinations and parent-versus-grant restrictions. This is a shared behavior correction and needs regression checks across previously approved formats. Render useful busy/error states for downloads; do not claim a ZIP, export size, crop or file format that the current download implementation does not produce.

## 12. Implementation sequence and ownership map

| Step | Work | Main files |
| --- | --- | --- |
| 1 | Record baseline; separate production renderers from demos; preserve behavior | `FormatDemo.jsx`, `viewerRegistry.jsx`, new Canvas/Chapters/Album viewer modules; `EventCampaignViewers.jsx` helper imports |
| 2 | Reuse completed type/contrast/motion/brand/loading helpers; fix only local gaps on the new format surfaces | Existing utilities and shared components as dependencies; new scoped helpers only where needed; no mandatory edits to completed helpers |
| 3 | Strict data schemas, legacy normalization, save/approve round-trip | `server/src/controllers/deliveryV3.controller.js`, `server/src/constants/deliveryV3.js`, new format presentation constants; `Delivery.js` only if required |
| 4 | Preserve completed caption alignment; extend existing blocks for new section/spread fields and Canvas grouping | `deliveryV3AI.service.js`, `deliveryWritingBlocks.js`, `deliveryWritingChanges.js`, `DeliveryWritingReview.jsx`; retain existing `deliveryWriting.js` policy |
| 5 | Structure editors and complete live preview payload | `CreateDeliveryV3.jsx/.css`, new `DeliveryStructureEditor.jsx`, `AlbumEditor.jsx`; `ClientDeliveryPreview.jsx`, `PhonePresentation.jsx` only if needed for parity |
| 6 | Canvas, then Chapters, then Album redesigns | Dedicated viewers/styles; do not continue adding unrelated global overrides to `format-demos.css` |
| 7 | Event and Campaign redesigns plus saved metadata/file sets | `EventCampaignViewers.jsx/.css`, creator controls and schemas |
| 8 | GridBoard tool hierarchy, description save, lightbox gaps and preview control visibility | `PinboardViewer.jsx/.css`, `CreatePinboardV3.jsx/.css`, `pinboardInput`; preserve existing filters, palette, arrangements, slideshow, music and status service behavior |
| 9 | Valid unified demo records and copy | New `deliveryDemoFixtures.js`, `FormatDemo.jsx`, `PinboardDemo.jsx`, existing event/campaign assets |
| 10 | Existing gallery integration checks and targeted download-permission discrepancy correction | Public download handlers and affected viewer conditions; `ClientGallery` remains the existing dependency, not a redesign; preserve grant/access utilities |
| 11 | Responsive, slow-network and workflow verification; scoped commits | Existing tests below plus targeted new behavioral cases |

Keep changes reviewable in separate commits for foundation, each format, demos and shared permission correction. Push only implementation-owned changes under the user's standing instruction. Do not deploy or rewrite production deliveries without authorization.

## 13. Required validation and completion checklist

### Screen and interaction matrix

Test 320×568, 390×844, 640px transition, 768×1024, 834×1194, 1024×768, 1280×720 and 1440×900. Include tablet landscape, browser zoom 200%, light/white backgrounds, dark backgrounds, long studio/client names and long filenames. Check the default desktop phone wrapper and the underlying full-width renderer separately.

For each format test: opening → exploration → completion if applicable → gallery → photo → return; keyboard navigation; touch swipe; focus return; no horizontal document overflow; no covered actions or captions. Check normal motion and reduced motion. Review screenshots by eye; an overflow assertion alone does not certify attractive layout.

### Workflow matrix

- Create a real-shaped draft, generate structure, change photos, edit captions/heading manually, save, reload, preview, approve, publish through mocked/test APIs, reopen the public record.
- Confirm font, palette, layout, section membership, spread pairings, captions, usage terms and metadata survive round-trip.
- Change photo/order while generation is pending; late results must not overwrite newer manual edits. Retry/Undo works and untouched groups stay unchanged.
- Use a collection larger than the showcase; gallery includes all permitted assets and creator count labels are accurate.
- Check minimum/maximum showcase sizes; invalid foreign IDs, duplicate IDs and wrong layout counts are rejected server-side.
- Slow/delayed/broken current and next images retain a usable screen; completion cannot be falsely recorded by an empty image.
- PIN, expired link, scoped grants and download permutations remain enforced. Demo and preview never make a real notification/share/publish request.
- Album direct seek and Chapters opening-only actions cannot bypass completion. Canvas/GridBoard gallery remains immediately available. Event/Campaign preserve observed-handoff completion.

### Existing checks to extend, not replace

Server: `server/scripts/delivery-v3.test.mjs`, `delivery-writing.test.mjs`, `purpose-wording.test.mjs`. Browser: `client/tests/delivery-v3.spec.js`, `gallery-completion.spec.js`, `delivery-typography.spec.js`, `pinboard.spec.js`, `gridboard-motion-preview.spec.js`, `showcase-gallery-swipe.spec.js` and music cases where affected. Add meaningful checks for asset coverage, save round-trip, manual-copy preservation and permission enforcement; avoid tests that merely mirror CSS values.

Run the client production build in a clean checkout containing the intended changes. If the shared workspace is blocked by unrelated incomplete files, report the exact blocker and verify in an isolated checkout; do not alter another agent's work to make the build pass.

### Definition of done

- All six renderers have their own complete layouts and responsive behavior.
- Numbering and line details are retained and readable on white and dark themes.
- Captions are readable, use the selected body font and do not cover people or photographs.
- Every offered creation setting is saved, validated and visible in preview/public delivery.
- Demos use the same renderer and valid production-shaped records.
- No selected photo disappears through grouping or spread templates.
- Gallery completion and access permissions work exactly as specified.
- Background loading avoids empty transitions and excessive mobile downloads.
- Copy follows shoot purpose, preserves manual changes and makes no unsupported claims.
- Appropriate tests/build pass, screenshots have been reviewed, and only owned changes are committed/pushed.

## 14. Deferred ideas — do not add to the main implementation

Automatic campaign crops/exports, PDFs or print-album ordering, new narration/music for silent formats, facial search, comments/proofing, real-time client collaboration and client-controlled board layout switching need separate product and backend decisions. They are not prerequisites for making these six formats substantially better.
