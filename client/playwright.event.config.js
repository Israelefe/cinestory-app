import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

// Keep Event Coverage checks independent of other format work in the workspace.
export default defineConfig(base, {
  outputDir: '../.visual-review/event-coverage/test-results',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5184' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5184 --strictPort',
    url: 'http://127.0.0.1:5184',
    reuseExistingServer: false,
    timeout: 30000
  }
});
