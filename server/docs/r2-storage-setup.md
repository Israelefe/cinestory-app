# Cloudflare R2 media storage

Veylo stores private media in Cloudflare R2. The bucket must stay private; the app issues short lived upload and download links and sends public portfolio, story, logo, and delivery requests through Veylo's API.

## Create the bucket and credentials

1. Create a bucket named `veylo-media` (or choose another name for `R2_BUCKET_NAME`).
2. Create an R2 S3 API token limited to this bucket. It needs object read, write, delete, and bucket-list access. Keep its access key and secret out of the browser and source control.
3. Add these server environment variables in local development and Render:

   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_NAME`

4. Keep the bucket's public access disabled. Veylo uses the S3-compatible endpoint at `https://<account-id>.r2.cloudflarestorage.com`.

The app creates preview files beside each original under a `.__veylo/` key prefix. Photographers' storage allowance is based on the uploaded originals, including a paired camera RAW original and JPEG preview.

## Set bucket CORS

Direct browser uploads need a bucket CORS policy. Add the actual production origins and local development origins used by this project. Do not use `*` for allowed origins.

```json
[
  {
    "AllowedOrigins": [
      "https://veylo.com.ng",
      "https://www.veylo.com.ng",
      "http://localhost:5173",
      "http://127.0.0.1:5173"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["etag", "content-length"],
    "MaxAgeSeconds": 3600
  }
]
```

Add any separately hosted Veylo app origin that actually uploads media. The signed PUT requires the upload's `Content-Type` header to match the value used when Veylo prepared that upload.

## Move existing Cloudinary media

Do this once before deploying the Cloudinary-free server build:

1. Schedule a short maintenance window and enable Veylo Maintenance Mode so no uploads or edits land in Cloudinary while the records are being copied.
2. Back up the production MongoDB database.
3. Configure the R2 values above and temporarily add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` to `server/.env` on a trusted machine. If dependencies are not installed there yet, run `npm ci --include=dev` from `server`; Cloudinary is kept only as a development dependency for this one-time tool. Do not put these temporary Cloudinary values in Render for the new build.
4. From the `server` directory, run `npm run storage:migrate-cloudinary`. It scans the database and prints an inventory without changing files or records.
5. Run `npm run storage:migrate-cloudinary -- --apply`. The command copies each referenced original to R2, checks the byte count and SHA-256, creates image previews, then updates database references. It leaves Cloudinary originals in place. A resumable source list is written to the ignored `server/.runtime/cloudinary-r2-migration-manifest.json` file.
6. Deploy the R2 build while Maintenance Mode is still on. Once the server starts with its R2 check passing, turn maintenance off and inspect Image Library, client galleries, Photo Stories, portfolios, profile images, and Content Studio.
7. When the R2 copy is confirmed, run `npm run storage:migrate-cloudinary -- --apply --delete-cloudinary-source` from the same trusted machine. The command deletes migrated Cloudinary originals and retired delivery preview files recorded in the manifest. If a delete fails, it keeps the manifest so the command can be retried.
8. Remove the temporary Cloudinary credentials from the machine's `server/.env` and revoke the Cloudinary API key if Veylo no longer uses the account for another purpose.

The migration command streams one object at a time up to 5 GiB. Larger objects need a multipart migration path; if encountered, the command reports the failure and stops before changing database references or deleting source files. The command does not run automatically during deploy. Do not use `--delete-cloudinary-source` before checking the R2 site.

## Deploy

Render's `server` service needs the four R2 variables and `MONGODB_URI`. `server/server.js` checks R2 connectivity during production startup, so a missing token or bucket permission causes startup to fail visibly rather than silently accepting uploads that cannot be saved.

Uploads are sent directly from the browser to R2. Veylo currently signs upload links for 20 minutes and read links for up to 6 hours. Keep the server clock synchronized so S3 signatures remain valid.

## Offload delivery photo previews

The optional Cloudflare Worker reads delivery originals from the private bucket and prepares only the preview a delivery page asks for. It also checks the image dimensions when an upload finishes, so the API server does not need to download each original and save ten preview files. The library's upload and RAW preview flow stays on its existing path.

Follow [the delivery image worker setup](../../cloudflare/delivery-images/README.md). It uses the existing R2 bucket name and adds these two optional Render variables:

- `R2_IMAGE_WORKER_URL` — the Worker URL printed by Wrangler.
- `R2_IMAGE_WORKER_SECRET` — the same private signing secret configured on the Worker as `IMAGE_SIGNING_SECRET`.

Deploy the Worker and set both variables before deploying the application release. The delivery uploaders then allow up to six photo uploads at once. Without the Worker settings, uploads stay at two at a time while the API uses its previous preview-generation path.
