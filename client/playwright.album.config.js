import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

// Keep Album's browser server separate from other local format reviews.
export default defineConfig(base, {
  outputDir: '../.visual-review/album/test-results',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5254' },
  webServer: {
    ...base.webServer,
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5254 --strictPort',
    url: 'http://127.0.0.1:5254',
    reuseExistingServer: false
  }
});
