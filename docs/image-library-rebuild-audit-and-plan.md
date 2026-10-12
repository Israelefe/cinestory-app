# Photo Library, Photo Pre-selection, and Editor Links: audit and rebuild

Date: 12 October 2026. Status: the user approved the rebuild and instructed a commit and push to main. Implementation and local verification are complete. The audit and proposed experience below record the original findings; the implementation and release notes at the end describe the finished changes. Production deployment and database migration are not claimed by this report.

## What the rebuild needs to solve

A photographer should be able to upload a shoot, see exactly what has saved, send a client a link to choose an agreed number of photographs, review those choices as photographs, and send the corresponding originals to an editor. The editor should be able to return edits in a batch, and the photographer should be able to review those edits before creating a finished delivery.

These are three separate workspaces with a shared photo store:

1. **Photo Library**: store and organise photographs by shoot.
2. **Photo Pre-selection**: prepare a client's selection, set the number they can choose, and review their submitted photographs.
3. **Editor Links**: send originals with an editing brief, receive edits, and review the returned photographs.

Final client delivery remains a separate step for finished photographs. Pre-selection is the explicitly requested Pro workflow before editing, rather than a replacement for final delivery. The user's request authorises this scope despite the older broad statement in AGENTS.md section 4 about Veylo being only for final delivery.

## Audit evidence

The audit covered the current React pages, upload helpers, storage and collaboration controllers, models, routes, media services, existing tests, and local browser checks. Browser checks used mocked accounts, library records, and public links, with existing repository photographs as layout fixtures. They did not change production data or contact a client or editor.

| Finding | Evidence | Practical consequence |
| --- | --- | --- |
| Upload percentages do not track transferred bytes. | `client/src/utils/storageUpload.js`: `uploadOne` does not pass a progress callback into `uploadR2Object`; `uploadLibraryPhotos` reports progress at file boundaries. | A large upload can sit on “Preparing photo…” while bytes are actually transferring. |
| There is no visible per-file queue or durable completion summary. | `ImageLibrary.jsx`: `chooseFiles` awaits the entire helper before inserting saved assets; upload UI is one button. | Photographers cannot tell which images are saved, pending, or failed. |
| One failure stops the remaining batch. | `storageUpload.js`: the inner error is rethrown through the outer loop. | A single failed file leaves subsequent photos unattempted, with no individual retry controls. |
| Search and folders do not search the whole library. | `ImageLibrary.jsx`: `load` requests only `page`; `visible` filters the loaded array. `storage.controller.js` already supports server-side `folder` and `search` parameters. | A shoot can look empty even when its photos exist on a later page. |
| Filtered views hide pagination. | The Load more condition requires All photographs and no search. | There is no route to the missing matches from the filtered view. |
| “All photographs” is both a view and a stored folder name. | Upload defaults, asset defaults, folder navigation, and the metadata input use the same string. | Navigation and filing are difficult to understand. |
| Client selection and editor work are combined. | One `sharing` panel, one composer, one owner list, and a public page branching on `kind`. | Separate tasks inherit the same generic layout and terminology. |
| The photographer cannot set a selection allowance. | Neither the collaboration model nor creation/submission validation has a requested selection count. The public page says “Choose as many as you need.” | A package including 10 edits cannot enforce 10 choices. The 500-photo sharing ceiling is a different limit. |
| The client gets a checkbox grid, with no swipe decisions. | `LibraryCollaborationPage.jsx` toggles selected IDs from grid buttons. | The requested swipe right to choose / swipe left to skip experience does not exist. |
| Unsubmitted choices disappear on refresh. | Selected IDs live in component state; only the access token is remembered. | The client has to start again after refreshing or returning later. |
| Submitted results contain filenames instead of photographs. | Owner list returns `selectedFilenames`; the result card joins those strings. | The photographer cannot visually review the client's choices. |
| Reopening erases the previous selection. | `reopenLibraryPreselection` clears `selectedAssetIds` and removes `submittedAt`. | Earlier choices have no retained submission history. |
| Owner updates are not refreshed while work happens. | Collaborations load when `access` changes, with no visible refresh, polling, or completion notification. | New submissions and returned edits can remain invisible until a reload. |
| Editor work is handled one photo at a time. | Public editor cards each have Download original and one file input; `uploadingId` blocks concurrent inputs. | A large edit job requires repeated manual downloads, uploads, and filename tracking. |
| Returned edits have no visual review workflow. | Owner and editor return summaries expose filenames, without returned-image previews or approval states. | There is no clear way to compare edits, request corrections, or choose the approved version. |
| Link creation has no submission lock. | `createCollaboration` does not set a creating state; the submit button does not disable for a pending create request. | Repeated presses can create duplicate links. |
| The photo dialog is dominated by optional metadata. | Folder, tags, caption context, technical RAW explanation, and deletion sit alongside the image. | Opening a photograph becomes a form rather than a useful viewer. |
| Dialog keyboard handling is incomplete. | The library dialogs do not use the existing `useDialogFocus` helper; no Escape handler is present. | Escape does not close the viewer, and modal focus needs proper containment and return. |
| The selection watermark is an HTML overlay. | `v-library-collab-watermark` sits over the image element. | Removing the overlay exposes an unmarked preview. Original-download permissions are separately enforced, but the overlay is not durable image marking. |
| Large-library management is incomplete. | Owner links stop at 100 records; the picker has no search/folder controls; no photo bulk actions exist. | Working through many shoots or links becomes increasingly difficult. |

