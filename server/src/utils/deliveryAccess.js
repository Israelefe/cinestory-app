// Accept old saved drafts without restoring retired download-lock or watermark
// settings. Other input still passes through the endpoint's strict validation.
export function cleanDeliveryAccess(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const { downloadsLocked, downloadLockNote, watermarkEnabled, watermarkText, locked, note, ...access } = input;
  return access;
}
