export function deliveryPreparationMessage(job) {
  let message = 'Preparing your delivery';
  if (job?.stage === 'analysing-photos') {
    const { done, total } = job.counts?.analysis || {};
    message = Number.isInteger(done) && Number.isInteger(total) && total > 0
      ? `${done} of ${total} photos analysed` : 'Reviewing your photographs';
  } else if (['writing-captions', 'writing-showcase'].includes(job?.stage)) {
    const { done, total } = job.counts?.writing || {};
    message = Number.isInteger(done) && Number.isInteger(total) && total > 0
      ? `${done} of ${total} captions written` : 'Writing your captions';
  } else if (job?.stage === 'designing-pinboard') message = 'Building your board layouts';
  return job?.modelQueue === 'waiting' ? `${message}. More processing will continue shortly.` : message;
}
