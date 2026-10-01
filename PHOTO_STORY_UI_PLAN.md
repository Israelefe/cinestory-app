# Photo Story and shared gallery UI plan

Status: Approved by the user on 2026-10-01. Implemented locally and verified on 2026-10-01.

## User requirements

- Improve Photo Story client delivery and the gallery shared by delivery formats.
- Make the experience attractive, smooth, and thoughtfully animated.
- Fix the current caption placement as a central part of the redesign.
- Keep the client experience aligned with the create-delivery process and its preview.
- **Keep public delivery demos aligned with real published client deliveries so photographers can accurately see what they will be getting. Demo, creation preview, and client playback must share the same presentation behaviour for equivalent delivery settings.**
- Preserve current delivery functions and photographers' saved choices.
- **Preserve the outlined numbering style and decorative line style the user likes. These are required design features, not elements to remove during visual cleanup.**

## Required visual features to preserve

- Large outlined photograph/frame numbers, including their distinctive typography.
- Fine decorative lines and rules.
- Photograph frame borders and corner details where currently used.
- Animated line reveals and sweeps.
- Number and line treatments within the existing scene layouts.

Improve their positioning, scale, spacing, contrast, and animation timing across phones, tablets, and the existing desktop phone presentation. Keep them clear of faces, captions, and controls. Coordinate their entrances and exits with the photographs. Do not replace them with generic counters or remove them to simplify the screen.

## Creation and client-view alignment

Use the shared format viewer for creation preview and published client playback. Any default presentation change must be reflected in both paths before a photographer approves the delivery.

Preserve and verify:

- Selected showcase photographs and their exact sequence.
- The complete uploaded gallery, including photographs outside the showcase.
- Chosen opening and closing photographs.
- Titles, headlines, captions, and opening/closing messages.
- Studio branding, colours, and fonts.
- Music, opening/closing narration, and supported legacy narration behaviour.
- Play, pause, replay, swipe navigation, and caption visibility.
- Favourites, individual downloads, and full-gallery downloads.
- PIN protection, expiry, download restrictions, and other existing access rules.
- Supported saved layouts, transitions, and text treatments on older deliveries.

The newer creation flow currently forces typewriter captions, and its client viewer uses six-second frames. Do not independently change these behaviours in the client viewer. Any agreed adjustment must be aligned with creation preview and checked against saved deliveries.

The creation design step describes the gallery as keeping Veylo's standard design. Preserve its consistent dark presentation; do not unexpectedly apply showcase palette colours to the gallery.

## Demo, creation preview, and published-delivery parity

Public demos are part of the product promise. They must accurately represent the client experience available through creation and publishing.

- Use the same format viewer, shared gallery, responsive layout rules, and motion implementation for demos, creation previews, and published client deliveries.
- Demo photographs, names, messages, and branding can be sample content. For equivalent settings, layout and behaviour must match a real delivery.
- Align cover, opening photograph, selected showcase order, headlines, caption placement and animation, frame layouts, outlined numbering, decorative lines, transitions, controls, closing photograph/message, and gallery handoff.
- Align audio capabilities and playback behaviour with each format's published support. Do not demonstrate audio or motion features that the actual creation flow cannot produce.
- Preserve the same phone, tablet, and desktop presentation behaviour across entry points.
- Use representative supported delivery configuration for demo data. Avoid demo-only presentation branches that make the sample look better or behave differently than a published delivery with equivalent settings.
- Reflect favourites and download permissions accurately. Where an action is simulated, make the demo limitation clear rather than implying a real save or download completed.
- Keep any necessary differences for sample data, preview authentication, analytics, and real download actions outside the shared visual presentation.
- Roll out each presentation improvement to demo, creation preview, and published playback together.

## 1. Opening cover

- Give the selected opening photograph a strong, spacious presentation.
- Arrange studio branding, title, occasion, and approved opening message clearly.
- Keep one prominent Begin the story action.
- Show sound guidance only when audio exists.
- Introduce the photograph, then title, message, and action in a short sequence.
- Connect cover exit and playback entrance without an abrupt layout jump.
- Preserve the existing decorative line treatment and its reveal.

## 2. Caption placement

