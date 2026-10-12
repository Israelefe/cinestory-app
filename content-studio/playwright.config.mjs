import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export default defineConfig({ testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 30000, use: { baseURL: 'http://127.0.0.1:5059', launchOptions: fs.existsSync(chrome) ? { executablePath: chrome } : {} }, reporter: 'list' });
