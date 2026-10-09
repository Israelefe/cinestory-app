import { defineConfig } from '../client/node_modules/@playwright/test/index.mjs';
import { existsSync } from 'node:fs';
const chrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
export default defineConfig({
  testDir: './tests', workers: 2, timeout: 30000, reporter: 'list',
  outputDir: '../.visual-review/admin-operations/test-results',
  use: { baseURL: 'http://127.0.0.1:5186', headless: true, launchOptions: existsSync(chrome) ? { executablePath: chrome } : {}, screenshot: 'only-on-failure' },
  webServer: { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5186', url: 'http://127.0.0.1:5186', reuseExistingServer: !process.env.CI, timeout: 30000 }
});
