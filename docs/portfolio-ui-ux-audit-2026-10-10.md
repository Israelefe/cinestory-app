# Portfolio dashboard and public portfolio audit

Date: 10 October 2026.

## Recommendation

Simplify the photographer's editor, fix the project creation flow, and make it easier for a visitor to browse relevant work and contact the photographer. The current portfolio already has enough features for this round of work. Its next improvement should come from clearer organisation and better presentation.

This is an audit and a proposed implementation plan. Application code, customer records and deployed settings were not changed.

## What was reviewed

- The photographer's Work, Categories, Projects, Studio, Services, Client feedback, FAQs, Design and Publishing screens.
- Photo selection, project creation, publication checks, private previews and the enquiry inbox.
- The public Editorial, Cinema, Gallery and Folio designs, including category browsing, project pages, contact routes and the enquiry form.
- Draft and publication handling, public payload filtering, media presentation and the supporting server contracts.

Browser inspection used the current local application, simulated account/API responses and local example photographs. The editor and all four public designs were inspected at 320, 390, 640, 768, 834, 1024 and 1440px. Additional checks covered a 1024×600 landscape viewport, first-visit notices, phone/tablet dialogs, category navigation, the photo viewer and enquiry context. The representative populated portfolio contained 12 photographs, two projects, two services, two sample testimonials, three process steps and three FAQs. The sample testimonials are fictional inspection data.

Screenshots and observations are in [.visual-review/portfolio-audit-2026-10-10](../.visual-review/portfolio-audit-2026-10-10/). The main records are [results.json](../.visual-review/portfolio-audit-2026-10-10/results.json) and [interactions.json](../.visual-review/portfolio-audit-2026-10-10/interactions.json).

External requests were blocked during inspection. The screenshots therefore include browser fallback fonts where externally hosted fonts were unavailable. Pixel measurements describe these local fixtures, not every photographer's content. Production network speed, Cloudflare responses, live enquiries and accessibility with assistive technology were not measured. No application test suite or production build was run for this audit.

## What is already useful

- Four visibly different photographic designs and previews using the photographer's own selection.
- Private autosaving, explicit publishing, draft conflict handling and browser recovery.
- Original photographs remain unchanged. Captions, crop focus and presentation are separate choices.
- Category addresses, individual project links and enquiries carrying the selected service/project context.
- A working category-scoped photo viewer: keyboard navigation, Escape and focus restoration worked in the inspected flow.
- An optional enquiry inbox with owner-scoped server queries and New/Replied/Closed statuses.
- Optional business sections and a project-first homepage setting already exist. These do not need to be invented again.
- No page-wide horizontal overflow or uncaught JavaScript errors appeared in the inspected default layouts. The editor's horizontally scrolling tab strip is a separate usability issue described below.

The redesign should retain the existing draft/publication and permission boundaries. The source review found ownership checks, current publication checks and filtering of hidden public content; this is not a claim that a complete security assessment has been performed.

## Photographer dashboard findings

### D1. Closing a new, untouched project leaves a publishing blocker — high priority

**Reproduced:** Open Projects, press Add project, then close the details sheet without entering anything. An empty project is added to the private draft and autosaved. Publishing then reports “Give each project a title” and “Add photographs to each project.”

The project is created in shared form state before the sheet opens. Closing the sheet clears its selected ID but does not discard the untouched project. This differs from the photo picker and category sheet, which have explicit commit actions.

**Change:** An untouched new project should be discarded on cancellation. Once a project contains work, preserve that work with a clear unfinished state and an explicit decision before discarding it. Show publication blockers beside the affected project, with an action to finish or remove it.

Source: [ManagePortfolio.jsx](../client/src/pages/ManagePortfolio.jsx), project creation around lines 434–448 and the project sheet around line 512; [portfolio publication validation](../server/src/utils/portfolio.js).

### D2. The editor begins too far down the page — high priority

Before reaching the work, the photographer sees the page introduction, save status, assistant/preview/publish controls, a publication panel, five activity totals, an activity details panel and the editor tabs.

