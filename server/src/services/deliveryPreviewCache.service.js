import DeliveryPreviewFile from '../models/DeliveryPreviewFile.js';

// Old preview records are kept only as database cleanup markers; previews are
// generated into R2 when an original image is first confirmed.
export async function removeStoredPreviews(deliveryId, assetId) {
  const query = { deliveryId, ...(assetId ? { assetId } : {}) };
  await DeliveryPreviewFile.deleteMany(query);
}
