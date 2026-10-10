# Portfolio dashboard and public portfolio improvements

Date: 10 October 2026.

Implements the approved [portfolio audit](portfolio-ui-ux-audit-2026-10-10.md). Changes are in the local workspace; this work did not commit, push or deploy them.

## Photographer dashboard

- Replaced nine main tabs with Work, Studio details, Design, Enquiries and Activity. Settings is a secondary destination. Phones and tablets use a labelled section menu; larger screens use a sidebar.
- Work contains photographs, projects and categories. The existing photographs-first/projects-first homepage choice is now beside the work, rather than hidden in Publishing.
- The compact header shows saved/live state, Preview, Publish and the published link with a copy action. Publish changes is disabled when the published version has no changes waiting.
- Activity totals and explanations are in Activity. The enquiry inbox is available inside the workspace, with its existing standalone address retained. New enquiry counts appear in navigation when available.
- Basic studio information and contact options come before optional About, portrait, logo and process fields. The two stored contact-visibility flags are presented as one switch; existing hidden-contact settings remain hidden.
- New projects start outside the saved draft. Closing an untouched project discards it. The first edit moves it into the normal private autosave flow, so partly completed projects are preserved.
- Project photographs, cover and order precede optional writing fields. Unfinished projects have a visible warning. Publication requirements link to the relevant section or project.
- Photograph labels have their own row. Selection, drag handles and keyboard-accessible reorder buttons remain available. Phone cards use a spacious single column.
- Preview controls stay above a single scrolling portfolio viewport. Scaled previews show their scale.
- Design adjustments and arrangement suggestions are expandable. Suggestion review, dismissal and undo remain available. Removed the contradictory reduced-motion help text; the shared motion policy and photographer-selected Still remain unchanged.

## Public portfolio

- Added a contact action beside the studio name in a sticky header. Configured WhatsApp opens directly with the current portfolio/project/category/service context. Other contact options remain accessible from the phone menu and contact section.
- Moved sharing into navigation. The photographer's existing optional phone enquiry shortcut and showcase-only settings remain respected.
- Refined the opening proportions and supporting sections for Editorial, Cinema, Gallery and Folio. Gallery uses a side-by-side opening on larger screens. Folio keeps its layered covers with quieter angles and shadows.
- Working process and extended service details are expandable. Project pages focus on the shoot, relevant feedback and contact; general studio information remains on the main portfolio.
- Clicking the studio name from a project returns to the main portfolio. Project and category addresses are retained.
- The enquiry form opens on request. Known service/project/category details pre-fill an editable shoot type. Date, location and budget sit under optional shoot details. Closing and reopening the form preserves typed values.
- Retained permission, validation, the honeypot and the existing request ID behavior for safe retries. Server enquiry handling was not changed.
- Shortened the portfolio-only browser storage notice while retaining details and acknowledgement. The observed first-visit notice was 66px high at 390px, compared with roughly 150px in the audit fixture.
- Image source selection now uses measured image widths, with placement-specific initial sizes for covers, portraits and project thumbnails. Full-size viewer images and lazy loading remain. Existing font loading already uses preconnect and `display=swap`; it was retained.

## Review

- An earlier production build completed with the required motion policy verification. Vite reported the existing large-chunk and mixed-import warnings elsewhere in the application. After the final spacing changes, the build could not read Vite's configuration inside the sandbox. Automatic approval review rejected running the final build outside the sandbox because it requires an explicit user request to run a build. The final workspace has not completed that last production build check.
- Inspected the dashboard and all four public designs at 320, 390, 640, 768, 834, 1024 and 1440px. The 1024px inspection used a 600px-tall landscape viewport. No page-wide horizontal overflow or uncaught JavaScript errors appeared in these populated fixtures.
- Closing untouched projects produced no save requests at all seven widths. A separately inspected partial project was saved, reopened from its publication requirement and completed without publishing automatically.
- Confirmed permission is still required before publishing; unchanged published portfolios disable Publish changes.
- Confirmed project-to-home navigation, service form pre-filling, optional fields staying collapsed, form values surviving collapse, form access without WhatsApp and contact routes staying hidden when disabled.
- Category navigation and the photo viewer retained their URL, keyboard close behavior and focus restoration.
- Phone, tablet and short landscape previews kept their outer sheet within the viewport, with the portfolio scrolling inside.
- Scoped `git diff --check` found no whitespace errors. No application test suite was added or run.

Browser review used simulated account/API responses and local example photographs. External requests were blocked, so screenshots may use fallback fonts. No customer records or published portfolios were changed. Production image transfer sizes, live enquiry submission and network performance have not been measured; no bandwidth or speed savings are claimed.

Local review artifacts: [screenshots and observations](../.visual-review/portfolio-polish-2026-10-10/), [layout observations](../.visual-review/portfolio-polish-2026-10-10/observations.json) and [workflow observations](../.visual-review/portfolio-polish-2026-10-10/followup.json).

## Deployment

Deploy the usual client build when ready. These changes require no new service, environment variable, database migration or paid integration. Existing server ownership checks, private drafts, explicit publication, Pro restrictions and media-access checks remain in place.
