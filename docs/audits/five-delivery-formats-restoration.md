# Original delivery formats restored

The owner requested improvements within the existing format designs. The replacement layouts exceeded that scope. Canvas, Chapters, Album, Event Coverage and Campaign have been restored to the versions before the redesign, using commit `4b53eba` as the baseline. GridBoard's accepted presentation and the swipe repair in `861ca53` remain.

## Restored behavior

- Canvas: original spatial wall, connecting paths, photo groups and focus view.
- Chapters: original staggered directory cards, numbering, rooms and navigation.
- Album: original photographic cover, book spreads, page controls and music.
- Event Coverage: original hero, highlights, scene navigation and closing presentation.
- Campaign: original hero, sets and file handoff.
- Their original demo photographs and copy, shared demo/client renderers and matching creation flow.
- The previously completed caption policy, regeneration, automatic repair, manual writing protection and Undo. The rejected spread-writing extensions are removed.

The production files `FormatDemo.jsx`, `EventCampaignViewers.jsx`, `viewerRegistry.jsx`, `CreateDeliveryV3.jsx`, `deliveryWritingChanges.js`, `deliveryWritingBlocks.js` and `deliveryV3AI.service.js` match `4b53eba`. The replacement viewer components and presentation editor are removed. GridBoard's Clear filter styling lives in its own stylesheet so removal of the replacement stylesheet does not affect it.

Photo Story, Reveal, Editorial, selected fonts, existing gallery behavior and completion gates remain. Canvas and GridBoard retain immediate full-gallery access. The independent individual/bulk download permission correction remains.

Optional saved presentation schemas remain backward compatible with records saved during the withdrawn redesign. They no longer drive the restored creation controls or five-format renderers. No stored delivery records were migrated or changed.

## Verification

- **58 browser checks passed:** gallery completion, restricted early enlargement, demo/client/creator rendering and selected fonts.
- **60 browser checks passed:** original five-format layouts at 320, 390, 768, 834 and 1440px; real GridBoard touch and mouse navigation, including image loading during a gesture; existing V3 creation and publishing behavior.
- **160 server checks passed:** saved-setting compatibility, ownership, scoped references, download permissions, creation, purpose-led captions, regeneration/repair, manual text protection, Editorial and Reveal.
- Production client build and `git diff --check` passed. Existing bundle-size and mixed-import warnings remain.
- Screenshots reviewed for all five original presentations at 320px and 834px.

Browser APIs and controller dependencies were mocked for the automated checks. This correction restores the original designs; additional improvements within those designs remain pending. No deployment was performed.
