# Local Content Studio decisions — 12 October 2026

Implementation authority: the owner approved implementation and then explicitly requested all phases without further build approval pauses. Human reviews inside the product remain mandatory.

| Decision | Reason | Alternative rejected |
| --- | --- | --- |
| Separate `content-studio/` application | Owner requested a complete local studio and retained responsibility for the old studio | Retirement or edits to production studio |
| Loopback Express, SQLite, local files, one persistent worker | Runs the server and renderer on the owner's PC; survives restart | Cloud rendering and production database reuse |
| Existing React conventions and Remotion 4.0.527 | Fits the repository; all Remotion packages use one version | New UI framework and model-written scene code |
| Real frontend with private rehearsal fixtures | Automates demonstrations without customer data or cloud writes | Fabricated product interfaces or manual screen recording |
| Source-backed, owner-reviewed full product catalog | Covers eight Showcase formats, GridBoard, Photo Swap, video delivery and other features | Photo Story-only generation |
| Manual Google Flow images and clips | Owner explicitly requested exact prompts for both media types | Calling an image/video generation API |
| No promotional prices or allowances | Owner wants visits; free-account CTA allowed | Resolving historical prices by guessing |
| 20–40 seconds; demo section absorbs time | Owner's revised duration requirement | Silently rejecting 20-second jobs |
| Remotion-bundled FFmpeg/ffprobe | Already pinned and available locally | Separate system installation |
| Patched Express, Vite and PostCSS | Initial install exposed high-severity advisories | Keeping old dependency versions |
| Fonts extracted/reused from existing local Veylo assets | Offline typography and consistent appearance | Remote fonts during rendering |
| Real finished-work slots and generated context slots have separate rules | Protects photographers from presenting synthetic work as their own finished photographs | Generating every missing photo slot |
| Measured text bounds and encoded-audio loudness block final QA | The render proofs exposed actual wrapping and bundled-media compatibility issues | Assuming successful encoding proves correct layout or sound |
| Rights and provenance are rechecked at export and included with the font license | Keeps the package reviewable after an asset permission changes | A video-only export without supporting records |
| Conservative safe zones, with additional animation insets | Organic platform controls vary; no universal official pixel margin was established | Describing a studio default as a platform guarantee |
| Local rehearsal captures cannot support speed claims | Disposable fixtures do not measure production latency | Quoting mocked upload-to-delivery timing |
| Ten live calibration jobs and owner creative scores remain first-use checks | No credentials or owner voice/quality decisions were supplied | Reporting provider doubles as live model acceptance |
| Pan/zoom/mask movement and manual video clips in V1; no automatic layer separation | Depth/segmentation adds runtime and edge-repair work without an owner-image benchmark | Shipping untested parallax or noncommercial model weights |

Provider availability, account limits and creative calibration require the owner's credentials. Automated tests must never pretend these checks ran successfully without live results.

Final verification also covers single-scene regeneration, structured length changes, screen-reference extraction and secret-free speech logs. Provider verification repeats planted-claim refusals after model or policy changes. Pre-encode audio retains extra peak headroom; final encoded loudness remains the acceptance check.
