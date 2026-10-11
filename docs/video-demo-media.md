# Video demo footage

The video demo, homepage video card, Product page and Video Delivery page use the two Pexels clips downloaded by the site owner on 11 October 2026. They are examples of the player, not work filmed by Veylo or a testimonial from anyone shown.

| Sample | Downloaded file | Pexels source | Original |
| --- | --- | --- | --- |
| The drummer, up close | `reel.mp4` | [Video 34773580](https://www.pexels.com/video/34773580/) | 1080 × 1920, 14.2142 seconds, 17,412,368 bytes, no audio |
| A celebration, in full view | `youtube.mp4` | [Video 39773431](https://www.pexels.com/video/39773431/) | 3840 × 2160, 12.245567 seconds, 104,444,844 bytes, no audio |

The source CDN URLs were recovered from the downloaded files' Windows origin metadata. The source pages required Pexels security verification during review, so creator names have not been guessed. Original SHA-256 checksums, exact R2 keys and source URLs are recorded in `client/src/constants/videoDemoMedia.js`.

[Pexels commercial-use guidance](https://help.pexels.com/hc/en-us/articles/360042295214-Can-I-use-the-photos-and-videos-for-a-commercial-project) permits use on commercial websites. [Its terms](https://www.pexels.com/terms-of-service/) still apply, including restrictions on standalone distribution, misleading ownership claims, endorsement and third-party rights. Review any visible people, brands or property for the intended use. The samples have no Download button or native download menu; actual photographer deliveries keep their own download permissions.

## Hosting

The originals are unchanged in the private `veylo` R2 bucket under `veylo/system/video-demos/`. Only the two exact versioned paths in the manifest are public through `/demo-videos/<filename>` on the delivery media Worker. The route accepts GET, HEAD and OPTIONS, checks expected object size and supports byte-range requests for seeking. It never accepts arbitrary object keys. Private delivery routes and their signed access checks are unchanged.

Cover frames are small WebP assets in `client/public/veylo/video/`. Marketing players use `preload="none"`, so opening the homepage does not fetch the 104 MB landscape original. The dedicated client demo starts the selected original; no compressed playback copies are generated. The older light-study files remain only to support deterministic playback and audio tests.

Upload the originals with `wrangler r2 object put veylo/<objectKey> --file <local-file> --content-type video/mp4 --remote`, deploy the media Worker, verify full and partial responses, then publish the client. Changes to the actual footage require a new filename and checksum in the shared manifest.

Run `node --test server/scripts/video-demo-media.test.mjs` for public-route isolation, seeking, HEAD, conditional requests and storage failure checks. Browser coverage is in `client/tests/video-delivery.spec.js`.
