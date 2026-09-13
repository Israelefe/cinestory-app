import { lazy } from 'react';
import { clearPageLoadRecovery, isPageChunkError, recoverPageLoadOnce } from './pageLoadRecovery.js';

export default function lazyWithRecovery(importer, pageName) {
  return lazy(async () => {
    try {
      const page = await importer();
      clearPageLoadRecovery();
      return page;
    } catch (error) {
      if (isPageChunkError(error) && recoverPageLoadOnce(pageName)) {
        return new Promise(() => {});
      }
      throw error;
    }
  });
}

