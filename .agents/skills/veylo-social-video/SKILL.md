---
name: veylo-social-video
description: Plan, script, design, and render social promo videos for Veylo with Remotion, grounded in the current app, product, and brand assets.
---

# Veylo Social Video

Use this skill when the user wants a Veylo promotional video for Instagram, TikTok, YouTube Shorts, or another social channel. The normal deliverable is a finished local MP4 with its script and a short posting caption. If the user asks for a script or concept only, stop at that requested stage.

## Read the current product and visual style

Before writing a campaign, read the repository `AGENTS.md` and `productdescription.md`. Confirm claims against the current product pages and code rather than assuming old campaign copy is still true. For the visual direction, inspect:

- `client/src/pages/LandingPage.jsx`
- `client/src/components/PublicDesign.jsx`
- `client/src/index.css` and `client/src/styles/public.css`
- Relevant photographs and marks under `client/public/veylo/` and `client/public/photos/`

For video implementation, inspect the existing Content Studio before adding code:

- `admin/src/content-studio/Composition.jsx`
- `admin/src/content-studio/render-entry.jsx` and `timing.js`
- `server/src/contentStudio/presentation.js`, `render.js`, and `schema.js`
- `server/package.json`

The repository already uses Remotion 4 in the server renderer. Reuse its composition, timing, and asset conventions when they suit the brief. Do not build a separate rendering stack or change unrelated app screens. If a requested treatment needs a composition change, keep it scoped to social video work and preserve the existing renderer's contracts.

## Write the campaign

Choose one audience, one real problem, one Veylo benefit, and one clear action. Default to a 15–30 second vertical video for Reels, TikTok, or Shorts unless the user names another platform or length. Put the hook in the opening seconds, then show how Veylo fits into the photographer's real handover, and close with a direct CTA. Keep spoken copy and on-screen text short enough to read on a phone.

Prepare a compact script and scene plan before animating. For each scene, specify its duration, voice-over (if used), on-screen words, actual image or product footage, and transition. Let the user review the plan when they ask for review; otherwise make sensible creative choices and continue through rendering.

Keep Veylo's product description accurate: photographers upload finished photographs; Veylo shapes their first viewing and provides the complete gallery and downloads. Do not describe Veylo as editing, culling, or selecting photographs, or as generating video from photographs. Verify changing prices, limits, and feature availability in the current app before including them. Do not invent testimonials, client results, usage figures, or interface details.

## Match Veylo's design

Use the current public app as the source of truth. Its visual language is a deep near-black canvas (`#070709`, `#0c0c10`), restrained coral (`#ff5a47`, `#ff9b8e`), fine light borders, warm photographic light, and editorial spacing. The app uses Plus Jakarta Sans and Outfit for interface and display text, with Playfair Display for selected editorial emphasis. Check the actual styles before rendering because the app may change.

Keep finished photography at the center. Prefer real local Veylo photographs, the Veylo mark, and genuine app captures. Preserve the supplied image's edit, crop character, and colour grade. Do not fabricate product UI, add decorative emoji or sparkle icons, or use noisy effects, fake notifications, countdowns, or excessive motion. Use restrained movement that helps the viewer follow the photographs and the handover. Keep important text clear of social platform controls and readable against its background.

Write in plain, natural English for Nigerian photographers and studios. Use WhatsApp, Instagram DMs, Nigerian occasions, or Naira context only when they serve the chosen story. Follow all copy, design, and security rules in `AGENTS.md`.

## Render and hand off

Use the existing Remotion packages and composition. Prefer a local render that does not require database changes, cloud uploads, or external generation services. The Content Studio worker can render through `server/src/contentStudio/render.js` when its local environment is already configured; it writes exports under the repository's `exports/` directory. For a local-only render, reuse `render-entry.jsx`, the `compositionProps` contract, and Remotion's `bundle`, `selectComposition`, and `renderMedia` APIs. Check the schema and timing code instead of guessing the input shape. The installed packages are in `server/package.json`.

Unless another format is requested, render a 1080 × 1920 MP4 at 30 fps with H.264 and `yuv420p`; include AAC audio only when the video has sound. Keep source code and intermediate renders in ignored working directories such as `.runtime/` or `tmp/`, and save the final file under `tmp/veylo-social-video/` with a clear filename. Do not install dependencies, call paid generation providers, upload assets, or publish a post unless the user asks for that action.

Before handing it over, confirm the file exists and review representative frames from the beginning, middle, and end for readable text, safe framing, correct photographs, and clean transitions. Fix visible problems and render again. Then provide a clickable link to the MP4, the final script or scene outline, its duration and dimensions, and a concise caption the user can post.