- Use a flexible caption region directly beneath the photograph as the default on phones and portrait tablets.
- Keep the caption close to the photograph without a large fixed empty area.
- Place controls in a separate dock with comfortable spacing.
- Distinguish the supporting headline from the main caption.
- Preserve the approved wording; do not truncate or rewrite it to make a layout fit.
- Allow longer captions to expand for reading when needed, pausing playback appropriately.
- Use a side-by-side photo and caption layout where the actual viewing area supports it.
- Respect saved explicit caption positions while keeping text within safe, readable bounds.
- Reclaim available photograph space when captions are hidden.
- Keep playback, ending actions, and gallery access available when captions are hidden.
- Check the current 150-character allowance with available fonts at small widths. Make creation guidance match the actual rendering.

## 3. Photograph stage

- Preserve cinema, poster, split, and collage treatments and their visual character.
- Preserve outlined frame numbers, fine lines, borders, and animated reveals in those treatments.
- Balance photograph size, text, decorative features, and controls.
- Keep faces and important photograph details visible during movement.
- Avoid unintended cropping and preserve the original photograph's colour.
- Use chosen colours for surrounding surfaces, text, and accents.
- Keep the existing desktop phone presentation in this first pass.

## 4. Coordinated motion

The objective is richer, better coordinated motion, not a less animated experience.

- Connect cover exit and opening-frame entrance.
- Keep photographs visible during overlapping frame transitions while respecting the selected transition treatment.
- Make previous/next motion follow navigation direction.
- Make swipes respond to the gesture and settle naturally.
- Coordinate outgoing and incoming captions with the photograph transition.
- Keep supported typewriter and other text effects; align any default change across creation and playback.
- Preserve and coordinate outlined numbers and animated line reveals.
- Pause appropriately while a client reads or browses the gallery, and retain the story position when returning.
- Animate gallery opening and closing.
- Expand a thumbnail into its lightbox view and return it to the grid when closed.
- Give buttons and favourites subtle tactile feedback.
- Respect reduced-motion preferences and use lightweight transform/opacity animation where practical.

Initial timing targets: controls 120-200ms, captions 250-400ms, scene transitions approximately 450-700ms where appropriate. Adjust through browser review without overriding saved presentation choices.

## 5. Playback controls and ending

- Use a compact, touch-friendly dock for playback, captions, and gallery access.
- Keep sound and sharing accessible in the header.
- Give the selected closing photograph proper prominence.
- **Keep the three-photo slice ending the user prefers. Refine its layered framing and staggered entrance; show the selected closing photograph in the prominent centre slice. Do not replace this ending with one full-stage photograph.**
- Present the approved closing message, a primary Open your gallery action, and secondary replay.
- Keep gallery access visible when captions are hidden.
- Preserve soundtrack and narration behaviour through the ending.

## 6. Shared gallery

- Keep the consistent dark gallery presentation and studio identity.
- Give the collection title, photo count, download action, and close control adequate space.
- Improve grid spacing and accommodate different photograph proportions while preserving collection order.
- Avoid squeezing captions, favourites, downloads, and photo numbers into one narrow thumbnail row.
- Keep full captions available in the single-photo view.
- Fit the photograph, caption, and navigation within the actual lightbox panel height; fix tablet overflow.
- Keep swipe and keyboard navigation, with a clear current-photo count.
- Restore grid scroll position and focus when returning from a photograph.
- Make Escape return from a photograph to the grid first, then close the gallery.
- Retain permission-aware favourites and add a favourites filter.
- Preserve existing download behaviour; show accurate preparation, download-started, and failure feedback.
- Use responsive images, appropriate thumbnails, and nearby-image preloading without fetching the whole collection.
- Preload and decode the next Photo Story image in the background using the same responsive image candidate as playback. Keep the current photo and caption visible while the next image loads, pause its timer, and allow retry after an image failure.
- Keep progress, studio and client names, logo framing, controls, and borders readable on light and dark story backgrounds. Preserve a contrasting header on the photographic opening cover.
- Verify the shared gallery in every delivery format.

## Implementation order

1. Caption placement and responsive photograph layout, preserving numbers and lines.
2. Cover, playback controls, and coordinated photo/caption/number/line motion.
3. Ending and gallery handoff.
4. Shared gallery and lightbox improvements.
5. Demo-to-creation-preview-to-published-delivery verification and compatibility checks.

## Acceptance checks