In the populated local fixture, the editing area began about **1,113px down at 390px**, **867px at 834px**, and **731px at 1440px**. A photographer on a phone must scroll before seeing the main editing controls. These positions remain a problem after dismissing the browser storage notice.

**Change:** Use a compact workspace header with saved/live status and Preview/Publish actions. Open directly into Work. Move the full activity report to its own view, and move Make private into portfolio settings with its existing confirmation. Keep the public address easy to copy and open.

Evidence: [phone dashboard](../.visual-review/portfolio-audit-2026-10-10/editor-work-390.png), [tablet dashboard](../.visual-review/portfolio-audit-2026-10-10/editor-work-834.png).

### D3. Nine top-level tabs make important screens hard to find — high priority

The nine labels require about **905px** in the inspected font configuration. The phone strip has only **350px** available and the 834px tablet has **778px**. Publishing and other later screens disappear off the right without an explanatory navigation cue.

**Change:** Group related work into fewer main destinations. Use a section menu on phones and tablets, and a restrained navigation column on larger screens. Categories and Projects belong with Work; feedback and FAQs belong with studio content. Navigation should reveal the current section without requiring a sideways search.

Source: [tab definitions and rendering](../client/src/pages/ManagePortfolio.jsx), lines 32 and 408; [tab styling](../client/src/pages/ManagePortfolio.css).

### D4. Optional studio details come before the basics — high priority

Studio opens with specialties, a longer biography, service areas, travel information, portrait/logo controls and the working process. Only after those does it show the studio name, public address, short introduction, location and contact fields.

With three process steps, the WhatsApp field appeared around **5,305px down on a phone** and **3,039px on the tablet**. A photographer trying to correct a contact number has to pass unrelated material.

**Change:** Put name/address, short introduction, location and contact details first. Present a longer About section, portrait/logo, travel and working process as optional, collapsible groups. Clearly distinguish the short introduction from the longer About text. Preserve existing text when reorganising these controls.

Source: [PortfolioStudioExtras](../client/src/components/PortfolioContentEditor.jsx) appears before the basic Studio form in [ManagePortfolio.jsx](../client/src/pages/ManagePortfolio.jsx), around lines 420 and 452.

### D5. A project asks for extensive writing before photo selection — high priority

The project sheet places shoot type, city, venue, brief, approach, credits, notes and related projects before its photograph picker. On the phone, the first photo selection controls were about **1,851px down inside the opening sheet**; the sheet's visible height was about 812px.

**Change:** Start with project title, photographs, cover and order. Keep the introduction close to those controls. Put the remaining context under an optional “More about this shoot” section. Keep completion actions available without scrolling through the entire form.

Source: [project sheet](../client/src/pages/ManagePortfolio.jsx), around line 512, and [PortfolioProjectExtras](../client/src/components/PortfolioContentEditor.jsx).

### D6. Photo cards fit the phone but their labels are cramped — medium priority

At 390px, two cards fit across. However, the checkbox and drag handle leave approximately **36px** for the title/category button. Labels become “Port…” or “We…”. Each card also has a separate row of reorder arrows, making short photo labels compete with several controls.

**Change:** Give the photograph and its label clear space. Put selection on the photo in an accessible control, place the full label on its own row, and reveal secondary actions when a card is selected or opened. Keep keyboard-accessible reorder controls; do not rely on dragging alone or on hover.

Evidence: [phone photo cards](../.visual-review/portfolio-audit-2026-10-10/editor-photo-cards-390.png). Source: [PhotoTile](../client/src/pages/ManagePortfolio.jsx), around line 45, and [card styles](../client/src/pages/ManagePortfolio.css).

### D7. Contact and visibility controls are scattered — medium priority

WhatsApp/Instagram are in Studio. Email, form settings, showcase-only mode and the mobile enquiry shortcut are in Publishing. Contact visibility is in Design. The same inbox is linked from Publishing and again below every editor section.

**Change:** Give contact details and enquiry availability one clearly named home. Make Enquiries a first-class destination with its new-message count. Keep one contextual shortcut to the inbox. Group section visibility, homepage arrangement and design choices together; place share metadata and address controls in settings.

