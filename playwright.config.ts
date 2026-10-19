import { defineConfig } from '@playwright/test';

// 測「會出貨的東西」：建置後用 vite preview 起正式 bundle（含 CSP 與安全標頭），不是開發伺服器。
// 另外起搜尋代理（測試替身）；vite preview 會把 /api 轉給它，所以瀏覽器看到的是同源。
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4180', channel: 'chrome', headless: true, locale: 'zh-TW', timezoneId: 'Asia/Taipei' },
  webServer: [
    {
      command: 'npx tsx server/index.ts',
      port: 8787,
      reuseExistingServer: !!process.env.REUSE_SERVER,
      timeout: 60_000,
      env: { CIVIC_FIXTURES: '1', CIVIC_QUOTA_PER_MINUTE: '1000', CIVIC_QUOTA_PER_DAY: '100000', CIVIC_QUOTA_PER_MONTH: '1000000' },
    },
    {
      command: 'npm run build && npx vite preview --port 4180 --strictPort',
      url: 'http://localhost:4180/content/catalog.json',
      reuseExistingServer: !!process.env.REUSE_SERVER,
      timeout: 180_000,
      env: { CIVIC_FIXTURES: '1' },
    },
    {
      // 靜態模式：沒有代理、沒有搜尋面板，驗證 AT-20（測驗與清單可獨立運行）
      command: 'npm run build:static && npx vite preview --outDir dist-static --port 4181 --strictPort',
      url: 'http://localhost:4181/content/catalog.json',
      reuseExistingServer: !!process.env.REUSE_SERVER,
      timeout: 180_000,
      env: { CIVIC_FIXTURES: '1' },
    },
    {
      // PWA 版：驗證離線閱讀（AT-14）
      command: 'npm run build:pwa && npx vite preview --outDir dist-pwa --port 4183 --strictPort',
      url: 'http://localhost:4183/content/catalog.json',
      reuseExistingServer: !!process.env.REUSE_SERVER,
      timeout: 180_000,
      env: { CIVIC_FIXTURES: '1' },
    },
  ],
});
