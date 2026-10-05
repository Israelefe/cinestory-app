import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.js';

export default defineConfig(base, {
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit-iphone-11-pro', use: { ...devices['iPhone 11 Pro'], browserName: 'webkit', launchOptions: {} } }
  ]
});
