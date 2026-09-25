import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const chrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
export default defineConfig({
  testDir: './tests', timeout: 30000, workers: 2, reporter: 'list',
  outputDir: '../.visual-review/delivery-v3/test-results',
  use: { baseURL: 'http://127.0.0.1:5178', headless: true, screenshot: 'only-on-failure', launchOptions: existsSync(chrome) ? { executablePath: chrome } : {} },
  webServer: { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5178', url: 'http://127.0.0.1:5178', reuseExistingServer: !process.env.CI, timeout: 30000 }
});