### Browser reproduction

Checked library layouts at 320 × 740, 390 × 844, 768 × 1024, 834 × 1112, 1024 × 768, and 1440 × 900.

- No page-level horizontal overflow appeared in those fixtures.
- The first photograph began around 1,051px down the page on the 390px phone, and 999px down on the 768px tablet. The large introduction pushes the actual work out of view.
- At 1024 × 768, the details dialog had 780px of content in a 742px container with `overflow-y: hidden`. The Remove button extended below the dialog boundary.
- Escape left the photo dialog open at every checked size.
- A fixture folder with photographs beyond the loaded page appeared empty, with no Load more control.
- The submitted-selection result contained zero image elements.
- A client's counter changed from “1 selected” to “0 selected” after refresh.
- In a mocked three-file upload, the first file had confirmed while the library still displayed only its original photo. The button said “Preparing photo…” and there was no progressbar. When the second transfer failed, the third file was never attempted; only then did the first saved upload appear.

Screenshots and upload observations are in `.visual-review/image-library-audit/`:

- `library-desktop.png`
- `library-tablet-landscape-details.png`
- `combined-links-desktop.png`
- `client-selection-mobile.png`
- `upload-audit.json`

### Existing safeguards and baseline tests

The current implementation already checks asset ownership, scopes public link access, requires editor passwords, checks link expiry/revocation/Pro access, blocks client original downloads, checks storage capacity atomically, and keeps RAW files alongside their JPEG previews. These are useful foundations to retain and extend.

Ran `node --test scripts/cloudflare-media.test.mjs` in `server`: **32 passed, 3 failed**. Passing checks include RAW preservation, malformed-image rejection, sharing permissions, revocation before cached media, and denial of original downloads to pre-selection viewers.

The existing failures were large-image preview transforms, provider-image imports, and legacy music playback. The test fixtures expect `redirect: 'error'` while related current implementations use manual redirect handling; the precise causes need reconciliation before changing those paths. These results are baseline observations, not proof of production failures. This audit does not establish that the whole application is secure.

Existing coverage does not adequately exercise the end-to-end library upload, photographer selection setup, client decisions and recovery, owner photo results, or editor review journeys.

Ran `node scripts/verify-motion-policy.mjs` in `client`: passed. At the audit stage, no application code had been changed; the report and local review artifacts were the only additions. Implementation followed the user's approval.

## Proposed experience

### 1. Photo Library

Use a compact working header: **Photo Library**, shoot/photo counts, storage usage, and **Add photographs**. Put the photo content near the top of the screen. Keep the dark Veylo palette, warm accents, and restrained motion, with generous spacing.

Organise work by named shoots, such as “Ada at 30”. Each shoot has a cover, photograph count, and useful recent activity. **All photographs** becomes an aggregate view; **Unfiled** identifies photographs without a named shoot. Existing folder names become shoots without moving or re-uploading original files.

