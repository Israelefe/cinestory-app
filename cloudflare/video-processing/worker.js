import { DurableObject } from 'cloudflare:workers';
import { processingClasses, handleProcessing, scheduledProcessing } from './processing.js';

const { Coordinator, Encoder } = processingClasses(DurableObject);
export class VideoCoordinator extends Coordinator {}
export class VideoEncoder extends Encoder {}
export default {
  fetch: handleProcessing,
  scheduled(event, env, ctx) { ctx.waitUntil(scheduledProcessing(env)); }
};
