# Site UX and responsive audit

27 September 2026

## Scope and method

I checked the homepage; Formats; Portfolio; Client experience; Pricing; Portraits, Weddings, Birthdays, and Commercial pages; About us; Privacy; Terms of use; Fair use; account creation and sign-in; onboarding; dashboard; settings; billing; library; sharing; the portfolio editor; and a published portfolio. I also checked the related password and verification pages.

The browser sweep covered 27 routes at 320, 390, 768, 834, 1024, and 1440 pixels: 162 route and viewport checks in headless Chrome. I also inspected 320 × 568 and 1024 × 768 layouts, opened the public mobile menu, and tried keyboard use of the portfolio photo picker. Protected pages used a mocked Pro account and sample portfolio. This checks the rendered interface and local code; it does not test a real payment, upload, or network connection.

**Measured result:** none of the 162 checks produced page-wide horizontal scrolling. That is a useful baseline, but several controls are hidden, covered, too small, or misleading despite the page fitting the viewport.

## Fix these first

| Priority | Finding and evidence | Recommended change |
| --- | --- | --- |
| Blocker | The portfolio editor's closed full-screen preview still has computed `display: flex`. Browser check: `dialog.open === false`, yet the preview covers the editor and intercepts clicks. See [preview CSS](../client/src/pages/ManagePortfolio.css), [blocked 320px view](../.visual-review/site-audit/portfolio-manage-320.png), and [editor with the closed overlay hidden only in the audit browser](../.visual-review/site-audit/portfolio-manage-fresh-320.png). | Ensure the dialog has `display: none` when it lacks `[open]`, then retest every editor control and the open/close transition. |
| High | At 320px, Dashboard and Settings have **no visible account navigation links**. The rule at `max-width: 374px` hides the first link, even when it is the only link. The sign-out text also disappears, leaving an icon button without a dependable accessible name. See [ProductHeader](../client/src/components/ProductHeader.jsx) and [responsive header CSS](../client/src/styles/public.css). The public header and its mobile menu do work; [menu screenshot](../.visual-review/site-audit/public-menu-320.png). | Give signed-in users a real mobile account menu with Dashboard, Settings, Billing, Library, Portfolio, and Sign out. Give icon buttons explicit labels. |
| High | The Veylo Help launcher covers the fixed **Publish portfolio** button at 320px and 1024px. Its z-index is 80; the editor's fixed publish bar is 50. See [assistant CSS](../client/src/components/VeyloAssistant.css), [editor CSS](../client/src/pages/ManagePortfolio.css), and [short phone screenshot](../.visual-review/site-audit/portfolio-manage-fresh-320-568.png). | Move or hide the launcher when a fixed action bar is present, and leave clearance above the bar when the assistant is open. |
| High | Opening the portfolio photo picker leaves keyboard focus on **Add photographs** behind the modal. Pressing Escape does not close it. This was reproduced at 320px and 834px after hiding the unrelated preview overlay in the audit browser. See [picker markup](../client/src/pages/ManagePortfolio.jsx). | Use a native dialog or the existing dialog-focus helper. Focus the picker heading or first photo, trap focus, close on Escape, and restore focus to the opener. |
| High | On an already published portfolio, **Suggest a direction** calls `save(false)` before starting the AI job. The server saves into the same published record, so other pending edits go live before the suggested direction is reviewed. See [editor action](../client/src/pages/ManagePortfolio.jsx) and [portfolio update](../server/src/controllers/portfolio.controller.js). | Separate unpublished changes from the live version. Review the suggested result, then explicitly apply and publish it. Show which version clients currently see. |
| High | The portfolio picker renders one flat list. The server loads every published delivery with its assets, then adds up to 200 library items; there is no pagination or search. A Pro studio can have many deliveries of up to 500 photos each. See [source endpoint](../server/src/controllers/portfolio.controller.js) and [picker grid](../client/src/pages/ManagePortfolio.jsx). | Browse by delivery or library, add search and filters, request pages of thumbnails, and support bulk selection. |

## Portfolio creation and publishing

The editor currently asks for studio details, photographs, design, and contact details on one long page. At 320px, the embedded preview begins about **5,000px below the top**; at 834px it begins about **4,000px below**. At 1024px it is still below the form because the side-by-side workspace begins only at 1200px. The page fits the screen but makes it hard to judge edits as they are made.

The **Publish portfolio** button is active even when the required bio or four photos are missing. Clicking it produces a toast, with no checklist, inline field message, or jump to the missing section. The server correctly validates the minimum. The UI should show what remains before offering publication. See [publish action](../client/src/pages/ManagePortfolio.jsx) and [server publish check](../server/src/controllers/portfolio.controller.js).