- Search the full library on the server, with shoot, filename, tags, and supported file-type filters.
- Keep filters, pagination, selection, and counts consistent after uploads, moves, and deletion.
- Offer a shared photo picker with search, shoot filtering, select all within the current explicit scope, selected-only review, and clear limits. Never silently select unloaded photographs.
- Add bulk move, selection setup, editor-link setup, download, and delete actions where appropriate.
- Show destructive actions in a reviewable confirmation with the affected count. If a photograph is still used by a live link, identify that link and explain the available next step.
- Open photos in a spacious viewer with next/previous navigation, full-image fit, zoom, filename, and clear download controls. Label a camera original and its JPEG preview accurately.
- Put tags and internal caption notes in a secondary Details section. Keep existing saved context compatible with delivery reuse; remove the long explanation from the default photo view.
- Before reuse in a delivery, check file eligibility and explain existing delivery size limits. Do not silently send an unfinished RAW preview as the final edited photograph.

### 2. Uploads

Create a persistent upload tray shared across the three owner workflows. Leaving the library route must not discard an upload while the app remains open.

Each file has a thumbnail or file placeholder, filename, transferred bytes, and one clear state:

**Queued → Preparing preview → Uploading → Saving → Added**

**Failed** and **Cancelled** are explicit outcomes. Preparation and saving use honest indeterminate feedback. Transfer percentage comes from actual bytes, including both RAW and JPEG transfers. A completed transfer is not called Added until the server confirms the library record.

- Show overall progress and counts: **“18 of 24 added · 2 uploading · 4 waiting.”**
- Insert each confirmed photograph into the correct shoot immediately and briefly mark it Added.
- Keep a completion summary visible until dismissed: **“23 added. 1 needs another try.”** Provide View photos and Retry failed.
- Retry transient network errors with a bounded policy. Continue unrelated files after one file fails. Distinguish unsupported files from retryable failures.
- Support cancelling queued and active transfers, and pausing admission of waiting files. Do not claim byte-level resume unless the transport supports it; retry a partially transferred file from the start when necessary.
- Show an offline state, keep pending files in memory, and resume queued work on reconnect. Warn before closing the browser while files remain unsaved. A reload can require choosing local files again; never promise browser-surviving file access without implementing it.
- Limit RAW decoding and transfer concurrency to avoid overwhelming a phone. Use the existing adaptive-upload foundations where appropriate, with independent limits for preview preparation and network transfers.
- Check original and preview size/storage requirements; account for video reservations and returned edits. Show server-authoritative storage totals after confirmation.
- Keep confirmation idempotent so a lost response does not duplicate a saved file or delete its original during cleanup. Clean abandoned unconfirmed objects safely.

### 3. Photo Pre-selection: photographer setup

Give Photo Pre-selection its own list, creation route, detail page, labels, and empty states.

Creation steps:

1. **Choose photographs** from a shoot or upload into that shoot. Review the included photos visually.
2. **Set the selection**: client name, title, optional short instructions, and selection allowance. Support **Exactly N**, **Up to N**, and an explicit **No limit** option. Validate N against the available photographs.
3. **Review and share**: show the client's preview, expiry, optional PIN, and the selection rule in plain language. Create once, then expose Copy link, Copy PIN when relevant, and a user-operated share action.

Use separate wording for the number shared and the number the client can select. For example: **“120 photographs to review. Choose exactly 10.”**

Save owner setup drafts without publishing them. Allow changes to a live selection through a versioned update; explain when choices or client instructions will change. Do not silently replace a client's in-progress set or allowance.

Show reliable states such as Draft, Ready to share, In progress, Submitted, Expired, Closed, and Pro access unavailable, based on actual data. Do not describe a link as sent or viewed unless that action is recorded.

### 4. Photo Pre-selection: client experience

Open from WhatsApp or Instagram without requiring a Veylo account. Explain the requested number immediately, then start a large photograph deck with the whole image visible.

- **Swipe right to choose. Swipe left to skip.** Use a responsive card with direct movement, restrained tilt, clear Choose/Skip feedback, and a spring return for an incomplete gesture.
- Provide visible **Skip**, **Choose**, and **Undo** buttons. Support keyboard equivalents when an input or zoom view does not own the keys.
- Show **“6 of 10 chosen”** and **“24 of 120 reviewed”** as separate counts.
- Allow full-screen inspection/zoom without treating a zoom gesture as a choice. Retry failed previews and avoid letting a client accidentally choose an image they could not see.
- Preload the next few previews and avoid loading hundreds of full-size images at once. Adapt preview sizes to the screen and network; retain an adequate inspection view.
- Save choices and deck position automatically. Show Saving, Saved, and Offline accurately. Restore on return and handle access-token expiry without throwing away decisions.
- Treat a link as one client's selection. Separate clients get separate links; multiple tabs need revision/conflict handling rather than silently overwriting each other.
- A **Review choices** view displays chosen photographs as thumbnails. Allow enlarge, remove, replace, undo, and revisit skipped photos. An optional overview grid is a review tool within this workflow.
- Reaching the maximum opens review guidance; it never silently submits. Explain how to replace a choice, and allow inspection of remaining photographs.
- For Exactly N, require N at submission. For Up to N, require at least one and no more than N. For No limit, require at least one. Enforce the same rules on the server.
- Confirm the final choices visually before **Send my selection**. Keep the selected set intact if the network fails, and make repeated submission safe.
- After submission, show the chosen photos, count, and receipt. Allow changes only through the photographer's explicit reopen action.

