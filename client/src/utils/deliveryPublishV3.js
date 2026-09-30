import api from '../services/api.js';

// Publishing can succeed even when its response is lost. Only an authenticated
// owner read may recover the result; an uncertain response never counts as success.
export async function recoverPublishedDelivery(id) {
  if (!id) return null;
  try {
    const { data } = await api.get(`/v1/deliveries/${id}`);
    if (data?.data?.status !== 'published' || !data.data.publicId) return null;
    return { publicId: data.data.publicId, url: `${window.location.origin}/d/${encodeURIComponent(data.data.publicId)}` };
  } catch { return null; }
}
