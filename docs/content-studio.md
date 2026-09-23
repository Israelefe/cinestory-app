# Veylo Content Studio

Content Studio is an admin tool for marketing Veylo to photographers. It accepts still JPEG, PNG and WebP images only. It creates vertical MP4 videos from image compositions and exports designed PNG posts and carousel slides. No video generation API is used.

## Run locally

Install the dependencies in both `admin` and `server` using `npm ci`. Build the admin interface, then start the local studio:

```powershell
cd admin
npm run build
cd ../server
npm run content:local
```

Open **http://127.0.0.1:5055/content-studio** and sign in with your administrator account. The Content Studio link in the hosted admin opens this address too. The local server serves the admin interface, validates sessions, processes uploads and makes provider requests on this PC. It starts a separate rendering process automatically. The hosted Render API does not mount the Content Studio endpoints or run its jobs.

The local service uses the existing MongoDB and Cloudinary configuration. Use the same database, `JWT_SECRET` and `OTP_SECRET` as Veylo if sharing existing admin accounts. Keep these values in `server/.env`. The local service listens only on 127.0.0.1 and rejects requests from unrelated origins and hostnames. Open it on the PC running the service; a phone's localhost points to the phone, not your PC.

Keep the computer awake while it is processing jobs. CPU and memory determine rendering speed. Start with `CONTENT_RENDER_CONCURRENCY=2`; use `1` if memory is limited. Queued campaigns wait while the PC is off. AI providers and Cloudinary still require network access and use their account allowances; the work does not consume the Render web service's CPU or RAM.

The worker requires Chrome or Chromium. Set `CONTENT_BROWSER_EXECUTABLE` to an installed executable, or allow Remotion to download its headless browser on the first render. Fonts are installed locally through npm; exports do not depend on Google Fonts requests.

Required provider settings are `ALIBABA_MODEL_STUDIO_API_KEY`, `ALIBABA_WORKSPACE_ID` (or `ALIBABA_BASE_URL`), the three existing Cloudinary settings, and `DEEPGRAM_API_KEY` when voice-over is enabled. API keys stay on the server. Qwen Image 3.0 Pro must be available to the configured Alibaba workspace and region. See [Alibaba's API documentation](https://www.alibabacloud.com/help/en/model-studio/qwen-image-generation-and-editing-api-reference) and [Deepgram Flux TTS](https://developers.deepgram.com/docs/flux-tts/overview).

Open **Content Studio** in the admin header. Only superadmins and operations administrators can use it. Each administrator can access their own campaigns.

## Workflow

1. Start a campaign and upload up to 24 photographs or screenshots, at most 15 MB each. The server decodes and validates them and stores metadata-free presentation copies in authenticated Cloudinary storage.
2. Choose a marketing objective and output formats. Notes are optional. The AI chooses the angle, scripts, captions and visual direction from the supplied assets and Veylo's product knowledge and current plan configuration.
3. Generate. The worker analyzes images, validates the creative plan, requests up to three supporting images from Qwen, creates narration and measured subtitles, arranges a score, and renders the final files.
4. Preview, download the files and posting copy, or request changes to the whole campaign or one scene. Revisions preserve previous versions. A campaign retains up to 12 versions.

The generated images provide visual material. The renderer owns typography, logos, composition and motion. Product screens must come from real screenshots. The original uploaded files on your computer are untouched. Color treatments affect the presentation only.

The instrumental beds and transition sound are synthesized by the engine without third-party recordings. Three musical arrangements are included. Scene lengths follow measured narration duration and are aligned to the selected score's beat grid. The requested length is a creative target; final duration can differ to avoid cutting off speech. Video exports use H.264/AAC at 1080 × 1920, 30 fps. Graphic exports are 1080 × 1350, 1080 × 1080, or 1080 × 1920. Each video also gets a cover image.

## Worker deployment

The default setup is the local PC service described above. For a future move to a dedicated worker host, the repository also includes `server/ContentStudio.Dockerfile`, built with the repository root as Docker context:

```sh
docker build -f server/ContentStudio.Dockerfile -t veylo-content-worker .
docker run --env-file server/.env veylo-content-worker
```

This optional container runs only the rendering worker; the local API and admin UI still provide campaign controls. It installs Chromium and FFmpeg. No cloud worker is configured or deployed by this change, and `render.yaml` is unchanged.

The worker needs memory for Chromium and frame rendering. Begin with a dedicated worker with at least 2 GB RAM and measure your workload. Review [Remotion's license](https://www.remotion.dev/license) for your organization's use before deployment.

## Recovery and resource limits

Jobs are claimed atomically in MongoDB and processed one at a time per worker. Heartbeats protect the lease. An interrupted job is marked failed after three minutes, and Retry resumes checkpointed assets instead of starting again. Five attempts are allowed per job. Cancellation aborts provider requests and renders; an already completed provider charge cannot be reversed. Do not run multiple workers on the same filesystem bundle directory.

`CONTENT_DAILY_UNITS` limits generation operations across all administrators, resetting at 00:00 UTC. An image analysis costs 1 unit, a creative request 3, generated image 8, narration segment 1, subtitle timing request 1, and an exported file 1. Failed provider calls also consume their allowance. These are internal work units, not a monetary estimate or a guaranteed provider spending cap. Configure actual monetary limits in the provider accounts as needed.

Uploads, generation routes and downloads enforce admin sessions and campaign ownership. Models only return schema-validated data; generated scripts, HTML, executable expressions and arbitrary media URLs are never executed. Generated image downloads are restricted to Alibaba storage hosts and reject redirects. Storage URLs returned after authorization are signed bearer links; treat them as private. Stored marketing campaigns and exports remain until deliberately removed from storage; this release does not add automatic campaign deletion.

## Validation

```sh
cd admin
npm run build
cd ../server
npm run verify:content-studio
```

The verification script uses local fixtures and mocked providers. It checks input rules, ownership, generation planning, provider contracts and actual image/video rendering without consuming paid model calls. Add `-- --ui` to also check the campaign list and editor at 320, 390, 768, 834, 1024 and 1440 pixels. Live provider access must be checked using the configured accounts.
