# Canvas checkpoint implementation

Canvas uses the approved scrolling photo-board composition: irregular framed prints, varied sizes, small rotations, numbered stamps and winding broken lines. Opening and closing copy sit within the board. Additional photos extend the same composition rather than triggering a different gallery layout. The complete gallery remains available immediately.

## Viewer and creation flow

- `CanvasBoard.jsx` serves the public delivery, creator preview and Courage demo through the existing viewer registry. The demo keeps all six original graduation photographs and uses the same saved structure as a delivery.
- Individual checkpoints contain one photograph. Group checkpoints reference an existing creative-direction section. Group members stay visible inline; navigation scrolls to their position. A group can be opened in its own scope, with a button to browse the whole Canvas. Opening an individual photograph browses the complete Canvas.
- `canvasBoardLayout.js` measures the selected fonts, group copy and photo labels before placing prints. Desktop checkpoints share alternating parts of the board, tablet spacing uses its own sizes, and phones follow a staggered winding composition. Groups with more than four photos use the full board width on larger screens. Aligned frames remain available through the existing arrangement setting.
- Connecting paths route through empty space around measured photos, labels and bookends. Group photos have connected anchor dots. Resize and font changes recalculate placement and connections. Group markers and individual markers have different shapes. Lines reveal as the related checkpoints enter view.
- Captions appear in the enlarged photo view. Original numbered circular stamps sit on the photographs; short headlines sit below frames. Group names and optional notes have dedicated space, and tapping the group heading opens its photographs.
- Creator-selected opening and closing photographs remain honoured. A separate framed thumbnail accompanies its bookend if that photograph is not already the first or last photo on the board. Matching edge photographs appear once. This avoids duplicating the same portrait in a large separate hero. Creation helper text describes this Canvas behavior.
- The existing Showcase step contains a Canvas checkpoint editor: combine selected photos, name groups, edit notes, reorder checkpoints, reorder photos within groups, move photos between groups, ungroup, or keep all photos individual. It exposes aligned/staggered frames, note visibility and a live client preview. The next added photo has an explicit destination selector.
- Photo changes use the existing wording review, repair, manual-edit protection and Undo. Canvas group suggestions reuse shoot context and observations; grouping remains optional. Older body notes survive saves and can be reviewed or cleared deliberately.
- Canvas creation accepts **6–18** showcase photographs on both client and server. Uploads outside the showcase remain in the full gallery. Previously saved smaller deliveries still render.

## Saved contract and compatibility

`formatConfig.canvas` contains `version: 1`, `arrangement`, `showGroupNotes` and ordered `checkpoints`:

```json
[
  { "id": "first-portrait", "type": "photo", "assetId": "photo-uuid" },
  { "id": "family-point", "type": "group", "sectionId": "family" }
]
```

Group membership and copy remain in `creativeDirection.sections`. No pixel positions are stored. Server validation checks selected-photo ownership, unique references, nonempty groups and complete coverage. Other formats retain their existing grouping rules. Changes invalidate delivery approval. Restricted links remove hidden checkpoint references alongside hidden group members.

The paired `canvas.js` helpers normalize old records without writing a migration. Meaningful old sections become group checkpoints; the old generic `showcase` section becomes individual checkpoints. Missing, duplicate and foreign references cannot hide or repeat a visible photograph.

## Interaction and loading

Touch swipes, mouse drags, arrow keys, Previous/Next and Escape work in focus. Pointer capture belongs to the stable image container and ignores interactive retry controls. Closing restores focus without moving the page. Nearby images warm through the existing loader; data-saving connections skip Canvas focus preloads. The previous decoded image and its matching caption remain visible while the requested image loads. Failed photos offer retry; a failure does not block the rest of the board.

Scroll arrivals, connection reveals, frame-to-focus transitions and press/hover feedback respect reduced motion. There is no continuous zoom across wall photographs. Navigation stays visible while long focus text scrolls independently. Theme text, numbered stamps, borders and lines remain readable against the selected background, including white. Finished photographs are not recoloured or cropped on the board. The Courage demo uses the approved deep green background; real deliveries use their saved palette.

### Print composition and motion refinements

Staggered frames use deterministic opposing print angles (up to 2.8 degrees on larger screens, gentler on phones), larger lead prints and different diagonal group compositions. A landscape-led pair reserves more width for its wide photograph. Aligned frames retain straight prints and disable scroll depth. The selected order, groups, notes, palette and font roles are unchanged; these refinements need no extra creation settings or saved fields.

Touch boards keep prints fixed during scrolling and pressing. Prints fade into their static angle, with no scroll-depth hooks or positional arrival movement on touch devices. Desktop prints retain short directional arrivals and at most 6px of damped scroll depth; hover lifts the print gently. Captions remain upright. Narrow phones show larger staggered prints; phone boards at least 354px wide use separated diagonal pairs with overlapping vertical positions. Larger screens alternate lead and supporting prints across groups. Aligned frames stay straight.

The board uses layered palette-aware shading, subtle grid lines and stronger print shadows. Connections try sweeping curves through empty space, with rounded obstacle-aware routes as a fallback. Curve samples and reserved rotated corners keep the lines outside photographs. The broken-line pattern, circular numbering, alignment marks and caption rules remain. Group branches reveal as their own photographs enter view rather than all appearing together. These changes use the same renderer in demo, preview and public delivery without adding creation settings.

The existing shared-layout transition now gives the print 480ms to open and return, with the caption arriving after it. Photo navigation, retained decoded images, background preloading, retries and return position use the same existing behaviour. Reduced motion immediately removes the print depth, angles and arrival movement.

## Verification

Browser coverage includes 6, 8, 12 and 18 photographs; individual, grouped and mixed checkpoints; portrait and landscape assets; 320, 768, 834 and 1440px widths; short and landscape viewports; real touch scroll and swipe; mouse drag; keyboard and return focus; group jumps; delayed decode, retained-image swipes and retry; creator grouping, manual copy, Undo, save payload and live preview. Geometry checks verify that every photo and group retains a connection and that frames, captions, headings and bookends stay inside the board without overlap. Separate bookend selections, long group copy and resizing an open delivery are covered. A normal-motion check verifies that connections stay dashed and avoid photo frames. Demo/preview parity and updates to open preview copy are covered.

Cross-format checks cover existing layouts, fonts, gallery completion rules, creation flow and GridBoard swiping. Backend checks cover bounds, compatibility, save/reload, approval invalidation, restricted references, optional group generation and wording protection. Production build and screenshot review are included. Browser verification uses Chromium; it does not claim a physical-device Safari test or a deployed backend round trip.

The other formats' viewer implementations are unchanged by this work. Shared loader fixes prevent stale cached photo metadata, include responsive image sources in readiness keys and clear the delayed loading indicator once an image is ready.
