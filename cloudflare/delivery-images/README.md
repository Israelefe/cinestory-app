# Private delivery image worker

For the expanded media service, use [Move file traffic off Render](../../docs/cloudflare-media-offload.md). The current configuration requires Workers Paid and includes ZIP downloads, library previews and narration. It does not use Containers. The notes below describe the original delivery preview setup.

The worker reads delivery originals from the private R2 bucket, checks a short-lived Veylo signature, and uses Cloudflare Images to create only the preview requested. It does not make the R2 bucket public or replace the original file.

## Configure and deploy

1. Check that `bucket_name` in `wrangler.toml` matches the API's `R2_BUCKET_NAME`. It is currently `veylo`. The bucket name is not a secret; do not copy either R2 access key into this file.
2. From the repository root, deploy the worker:

   ```powershell
   npx wrangler deploy --config cloudflare/delivery-images/wrangler.toml
   ```

   Wrangler prints the worker's `workers.dev` URL. Keep that URL for the API setting below.
3. Create a random secret of at least 32 characters. Add it to the worker:

   ```powershell
   npx wrangler secret put IMAGE_SIGNING_SECRET --config cloudflare/delivery-images/wrangler.toml
   ```

   Enter the generated secret when Wrangler prompts.
4. Add the worker URL printed by Wrangler to the Render API service as `R2_IMAGE_WORKER_URL` and the same secret as `R2_IMAGE_WORKER_SECRET`.
5. After those settings are saved, deploy the application release. This makes the six-at-a-time uploader use the Worker-backed image checks as soon as the new API version is live.

Keep `IMAGE_SIGNING_SECRET` and `R2_IMAGE_WORKER_SECRET` private. The API uses the same secret to sign photo links that the worker verifies. The worker accepts only signed links for delivery objects and fixed image sizes.

## Rollout behavior

- Before both API settings are present, Veylo keeps using its existing R2 preview generation and limits browser uploads to two photos at a time. This lets the worker be deployed before switching traffic without overloading the API server.
- Once both settings are present, delivery upload confirmation asks the worker for image dimensions and uses the R2 ETag. It no longer downloads the original to create and store ten variants.
- Delivery pages receive signed worker URLs for thumbnails, responsive previews, and social previews. Original downloads continue to use signed R2 URLs. With the Worker configured, uploads start at six and can adjust between two and ten as the connection changes.
- If Cloudflare cannot make a preview, the worker serves the unchanged R2 original for that request so the photo remains available.
- Cloudflare Images Free currently includes 5,000 unique transformations per month, and its image-info checks are free. If that limit is reached, new transforms are rejected and the worker falls back to the original. See [Cloudflare Images pricing](https://developers.cloudflare.com/images/pricing/).
- The 20 MB delivery limit matches the Cloudflare Images binding input limit. The Image Library upload path remains separate and keeps its 100 MB limit and RAW handling.

The worker uses Cloudflare's Workers Cache for transformed output. It checks each signed link before reading from that cache, so the R2 object remains private.
