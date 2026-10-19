import { defineConfig } from '@playwright/test';

// 效能量測（AT-16 的可自動化部分）。單一 worker，避免和其他測試互相干擾。
export default defineConfig({
  testDir: 'tests/perf',
  timeout: 300_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4182', channel: 'chrome', headless: true, locale: 'zh-TW' },
  webServer: {
    command: 'npm run build && node scripts/serve-gzip.mjs dist 4182',
    url: 'http://localhost:4182/content/catalog.json',
    reuseExistingServer: !!process.env.REUSE_SERVER,
    timeout: 180_000,
  },
});
