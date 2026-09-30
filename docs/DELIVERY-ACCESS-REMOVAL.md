# Watermark and download lock removal

Removed at the owner's request after Render reported an out-of-memory exit.

- Showcase V3, GridBoard V3 and the older creation page no longer offer watermarks,
  temporary download locking or lock notes.
- Dashboard download settings retain individual and full-gallery permissions at
  `PATCH /api/v1/deliveries/:id/download-settings`.
- All eight Showcase viewers, GridBoard, galleries, open photos and creation
  previews ignore old lock flags. They display regular photo URLs.
- Public download handlers ignore old lock flags but still enforce PINs, expiry,
  revoked links, ordinary download permissions and restricted share grants.
- Old draft access payloads can be saved without reactivating retired settings.
  Hydrated delivery JSON/object responses omit the retired access fields.
- The watermark service, public watermark-media route, preview-media route and
  background preview generation were removed. The API does no watermark image
  processing during publication or viewing.
- Cleanup for previously stored preview files remains available when their
  delivery/photo is deleted. No originals or existing deliveries were deleted.
- Cloudinary cleanup accepts nested missing-folder 404 errors and logs only safe
  provider status/codes. SDK errors hide authentication. The duplicate expiry
  index warning was also corrected while retaining the TTL index.

Existing deliveries use the new behaviour once the API and client deployments
are updated and their viewers refresh. This change removes the watermark image
workload; it is not a guarantee that every other API workload fits within 512 MB.

Verified with server access tests, all nine client formats, settings at phone,
tablet and desktop widths, client production build and server syntax checks.
