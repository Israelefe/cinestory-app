import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

export default defineConfig({
  ...base,
  outputDir: '../.visual-review/campaign/test-results',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5185' },
  webServer: {
    ...base.webServer,
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5185 --strictPort',
    url: 'http://127.0.0.1:5185',
    reuseExistingServer: false
  }
});
