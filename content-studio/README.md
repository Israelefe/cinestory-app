# Veylo Content Studio

A standalone studio that runs its server, queue, files, database, browser capture and video renderer on this PC. It does not replace the existing Admin studio or use the production database.

## Open the studio

Double-click **Start Studio.cmd**, then open **http://127.0.0.1:5056**. Keep the terminal window open while a job is running. The first visit asks you to create a local password of at least 12 characters. No owner password or API keys have been set for you.

Requirements: Windows, Node.js 26.4–26.x, installed Chrome and enough free disk space for media. Dependencies are installed in this workspace. On a fresh checkout, run `npm.cmd ci` inside `content-studio` first. Rendering uses the pinned Remotion FFmpeg tools; `npm.cmd run tools:install` checks them.

## First video

1. Open **Studio settings**. Add your Groq and Deepgram keys, record the limits shown in your Groq account and confirm license eligibility. Run **Verify providers**. The default model is a Preview model; verification checks structured output, planted forbidden claims and the configured text fallback. Repeat verification after changing the model or knowledge pack. No fallback is silently substituted.
2. Generate voice auditions, listen to pronunciation, save your chosen voice, then approve it. Record your Google Flow/image surface, model, plan, quota and visible-watermark behavior. Confirm the public Veylo destination; the default `https://veylo.com.ng` comes from repository source and has not been verified as a reachable live deployment.
3. Review **Product knowledge**. The catalog covers eight Showcase formats, GridBoard, Photo Swap, video delivery, dashboard and other source-backed capabilities. Approve only behavior customers can use now. Prices and allowances are excluded from promotional copy.
4. Upload at least six reusable **real** sample photographs to **Media library**. Record commercial-use rights and consent, or confirm there are no identifiable people. Add a real cleared sample film if you want video-delivery recordings. Existing public demo assets and music can be imported, but they begin with pending rights.
5. In **Product recordings**, record all approved flows and review the clips. This operates the actual Veylo frontend against private, disposable local rehearsal data. It does not access customer accounts or publish a delivery. Rehearsal elapsed times cannot support speed claims.
6. Create a video. Choose a capability or let the engine suggest three concepts across the approved catalog. Pick a concept, generate the three script angles, then select a validated script. Edits run code checks and a fresh independent model review.
7. Build the storyboard. Use cleared library material where it fits. For gaps, copy the exact image or video prompt into Google Flow/the recorded image surface, generate manually, then drop files named with their slot IDs into the job. Every upload needs rights, a logged vision review and your approval. **Finished-work slots require real material.**
8. Generate measured voice and word timings. Render and approve the voiced preview, choose cleared music, then render the final. Review the complete film before approving export.
9. Download the ZIP: MP4, cover, caption/hashtags, platform-specific UTM links, storyboard, posting checklist, rights/provenance manifest and font license. Place the appropriate tracked destination in your bio. Enter results manually; history, CSV export and approved learnings are available from Projects.

Screen-reference images and their index are stored under `data/knowledge/ui-reference/` when recordings run.

Generate the ten-job model calibration in Settings after approving captures. It compares reasoning modes and tests invented-statistic/forbidden-claim refusals. Creative quality scores still require your judgement. Live provider calibration and owner auditions have not been performed without your keys.

## Rendering and revisions

- Output: 20–40 seconds, 1080×1920, 30 fps, H.264 `yuv420p`, AAC 48 kHz, fast-start MP4. Preview: 540×960.
- Voice drives measured timing within section budgets. The engine never accelerates speech. A shorter suggested line needs approval in Scripts before regeneration.
- Ten registered templates use strict shared contracts. Model-generated code is rejected. Text is measured and its bounds are checked during rendering; final QA also samples frames and measures encoded audio loudness.
- Music loops/trims/fades and ducks under voice. Original procedural cut hits are included. The final target is approximately −14 LUFS with true peak at or below −1 dBTP; encoded results are measured rather than presumed.
- Changing a stage creates a revision, cancels old work and keeps only valid upstream artifacts. Human approvals are tied to content digests. Tasks are persistent and recover expired leases after restart. Keep the PC awake during a render.

Safe-zone margins are conservative studio defaults, not a universal official organic-video specification: top250, bottom420, left80, right120 at1080×1920. Review the export in each platform's posting preview. Read the current platform AI-disclosure instructions before posting; the ZIP includes a reminder.

## Commands

```powershell
cd C:\Users\USER\Downloads\cinestory-app\content-studio
npm.cmd start
npm.cmd run build
npm.cmd test
npm.cmd run test:browser
npm.cmd run knowledge:extract
npm.cmd run knowledge:check
npm.cmd run capture
npm.cmd run calibrate
```

The capture/calibration commands enqueue persistent tasks; the studio or a dedicated `npm.cmd run worker` process must be running. Prefer one worker on this PC. The same database lease prevents concurrent workers claiming the same task. `dev` rebuilds the UI before starting the local server; it is not an HMR server.

Developer proofs: `node scripts/render-proof.mjs`, `node scripts/audio-proof.mjs`, `node scripts/capture-proof.mjs all`, and `node scripts/pipeline-proof.mjs`. Capture proofs use original abstract fixtures. The pipeline proof uses provider doubles and synthesized test tones; it verifies plumbing, not provider quality or production campaign readiness. Test data lives under ignored `data/tests/` and is never imported into the owner's library.

## Data, costs and backups

`data/studio.sqlite` holds jobs, revisions, approvals, tasks, usage and metrics. Media, provider-call logs, captures and exports stay under `data/`. Keys are server-side in ignored `data/credentials.json` or this app's `.env`. The production `.env` is never loaded. The server binds to loopback and requires a local session plus CSRF protection.

Default API caps are US$1 per job and US$5 per Lagos day. Requests reserve cost before calling; uncertain responses retain the reservation. Approximate normal provider spend is $0.15–$0.50 per video, depending on repairs, scene count and QA. This is an estimate, excluding bulk indexing, calibration, manual Flow generation, electricity and provider taxes. The app records actual token/character/audio costs when available.

SQLite snapshots run every six hours and on clean shutdown, retaining seven dated files. **They are database backups, not media backups.** To move or fully back up the studio, stop it and copy the entire `content-studio/data/` folder securely. That folder includes credentials. Do not share it or commit it. No customer production data is required.

Official research, implementation evidence and limits are recorded in `docs/content-studio-build-report-2026-10-12.md` at repository root. Format specifications live in `formats/`; the dated decision log is in the repository's `docs/` folder.