### 5. Photo Pre-selection: photographer results

The selection detail page shows the selected photographs in a proper gallery, with a count, submitted time, and full-screen viewing. Filenames remain available as secondary information and for export.

- Filter selected, skipped, and not yet reviewed where the saved session makes those distinctions reliable.
- Download selected originals as a batch or export a filename list for an existing editing workflow.
- **Create Editor Link from these photographs** opens a separate editor setup with exactly those source IDs preselected. Sharing choices does not automatically give a client or editor original access.
- Refresh results on focus and while the detail page is visible; show an in-app update when a submission arrives.
- Reopen into a new selection revision, retain the previous submission, and explain whether the client will continue from those choices or start over. Preserve history rather than erasing it.

### 6. Editor Links

Give Editor Links its own list, creation route, owner review page, and editor-facing page. Use editor-specific fields and language throughout.

Photographer setup includes editor name, job title, source shoot/photos, editing brief, optional due date, required password, and expiry. Review the exact source files and allowed output formats before creating the link. Offer a client-submitted selection as a source without combining the two workflows.

Editor workspace:

- Show the brief and job totals first, then a visual source gallery with clear filenames and file types.
- Download all sources or a selected subset in a safely scoped archive; retain RAW bytes and meaningful original filenames.
- Upload returned JPEG, PNG, or WebP edits in a batch with the same honest upload queue and retry behaviour.
- Match returns to sources by an explicit source reference or an unambiguous filename proposal. Review ambiguous matches; never guess between duplicate basenames or silently overwrite a source.
- Retain return versions and source relationships. Show returned-image thumbnails with upload times and source counts, rather than a list of filenames.
- Allow an explicit **Send edits for review** action when the editor is ready. Uploading one file does not mark the entire job complete.

Photographer review:

- View original and edited photographs side by side or switch between them without cropping away the work.
- Accept a returned version or record a correction request against the specific photo. Keep the previous versions and notes.
- Show Awaiting edits, Edits ready, Changes requested, and Complete using actual job/review state.
- Create a final delivery from the explicitly approved edited versions, through the existing delivery creator and its validation.
- Notify through the application when edits are ready. No automatic WhatsApp, email, or other external messages are part of this proposal; sharing remains a deliberate user action.

## Architecture and compatibility

- Replace the combined owner and public page components with dedicated Photo Library, Photo Pre-selection, and Editor Link page trees. Small shared pieces can include the photo picker, viewer, upload tray, storage meter, access screen, and safe media transport.
- Keep originals, hashes, storage accounting, and existing asset IDs. Introduce stable shoot records and relationships for source/returned assets without re-uploading files or duplicating storage charges.
- Evolve the current collaboration persistence with kind-specific validated settings, selection revisions, saved client sessions, submission snapshots, and editor return/review records. Separate UI and API contracts must not depend on one generic form with conditional labels.
- Add paginated, filtered owner lists and detail endpoints containing scoped image summaries. Do not return the entire library or hundreds of signed originals for a summary screen.
- Persist client decisions with session identity and a revision counter. Define one authoritative final submission per revision. Validate ownership, link kind, membership, count, version, status, expiry, and entitlement on every relevant write.
- Bind editor upload authorisation to the job, source asset, and upload attempt. Confirmations and archive creation must recheck current access, including a link closed during the operation.
- Prefer authorization headers for JSON requests and short-lived scoped media credentials for image requests. Prevent access credentials entering analytics, error reports, referrers, or public caches.
- Add durable marked preview generation for pre-selection. Keep client-original download denial. Marking and absent download controls do not prevent screenshots; do not promise that they do.
- Preserve `/library`, `/select/:publicId`, and `/edit/:publicId` compatibility. Add separate owner routes such as `/pre-selection` and `/editor-links`, including a detail route for each job.
- Existing live selections retain their current unlimited-choice behaviour unless explicitly revised. Retain their IDs, selected photos, expiry, and access secrets; do not invalidate working links as a side effect of the redesign.
- Map old unnamed folders to Unfiled and named folders to shoots through an idempotent migration. Review legacy data before applying any live migration.
- Update navigation, product links, help/assistant knowledge, wording, and relevant tests to use the new names and actual behaviour. Preserve unrelated work already present in the repository.