The editor starts with the **Desktop** preview tab selected, including on a 320px phone. The preview is constrained by the editor's available width, so a tab labelled Desktop can render at phone or tablet width. A real device preview needs a known canvas width or a scaled frame, plus an easy full-screen preview on phones. See [preview state and controls](../client/src/pages/ManagePortfolio.jsx) and [preview sizing](../client/src/pages/ManagePortfolio.css).

Photo arrangement uses one-step up/down buttons for each photograph. With a 50-photo portfolio, moving an image far through the list is laborious. Category text must be entered photo by photo. Add reorder controls that work with touch and keyboard, bulk category assignment, and a quick **Make cover** action. Keep original photographs unchanged.

AI direction replaces the current local order, cover, headline, and styling without a visible before/after comparison or one-click undo. Keep the photographer's version as a recoverable draft and present suggestions as choices. Also show an unsaved-changes indicator before navigation.

The portfolio studio name and the account studio name share a change cooldown, but changing the name in the portfolio editor updates the portfolio record and the cooldown without updating the account's studio name. Account Settings can therefore show a different name while its field is locked. Decide whether these are one identity or intentionally separate names, then make the rule and UI consistent. See [portfolio update](../server/src/controllers/portfolio.controller.js) and [account profile update](../server/src/controllers/auth.controller.js).

Publication currently requires a bio and four photos, but it can go live without a WhatsApp or Instagram contact route. That may be intentional for some studios; show a clear warning before publishing when **Contact section** is enabled but no contact method will appear. The public page currently omits the contact section in that state. See [publish checks](../client/src/pages/ManagePortfolio.jsx) and [public canvas contact logic](../client/src/pages/PortfolioCanvas.jsx).

**Proposed editor flow:**

1. **Studio identity:** name, address, short introduction, contact route; check address availability before later work.
2. **Choose work:** browse published deliveries and library separately, search, select, set cover, and group work into categories.
3. **Arrange:** reorder, batch-edit labels, and see a simple selection summary.
4. **Design:** choose layout, color, typography, spacing, and optional AI suggestions with undo.
5. **Review and publish:** phone/tablet/desktop preview, readiness checklist, and a clear distinction between a saved draft and the live version.

## Page-by-page recommendations