There are also two ways to suppress contact: hiding contact links and showcase-only mode. Present one understandable user-facing choice and map it safely to existing stored values.

### D8. Publishing feedback arrives late — medium priority

The main Publish changes button stays enabled when the current published draft has no changes. Most missing-content messages only appear after opening the publish dialog; they do not take the photographer to the relevant field.

**Change:** Distinguish Saved privately, Unpublished changes and Live. Indicate when no update is needed. Show unfinished optional entries where they were created and link publication checks to the relevant section. Preserve the existing permission confirmation and revision checks.

### D9. The preview has two competing scroll areas — medium priority

The preview sheet scrolls, and the embedded portfolio has its own scroll area. At 390×844, the controls plus the fixed `62dvh` preview made the outer content about 906px tall inside an approximately 812px sheet. The photographer has to manage both scrolling surfaces. A desktop preview scaled into a phone is also too small to judge fine typography.

**Change:** Keep the preview title, close action and device controls in a stable header. Give the portfolio the remaining height and one clear scroll area. Label a desktop preview on a phone as scaled, and provide a larger viewing option where practical.

Source: [Preview](../client/src/pages/ManagePortfolio.jsx), around line 79, and [preview styles](../client/src/pages/ManagePortfolio.css), around line 613.

### D10. Some copy and configuration need cleaning up — lower priority

- The Design screen says visitors' reduced-motion preferences are always respected. [The shared motion policy](../client/src/utils/motionPolicy.js) deliberately keeps Veylo motion active regardless of that device preference. Correct the copy while retaining photographer-selected Still and explicit pause choices.
- “Category cover” is used for category sharing metadata, but the current category page does not display it as an opening cover. Clarify the label as a sharing image or deliberately implement a visible category cover.
- The stored `direction.layout` values have no matching layout rules in the current public canvas; `content.galleryArrangement` and the selected design control the visible arrangement. Treat removal as compatibility cleanup, not a new feature.
- Most design changes are described by a long block of help text. Use shorter contextual explanations and avoid repeating information around every control.

## Public portfolio findings

### P1. Make contact easier to reach without making the opening crowded — high priority

On phones, the public header puts its navigation inside a menu. The opening Enquire action follows the cover, headline, introduction and location/specialties. In the 390×844 returning-visitor Editorial fixture, that button began around **826px**, leaving most of it below the first screen. First-time visitors also see the storage notice above the portfolio.

The optional mobile enquiry shortcut exists but starts off by default. Header and opening enquiry actions currently scroll to the contact section; they do not directly open WhatsApp.

**Change:** Keep a clear, compact contact action available near the studio name or while browsing. Where WhatsApp is configured, let it be a direct primary route with the current project/category context. Keep the form and alternative contact channels available as secondary choices. Respect showcase-only mode and existing photographer preferences.

Source: [public header, opening actions and mobile shortcut](../client/src/pages/PortfolioCanvas.jsx), around lines 195–217.

### P2. The homepage becomes long when all optional sections are filled — high priority

In the 12-photo sample, populated phone pages were approximately **8,100–10,800px** tall. Editorial's contact section began around **8,962px**. Services, feedback, working process, FAQs and a fully expanded enquiry form add a substantial amount after the photographs.

These are content-dependent measurements, not a claim that long photography pages are inherently wrong. The issue is that every kind of content has similar prominence and enquiry details always come last.

**Change:** Let photographs remain prominent while giving visitors earlier, direct access to projects, services and contact. Keep optional information brief by default. Fold the working process into About or an expandable explanation. Show the full form when requested rather than making every visitor pass all its fields. Help photographers choose a focused main selection and use projects for fuller shoots.

### P3. Project-first presentation already works, but is hard to discover — medium priority

With the default main-gallery-first arrangement, both sample project cards became text-only because their covers were already used in the gallery. This follows the current rule against repeating photographs; it is not a missing-image error.

Switching the existing homepage setting to Projects first produced two visual project cards in the inspected example.