- Follow create/edit, choose photographs and order, edit captions, set design/audio, preview, save, reopen, publish, and inspect the client link.
- Verify the approved preview matches the published presentation.
- Compare public demo, creation preview, and a representative published delivery using equivalent configuration. Verify the same layout, captions, numbering and lines, animation, playback controls, audio capabilities, ending, and gallery behaviour.
- Repeat demo/preview/client comparisons at matching phone, tablet, and desktop viewport sizes, including the existing desktop phone presentation.
- Verify every demonstrated feature is available through the actual creation process, and any simulated demo actions are clearly identified.
- Verify outlined numbers, decorative lines, frame borders, and animated line reveals remain present and work across viewport sizes.
- Check 320px and larger phones, 768px and 834px tablets, desktop, short viewport heights, and landscape orientation.
- Check short, maximum-length, missing, expanded, and hidden captions.
- Check portrait and landscape photographs.
- Check audio enabled, skipped, muted, and unavailable.
- Check favourites and download permissions, protected links, and expiry behaviour.
- Check keyboard navigation, focus restoration, reduced motion, and slower image loading.
- Check older deliveries and the gallery across all formats.
- Compare existing delivery functions before and after; resolve regressions before calling the work complete.

## Implementation and validation record

- Photo Story now uses a photograph stage, a flexible caption area, and a separate control dock. Longer captions open for reading with playback paused. Saved top, centre, and right alignment treatments retain safe placement, and hiding captions gives the photograph more space.
- Outlined frame numbers, fine rules, frame borders, and animated line reveals remain. Cinema, poster, split, and collage layouts retain distinct treatments. The cover enters in a short sequence; frame and gallery transitions overlap and follow navigation direction.
- The ending uses three layered photo slices, with the selected closing photograph in the centre. The ending message, replay, and gallery remain accessible with captions hidden. If a saved story has fewer photographs, the composition adapts to the available images.
- Public Photo Story demos now use the same delivery data shape and viewer as creation previews and published links. Demo favourites are explicitly local to the preview.
- The shared dark gallery has spacious collection controls, photograph ratios, a favourites filter, full captions, thumbnail/lightbox transitions, nearby responsive image preloading, and restored grid scroll and focus. Escape returns to the collection before closing the gallery. The full photograph and controls fit the lightbox on short and landscape screens.
- Final browser run: **102 tests passed** across `photo-story-presentation`, `showcase-gallery-swipe`, `delivery-v3`, `delivery-download-access`, and `soundtrack-loop`. Browser API fixtures cover creation/preview/publishing, PIN/expiry responses, downloads and favourites permissions, all eight shared-gallery formats, supported audio, reduced motion, 320–1440px widths, tablets, and short/landscape viewports.
- Production build and responsive contract verification passed. Scoped diff whitespace checks passed. Visual screenshots are saved under `.visual-review/client-ui-audit/`.
- Separate repository check `verify-delivery-v2.mjs` still fails on the dashboard assertion expecting “Some studio information is unavailable”. That dashboard-copy assertion is outside this redesign; the script was not weakened or changed.
- No production deployment was performed as part of this work.

## Follow-up refinements

- Restored the three-photo slice ending, with the chosen closing photo in the centre and a restrained staggered entrance. The composition adapts when fewer photos are available.
- Added a bounded responsive-image cache: decode the upcoming photo in the background, retain the visible photo and caption during loading, pause playback while waiting, and offer retry after a failed image request. Removed the older duplicate preloader and the parent viewer's bulk preload for Photo Story.
- Added contrast-aware colours for studio/client names, initials, logo framing, progress segments, captions, sound status, controls, and focus indicators. The opening photograph keeps its dark scrim and light header.
- Expanded the review to delayed and failed images, stale requests after rapid navigation, delayed closing photos, white/ivory/medium/dark palettes, completed progress segments, and the three-photo ending at phone, tablet, and desktop sizes. Preserved outlined numbering and decorative lines.
- Removed a legacy short-screen rule that hid the photographer's closing message. Compact spacing keeps the message, photographs, replay, and gallery access visible on small phones and landscape screens.
- Validation: all **116 delivery regression checks passed** across the five browser suites (three checks were rerun after Windows sleep interrupted the original run). Eight ending checks passed with the final closing-message fix, including 320×568, 844×390, and 834×600; two were rerun after the preview server stopped. Production build, responsive contract, and scoped whitespace checks passed. These browser checks use API fixtures rather than a production deployment.
- Follow-up scope: the Photo Story viewer, image preparation and contrast utilities, related browser tests, and this plan.