## Responsive, motion, and access requirements

- Test at 320, 390, 640, 768, 834, 1024, and 1440px widths, including short-height tablet landscape and long filenames.
- Keep the work area near the top. Use a shoot sidebar or list on desktop and a clear compact shoot switcher on phones. Give tablets intentional grid widths and usable controls.
- Fit viewers and review actions to the viewport with independent, usable scrolling where necessary. Respect safe areas and the on-screen keyboard; avoid hidden footers and overlapping upload trays.
- Keep touch targets practical, focus visible, dialogs focus-contained, Escape functional, and focus returned to the trigger. Announce upload and save states accessibly without reading every byte update.
- Animate card gestures, arrivals, button presses, progress transforms, and save/completion feedback with transform and opacity. Avoid excessive stagger delays and heavy effects across large lists.
- Follow `client/src/utils/motionPolicy.js`, including `useVeyloReducedMotion` and the shared provider configuration. Preserve explicit pause/still choices. Do not weaken `verify:motion-policy` or suppress animations based on device preference.

## Build order and acceptance checks

1. **Data and API contracts**: specify selection rules, drafts/revisions, editor versions, idempotency, ownership, and compatibility. Add behavioural regression tests for these contracts.
2. **Library and uploads**: rebuild navigation, shoots, search/pagination, viewer, and shared upload queue. Verify partial success, individual retries, cancelled files, offline recovery, RAW preparation, storage exhaustion, and confirmation retries without duplicates.
3. **Photo Pre-selection**: build separate photographer creation/results and the client swipe/review journey. Test drag thresholds, vertical scrolling, tap/keyboard alternatives, undo, exactly/up-to/no-limit rules, refresh recovery, concurrent tabs, failed submission, and reopening with history.
4. **Editor Links**: build separate setup, source downloads, batch returns/matching, version review, correction requests, and handoff of approved edits into final delivery.
5. **Compatibility and finish**: verify existing public links, migration idempotency, mobile/tablet layouts, accessibility, motion policy, updated copy/help, and the full build. Resolve or clearly attribute existing baseline failures before claiming all checks pass.

The rebuild is complete when a photographer can upload a shoot with visible per-file outcomes, configure a client to choose exactly 10 of its photographs, see those 10 as images after submission, send their original files through a separate Editor Link, review returned image versions, and create a final delivery from accepted edits. The same journey must survive refreshes and ordinary network interruptions, remain usable on phones and tablets, and keep unauthorised people from originals and other photographers' files.


## Implemented experience

- Photo Library replaces the promotional heading with a working photo browser, shoot navigation, storage totals, server search, file-type filters, pagination, bulk move/download/remove, and a full-photo viewer. Tags and internal notes live behind an optional details section.
- A shared upload tray tracks actual transferred bytes and distinguishes preparing, uploading, saving, added, failed, retrying and cancelled. Successful photos appear individually. It supports retry, cancellation before confirmation, pausing waiting files, offline recovery and continued uploads during navigation. Confirmation retries reuse the same object key and transferred bytes. The tray never announces Added until the server confirms. Files remain in browser memory while the tab stays open; a reload can require choosing them again. Account changes clear private Library files and previews from memory.
- Photo Pre-selection has its own creation flow with exact-count, maximum-count and unlimited allowances, optional PIN, expiry, client note, image review and a working swipe preview. Clients swipe or use Choose/Skip, undo, inspect the full photo, review images, autosave and submit. Offline decisions remain on the device; final submission needs a connection. Conflicts offer explicit recovery. Photographer results show photographs, optional skipped/unreviewed views where saved decisions exist, revision history, original downloads, filename export and a separate Editor Link handoff.
- Editor Links has its own password-protected setup, brief, due date, original downloads, batch return matching, progress tray and returned-image history. Uncertain filename matches require a choice. Owners compare originals and returned versions, accept a particular version or request a correction with a note. A new return requires review again. Accepted edits enter a delivery draft; retries do not create another draft or duplicate its imported photos.
- Storage and editor-return commits use MongoDB transactions for quota, file records and source relationships. Final selections use revision/version checks and retain prior submissions. Access checks cover ownership, membership, link kind, expiry, closure, entitlement, changed PINs, uploads and archives. Preview marks are embedded in Cloudflare image pixels and have distinct cache keys. Camera originals remain unchanged. Delivery import rejects camera originals and paired previews and requires finished image exports up to 20 MB.
- Navigation, Product links and Help use the separate workspace names. Assistant page context includes only the workspace name, without private record identifiers. Existing public URL paths remain valid; legacy selections remain unlimited until explicitly revised.