| Page | What the audit found | Improvement |
| --- | --- | --- |
| Homepage | At 320px, the **Get started** action follows the large format animation, so the first screen offers no direct next step beyond the header. The hero shows six core formats while other copy says eight. See [hero order](../client/src/pages/LandingPage.jsx) and [hero formats](../client/src/components/HeroFormatStage.jsx). | Put one short explanation and the primary action beside the headline on phones. Label the hero as six examples and lead clearly to all eight formats. |
| Formats | The page fits 320px and 834px, with useful photography. The first screen spends most of its height on the intro and visual. | Add an early **Choose a format** jump link and a compact guide showing what the client does in each of the eight formats. Keep links to live demos close to each format. |
| Portfolio marketing page | The first phone screen is almost entirely headline and artwork. The main create-account action appears much later. Its **Copy address** control copies a hardcoded sample address. See [hero and copy handler](../client/src/pages/PortfolioPage.jsx). | Put **See a live example** and a context-aware **Create/Edit your portfolio** action near the top. Do not present a sample address as the visitor's address. |
| Client experience | The section headed **Six ways to open a shoot** maps over eight formats, but its action-label array has only six entries. Event Coverage and Campaign Delivery get empty action labels. See [action list](../client/src/pages/ClientExperience.jsx). | Write eight truthful client actions and show how the last two formats differ from the first six. |
| Pricing | Free/Pro limits, 100/500-photo caps, and storage distinction are present and readable. On a phone, the actual plan action is well below the large intro. | Show the two plan choices and one signup action sooner; keep the full comparison and fair-use explanation below. |
| Portraits, Weddings, Birthdays, Commercial | All four routes rendered without horizontal overflow. They share a long editorial template; the recommended format and demo are below the first mobile screen. | Put the recommended format and its demo action directly after the shoot-specific headline. Keep copy grounded in that shoot type. |
| About us | Readable at tested widths, but repeats some landing-page claims before offering a route to the team. | Make the people behind Veylo and the contact route easier to find near the top. |
| Privacy, Terms of use, Fair use | Shared policy layout fits all tested widths. On a 320px phone, the full section index consumes the first screen before the first policy paragraph. See [PolicyPage](../client/src/components/PolicyPage.jsx). | Replace the mobile index with a compact **On this page** control and a short plain-language summary. Keep direct section links and full text available. |
| Fair use specifically | The examples list six formats and omit Event Coverage and Campaign Delivery, while the product and pricing pages say eight. See [FairUsePolicy](../client/src/pages/FairUsePolicy.jsx). | Update the examples and ensure the 3-delivery Free limit, 100/500-photo caps, and Pro fair-use wording agree across policy, pricing, and billing. |
| Create account | Form controls fit 320px, but the benefits, Google action, and long form push email signup far down. The mobile-only visible form title is an `h2` because the `h1` sits in a hidden desktop visual. Password mismatch is shown as a form-wide error after submit. See [SignupPage](../client/src/pages/SignupPage.jsx). | Make the visible title the page `h1`, shorten the top summary on phones, and show password requirements and mismatch beside the fields. |
| Sign in and recovery | Sign-in is readable at 320px; the same hidden-`h1` pattern applies. Recovery pages fit the tested widths. | Use a visible `h1` in each form and keep error and recovery links close to the affected field. |
| Onboarding | At 320 × 568, the three-step overview fills the first screen and the first form is below it. Step 3 requires an answer about how the user found Veylo before they can reach the dashboard. See [OnboardingPage](../client/src/pages/OnboardingPage.jsx). | Put the current task first on phones, reduce the overview to a slim progress line, and let photographers skip the referral question. |
| Dashboard | At 320px and 834px, plan and metrics appear before the primary **New delivery** action. The plan card names the limit but does not show remaining deliveries. See [Dashboard](../client/src/pages/Dashboard.jsx). | Put the creation action near the greeting, with the same quota-disable rule already implemented. Show `2 of 3 used` and the reset period for Free; keep the delivery list prominent. |
| Settings | Profile fields fit the tested widths, but the opening copy leads with permanent deletion and the page is long. At 320px, the header has no visible route to Settings or Dashboard. See [AccountSettings](../client/src/pages/AccountSettings.jsx). | Lead with account and studio tasks, add section navigation, and keep deletion in a clearly separate final section. Fix the shared mobile account header. |
| Billing, library, sharing | These related pages rendered without page-wide horizontal overflow. The same account header and floating-help positioning apply. | Use the shared mobile navigation and test fixed help placement against page-specific actions and dialogs. |
| Published portfolio | The public portfolio uses the same canvas component as the editor and fits 320px in the sample check. Its contact section disappears when no method is present. See [PortfolioCanvas](../client/src/pages/PortfolioCanvas.jsx). | Keep the photo-first layout, but verify every chosen design at phone, tablet, and desktop widths and warn before publishing a page with no enquiry route. |

## Site-wide copy and interaction checks

- The product now has eight formats. [Footer](../client/src/components/Footer.jsx) still says **Six ways to deliver it**; [Client experience](../client/src/pages/ClientExperience.jsx) says **Six ways** and leaves two card titles blank; [Fair use](../client/src/pages/FairUsePolicy.jsx) lists only six. Use one shared format source where practical and check all public claims when formats change.
- The public phone menu opens and contains the main pages. The missing mobile navigation report applies primarily to the signed-in product header. Screenshots: [public menu](../.visual-review/site-audit/public-menu-320.png), [dashboard at 320px](../.visual-review/site-audit/dashboard-320.png).
- Several portfolio design helper labels are 8–10px at phone width. They fit but are hard to read in [the 320px design controls](../.visual-review/site-audit/portfolio-design-320.png). Raise helper copy to a readable size and use fewer choices per row when needed.
- Any floating help control should yield to a page's primary action, cookie banner, picker, and dialog. Test this at short phone heights as well as widths.

## Recommended implementation order

1. **Unblock the current experience:** hide the closed portfolio preview, restore mobile account navigation, fix the picker keyboard flow, and move help away from fixed actions.
2. **Rebuild portfolio setup:** use the five-step flow above, paginated source browsing, real device previews, inline readiness checks, reversible AI direction, and separate draft/live versions.
3. **Improve public decisions:** move the homepage and Portfolio calls to action up on phones; clarify all eight formats in Client experience, Footer, and Fair use; simplify policy navigation on phones.
4. **Verify before release:** retest 320, 390, 768, 834, 1024, and 1440px, plus 320 × 568 and 1024 × 768; keyboard and screen-reader names; focus order; modal Escape behavior; no clipped actions; and real accounts with empty, busy, published, and Free-limit states.

The portfolio editor blocker and mobile account navigation should be fixed before treating the current experience as responsive and ready to publish.
