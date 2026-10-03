# Canvas checkpoint implementation

Canvas now scrolls from its opening photograph through a connected board to the closing message. It keeps framed photographs, varied sizes, numbering, small rotations, shadows and broken connecting lines. Additional photos extend the board rather than triggering a different gallery layout. The complete gallery remains available immediately.

## Viewer and creation flow

- `CanvasBoard.jsx` serves the public delivery, creator preview and Courage demo through the existing viewer registry. The demo keeps all six original graduation photographs and uses the same saved structure as a delivery.
- Individual checkpoints contain one photograph. Group checkpoints reference an existing creative-direction section. Group members stay visible inline; navigation scrolls to their position. A group can be opened in its own scope, with a button to browse the whole Canvas. Opening an individual photograph browses the complete Canvas.
- Connecting paths use measured checkpoint positions. Desktop connections follow outside gutters and gaps between checkpoints; phones use a vertical route. Resize and font changes recalculate the paths. Group markers and individual markers have different shapes.
- Captions appear in the enlarged photo view. Numbers and short headlines sit below frames. Group names and optional notes have dedicated space.
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

Scroll arrivals, connection reveals, frame-to-focus transitions and press/hover feedback respect reduced motion. There is no continuous zoom across wall photographs. Navigation stays visible while long focus text scrolls independently. Theme text and line contrast derive from the selected palette; finished photographs are not recoloured.

## Verification

Browser coverage includes 6, 8, 12 and 18 photographs; individual, grouped and mixed checkpoints; portrait and landscape assets; 320, 768, 834 and 1440px widths; short and landscape viewports; real touch scroll and swipe; mouse drag; keyboard and return focus; group jumps; delayed decode, retained-image swipes and retry; creator grouping, manual copy, Undo, save payload and live preview. A normal-motion check verifies that connections stay dashed and avoid photo frames. Demo/preview parity and updates to open preview copy are covered.

Cross-format checks cover existing layouts, fonts, gallery completion rules, creation flow and GridBoard swiping. Backend checks cover bounds, compatibility, save/reload, approval invalidation, restricted references, optional group generation and wording protection. Production build and screenshot review are included. Browser verification uses Chromium; it does not claim a physical-device Safari test or a deployed backend round trip.

The other formats' viewer implementations are unchanged by this work. Shared loader fixes prevent stale cached photo metadata, include responsive image sources in readiness keys and clear the delayed loading indicator once an image is ready.