**Change:** Move this choice beside Work/Projects and show the result immediately in preview. Offer clear descriptions of a photo-led or project-led homepage. Preserve excluded photographs and the existing duplicate-image rules unless an explicit alternative is approved.

Source: [portfolioPresentation.js](../client/src/services/portfolioPresentation.js). Evidence: [default project links](../.visual-review/portfolio-audit-2026-10-10/public-editorial-projects-390.png) and [project-first cards](../.visual-review/portfolio-audit-2026-10-10/public-project-led-390.png).

### P4. The enquiry form asks too much at once — medium priority

The form exposes eight information fields plus permission: name, reply method, reply address/number, shoot type, date, location, budget and message. Optional date/location/budget are mixed into the main flow. The sample service enquiry displayed “Birthday portraits” as context, but the required “What are you planning?” input remained blank.

**Change:** Start with name, reply details and a short message. Pre-fill an editable shoot type when a service or project already supplies it. Put date, location and budget under “Add shoot details” or a similar optional group. Preserve permission, validation, duplicate-submission protection and typed values after a failed request.

Keep direct WhatsApp usable without completing the form. Retain one clear explanation that an enquiry does not confirm a booking, rather than repeating that statement throughout the same flow.

Source: [PortfolioEnquiryForm.jsx](../client/src/components/PortfolioEnquiryForm.jsx) and the [enquiry server contract](../server/src/controllers/portfolioEnquiry.controller.js).

### P5. The studio name does not return home from a project — medium priority

**Reproduced:** Open a project and click the studio name in the header. The URL and project remain unchanged; the link scrolls to the top of that project. A separate Back to portfolio link does work.

**Change:** Make the studio name/logo return to the main portfolio from project pages. Keep project and category navigation consistent with browser Back and the existing public addresses.

Source: [PortfolioCanvas.jsx](../client/src/pages/PortfolioCanvas.jsx), public brand link around line 198.

### P6. Supporting sections should belong to the selected design — medium priority

The openings differ, but About, services, feedback, process and the enquiry form largely use the same visual structure. They can feel attached to the photographic design rather than part of it. Project pages also repeat most homepage business sections after the project photographs.

**Change:** Give supporting content the selected design's typography, spacing and border treatment. Keep project pages focused on the shoot, relevant feedback, related work and contact. Give visitors access to general studio information without repeating the entire homepage on every project page.

| Design | Specific polish |
| --- | --- |
| Editorial | Retain the offset photographs and clear typography. Tighten the mobile opening enough to expose identity and a useful next action. Use quieter service rows and short supporting text. |
| Cinema | Retain the large cover and swipeable photo strip. Balance the headline against the photograph at tablet widths and with long titles. Keep controls clear without making text dominate the picture. |
| Gallery | Retain the frames and natural proportions. Reduce the height of the combined opening cover/headline area: in the desktop sample, the headline began around 818px and the primary opening enquiry action around 1,117px. |
| Folio | Retain its collection-oriented character. Make project-first presentation easy to choose. Review the frame angles and shadows so they support the photographs and do not dominate them. |

### P7. First-visit information still takes considerable space — medium priority

The public storage notice is already in normal page flow, so it does not cover the headline as an older notice did. It still occupies roughly **150px on a phone** in this inspection, before the photographer's header.

**Change:** Use a shorter, dismissible notice with clear access to details. Preserve the disclosure and its acknowledgement. Coordinate its position with any enquiry shortcut; do not stack several fixed panels over photographs or form controls.

Source: [CookiePreferences.jsx](../client/src/components/CookiePreferences.jsx) and its portfolio-specific styles.

### P8. Image sizing deserves a separate performance pass — medium priority

Public photographs mostly share one `sizes` declaration: `45vw` on desktop, `48vw` on tablet and `94vw` on phones. Yet phone photographs in the inspected paired layouts were often approximately **141–167px** wide. Their declared phone slot was about **367px** at a 390px viewport.

**Change:** Match image sizes to their actual placement: cover, paired image, framed image, project thumbnail or strip. Retain responsive sources, lazy loading and larger lightbox images. Measure real selected variants and transfer sizes through Cloudflare before claiming a speed or bandwidth improvement.