## Verification results

- Browser regression suite: **19 passed**, covering widths 320, 390, 640, 768, 834, 1024 and 1440px, tablet landscape, full-photo dialogs, selection allowances, swipe/undo, autosave/refresh/offline recovery, conflicts, visual submission and receipts, owner image results, separate editor setup, batch matching, upload progress/partial failure/navigation, confirmation retry, sign-out privacy and accepted-edit delivery retries.
- Library integration suite: **16 passed** against an isolated MongoDB replica set, including concurrent quota/confirmation writes, ownership, draft/final version conflicts, reopening/revision history, PIN invalidation, upload renewal/cleanup, explicit version approval, migration repeatability and delivery import/retry/partial-copy cleanup.
- Cloudflare media suite: **38 passed**, including pixel-level watermark checks, unchanged original bytes, separate marked/plain cache entries, rollout capability checks, RAW support, archive scope and redirect rejection. The three original fixture failures were reconciled with the existing manual redirect handling. An added regression proves redirects are rejected without following them; production redirect safeguards were not weakened.
- Help and assistant suites: **39 passed**. Delivery V3 regression suites: **201 passed**. Server syntax, delivery security, account deletion, responsive contract and Veylo motion policy checks passed. The production client build passed with the existing chunk-size warnings.
- The older client delivery-v2 static check still fails on its existing prepareShareFile download assertion, outside this rebuild. Its Library copy assertions were updated for the new internal-note labels; unrelated download behavior and its tests were left unchanged.
- Screenshots were inspected for Library and client swipe views at 320, 834 and 1440px. Local screenshots and test logs are under the ignored .visual-review/image-library-rebuild directory. Browser tests used mocked accounts and existing repository photography. No real clients were contacted, and no production photographs or database records were changed for verification.

## Release and migration

1. Deploy the updated Cloudflare media Worker from this release before the API/client release:

   ~~~powershell
   npx wrangler deploy --config cloudflare/delivery-images/wrangler.toml
   ~~~

   Keep the existing private R2 bucket and signing secret. R2_MEDIA_OFFLOAD_ENABLED must be true for marked pre-selection previews. The Worker's signed health response now reports selectionMarks: true; the API checks this capability before issuing a pre-selection preview. If the old Worker is still deployed, previews report temporarily unavailable instead of serving unmarked images. A Worker deployment was not performed as part of the requested commit/push.

2. Use a MongoDB replica set or Atlas deployment. New upload confirmations and editor reviews require transactions; they intentionally do not fall back to non-atomic quota writes on a standalone database. The API must create the new LibraryShoot and partial collaboration creation-key indexes. The migration below also creates these indexes without dropping existing indexes.

3. Audit legacy Library records, from server with the intended database environment loaded:

   ~~~powershell
   node scripts/library-workspaces-migrate.mjs
   ~~~

   This is read-only by default and reports counts without filenames, account details or secrets. After reviewing the counts, apply the repeatable migration with:

   ~~~powershell
   node scripts/library-workspaces-migrate.mjs --apply
   ~~~

   It creates shoot relationships, maps unnamed/All photographs folders to Unfiled, and preserves legacy unlimited rules and revision 1. It does not move or rewrite original files, change photo IDs or hashes, reset selections, rotate access secrets, or change public link IDs. The new API also reads legacy folders and missing rules before migration, so migration is not required to open existing work. No live migration was run during this task.

4. After deployment, check one real Pro upload, one marked preview, one PIN-protected selection, and an Editor Link return/approval using a test shoot. Keep independent originals as before. Rolling back only the client keeps stored photos and links; rolling back the API would remove enforcement of newly configured selection allowances, so retain this API when diagnosing a presentation issue.
