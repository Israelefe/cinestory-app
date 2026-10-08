# Move file traffic off Render

This update uses the existing `veylo` R2 bucket and `veylo-delivery-images` Worker. It does not create or use Cloudflare Containers.

## What moves

- Profile, library, delivery and campaign uploads go directly from the browser to R2.
- Delivery, library, portfolio and campaign previews are made and served by Cloudflare.
- Individual downloads, camera RAW originals and soundtrack playback are served by Cloudflare.
- The older approved Pixabay audio route also redirects playback to Cloudflare, preserving audio seeking.
- Cloudflare streams “Download all” ZIP files. Originals are stored in the ZIP without recompression. Only the small private file manifest is temporarily stored in R2; it is removed automatically after an hour. The whole ZIP is never held in memory or transferred through Render.
- File checks and SHA-256 checksums run on Cloudflare in bounded chunks.
- Status card photographs load directly from Cloudflare and the card is drawn on the client's device. Render returns only the text, photo links and a small QR image.
- R2 copies library originals into deliveries within storage.
- Deepgram narration and its word timings run through the Cloudflare helper. Audio is written directly to R2. Render receives recording details and timing information.
- Campaign voice-over follows the same path, including subtitle timing. Local campaign processing retains its existing file handling.
- Generated campaign images are downloaded from the image provider, checked and saved to R2 by Cloudflare. Render receives only their details.

Render retains login, accounts, permissions, delivery information, Groq requests, database requests, payments, emails and job progress. Private media requests make a small permission check against Render before Cloudflare serves any cached or original bytes. Closing a library or delivery share blocks later file requests.

Preparation screens poll a small progress response. They fetch the full delivery after processing finishes, rather than sending the entire photo list every few seconds.

Existing campaign video rendering stays on its current processor. Locally generated campaign outputs still need to be written to R2 from that processor. No Container is required or configured by this change.

Delivery photographs stay limited to 20 MB. Library files stay limited to 100 MB. RAW originals remain unchanged and use their paired JPEG previews. Cloudflare's URL image transformation is used for photographs above the existing preview binding's 20 MB limit.

## Set up, in order

### 1. Enable Workers Paid

In Cloudflare, open **Workers & Pages**, then its plan settings, and select **Workers Paid**. It starts at $5/month, with usage charges where applicable. ZIP creation and file hashing need more processing time than Workers Free allows. Do not create a Container.

Image transformations, R2 storage and R2 operations have their own usage allowances and prices. R2 file transfers do not have an outgoing data charge.

### 2. Deploy the updated helper

From the project folder:

```powershell
npx wrangler deploy --config cloudflare/delivery-images/wrangler.toml
```

The bucket remains `veylo`. The existing `IMAGE_SIGNING_SECRET` stays in place. `VEYLO_API_ORIGIN` in that file must be your Render server's address; it currently points to the same server as the website configuration.

### 3. Add the narration key to Cloudflare

Run:

```powershell
npx wrangler secret put DEEPGRAM_API_KEY --config cloudflare/delivery-images/wrangler.toml
```

Paste the Deepgram API key already used in Render when the terminal asks. Keep it private. Cloudflare uses it to create recordings and save them to R2.

### 4. Upload the soundtrack catalogue once

This reads the existing music files on this computer, verifies their checksums and uploads them directly using your Wrangler login:

```powershell
powershell -ExecutionPolicy Bypass -File cloudflare/delivery-images/publish-music.ps1 -Apply
```

You can rerun it if an upload is interrupted. It overwrites the same catalogue objects without creating duplicate copies. The bucket remains private.

### 5. Deploy the app, then switch the new paths on

Deploy the updated Render server and the client/admin applications first. Keep `R2_MEDIA_OFFLOAD_ENABLED` unset while those releases finish.

Then, in the Render server's **Environment** settings, add:

| Name | Value |
|---|---|
| `R2_MEDIA_OFFLOAD_ENABLED` | `true` |

Keep `R2_IMAGE_WORKER_URL` and `R2_IMAGE_WORKER_SECRET` as they are. The secret must still match Cloudflare's `IMAGE_SIGNING_SECRET`.

If your admin application uses a different hostname, add it to the R2 bucket's existing upload CORS allowed origins. Add that origin to the Worker's `MEDIA_ALLOWED_ORIGINS` variable too when the admin application needs to fetch downloads.

Optional connection check, when the Render environment values are available in your local `server/.env`:

```powershell
node server/scripts/check-media-offload.mjs
```

This prints configuration status, without printing keys or signed file links. It does not upload or download a photograph.

## Check the release

- Upload a delivery photograph and profile image. Watch that the actual PUT goes to `r2.cloudflarestorage.com`.
- Open a personal library photograph, a portfolio and both kinds of library shares.
- Download an original, a RAW file and a ZIP. Compare original checksums and ZIP contents.
- Test music seeking and narration playback.
- Close a share and try an already issued media link again. The next file request must be denied.
- Check that a recipient cannot request photographs outside their share.
- Test a slow upload and retry. Keep the existing adaptive upload controls and 15-minute transfer timeout.
- Check Render's outgoing bandwidth after the change. Normal API responses and external service requests still use it.

When the switch is enabled, Cloudflare failures are returned as retryable errors. Image processing must not silently move back to Render.

## Checks completed before deployment

- 235 server tests passed, covering uploads, original downloads, ZIP contents, private shares, PIN changes, RAW files, narration, campaign voice-over and delivery processing.
- 44 browser tests passed, covering direct profile uploads, slow connections, retries, preparation progress and Status cards. Phone and tablet checks include 320, 768 and 834 pixels.
- Both client and admin production builds passed. The client motion policy check also passed.
- Server syntax checks passed for 215 files. The updated Cloudflare Worker passed Wrangler's local build check without being deployed.
- The soundtrack publishing script verified all 207 local catalogue files without uploading them.

Cloudflare storage and voice provider calls in the automated tests use controlled fixtures. Live downloads, provider connections and Render bandwidth still need the release checks above after deployment. These checks do not measure production performance with 100 photographers.

## Rollback

Existing originals are untouched. Do not delete originals or the new soundtrack catalogue. Removing `R2_MEDIA_OFFLOAD_ENABLED` restores the old processing paths, but newly uploaded images do not have the old eager preview copies. Regenerate their legacy previews before rolling back the viewing paths, or keep the new Cloudflare viewing paths while fixing the affected release.

Pricing and limits: [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [Images](https://developers.cloudflare.com/images/get-started/limits/), [R2](https://developers.cloudflare.com/r2/pricing/). Image previews above 20 MB use [Cloudflare's URL transformations](https://developers.cloudflare.com/images/optimization/transformations/transform-via-workers/) with a separate private source path that serves the R2 original without resizing it again.