Source: [Photograph](../client/src/pages/PortfolioCanvas.jsx), around line 13. This is a confirmed layout/declaration mismatch; production byte savings were not measured.

## What to remove, move or keep

| Item | Recommendation |
| --- | --- |
| Five activity totals and the detailed activity panel above editing | Move to Activity. A small summary may remain available without pushing Work down. |
| Nine independent top-level tabs | Replace with grouped navigation. |
| Repeated enquiry inbox links | Replace with one visible Enquiries destination and contextual settings links where useful. |
| Long working-process editor before basic studio details | Move into optional About content; keep it collapsed until needed. |
| Extensive project context before photo selection | Move below the photographs into optional details. |
| Every optional enquiry field visible immediately | Reveal when requested. |
| Share competing with enquiry in the main opening action row | Keep sharing as a quieter action in the header/menu. |
| AI arrangement panel permanently occupying Design | Keep the existing suggestions capability behind a deliberate secondary action; preserve review and undo. Do not duplicate the assistant entry unnecessarily. |
| Unused layout configuration and contradictory help copy | Clean up with compatibility checks. |
| Services, real feedback, FAQs, category links and project pages | Keep. Make them optional and easier to manage. There is no evidence from this audit to justify deleting these capabilities or photographers' existing content. |
| Four designs, contact routes, private drafts and explicit publishing | Keep and polish. |

## Proposed dashboard structure

| Main destination | Contents |
| --- | --- |
| Work | Photographs, ordering, cover, categories, projects and photo-first/project-first presentation. |
| Studio details | Short introduction, location and contact first; optional About, services, feedback, FAQs and working process. |
| Design | Four designs, preview and a small set of useful adjustments. Secondary settings stay collapsed. |
| Enquiries | Inbox, new-message count and reply actions. A clear link leads to contact/form settings. |
| Activity | Visits, work interest, contact clicks and submitted enquiries, with their existing definitions. |

A compact header should expose the public address, saved/live state, Preview and Publish. Portfolio settings can hold share metadata, address changes and Make private. Phone/tablet navigation should use a clear section menu rather than squeezing every destination into one row.

## Implementation order, for approval

1. **Fix workflow problems:** untouched projects, late publication blockers, project photo selection order, basic Studio field order and project-to-home navigation.
2. **Restructure the dashboard:** grouped navigation, compact status/actions, separate Activity and visible Enquiries. Improve photo cards and preview scrolling at the same time.
3. **Polish the public portfolio:** contact access, opening proportions, useful project presentation, a shorter optional form and supporting sections that fit each design.
4. **Review performance and release behavior:** accurate image sizes, font loading and first-visit notices; verify on real hosted media after the UI is agreed.

The first implementation should reorganise existing capabilities and preserve published content. No new provider, additional server or paid integration is proposed for this UI work.

## Acceptance checks for the implementation

- Work and its primary action are reached promptly on a phone, without an activity report above them.
- All sections can be found without guessing that navigation scrolls sideways.
- Contact details are near the beginning of Studio, regardless of the number of process steps.
- Creating and cancelling an untouched project does not leave a publication blocker. Partly completed work is not discarded silently.
- Project photographs, cover and order come before optional writing fields.
- Phone photo labels remain useful, with practical selection and keyboard-accessible reorder controls.
- Preview has stable controls and one main scrolling surface within its available height.
- Public visitors can browse relevant work and start an enquiry without traversing the full page.
- Existing project/category URLs, browser Back, photo viewer focus and contextual enquiries remain correct.
- Enquiry simplification preserves validation, permission, safe retries, saved messages and owner-only inbox access.
- Drafts remain private until explicit publication. Access revocation, Pro restrictions and current public media checks remain in force.
- Photographer-selected Still and other explicit controls remain respected; device preferences do not suppress Veylo motion.
- Check 320, 390, 640, 768, 834, 1024 and 1440px, short landscape views, keyboard access, long content, empty states, slow requests and failed saves.

Application changes should follow approval of this plan. This audit does not publish or remove any photographer's portfolio content.
