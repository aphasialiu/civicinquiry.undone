import { defineConfig, type Plugin } from 'vitest/config';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import react from '@vitejs/plugin-react';

// SEC-01：正式建置才注入 CSP（開發模式的 HMR 需要內嵌腳本）。
// frame-ancestors 無法用 meta 設定，請在託管端以回應標頭設定，範例見 public/_headers。
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function injectCsp(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' },
    ],
  };
}

// Service Worker 的版本識別碼 = 這次建置所有打包檔名的雜湊，新建置一定不同，舊快取會被清掉。
function stampServiceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'stamp-sw',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const names = readdirSync(join(outDir, 'assets')).sort().join('|');
      const id = createHash('sha256').update(names).digest('hex').slice(0, 12);
      const f = join(outDir, 'sw.js');
      writeFileSync(f, readFileSync(f, 'utf8').replace('__BUILD_ID__', id));
    },
  };
}

const securityHeaders = {
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': `${csp}; frame-ancestors 'none'`,
};

export default defineConfig({
  // 放在子路徑時（GitHub Pages）以 VITE_BASE=/專案名/ 建置；預設是網站根目錄
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), injectCsp(), stampServiceWorker()],
  // 搜尋代理（server/index.ts）與網站同源：開發與預覽都轉發 /api
  server: { proxy: { '/api': 'http://localhost:8787' } },
  preview: { headers: securityHeaders, proxy: { '/api': 'http://localhost:8787' } },
  build: { target: 'es2022', sourcemap: false },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/setup.ts'],
    include: ['tests/*.test.{ts,tsx}'],
    testTimeout: 60000, // 共用主機（CI）比較慢，3000 個隨機突變的對照測試在上面可能超過預設 5 秒
  },
});
