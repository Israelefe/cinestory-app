import api from '../services/api.js';

export async function pollDeliveryProgress(id) {
  const response = await api.get('/v1/deliveries/' + id + '/progress');
  const progress = response.data.data;
  if (progress.generationJob) return { ...progress, progressOnly: true };
  // Fetch captions and photo details once the current task has finished.
  return (await api.get('/v1/deliveries/' + id)).data.data;
}
