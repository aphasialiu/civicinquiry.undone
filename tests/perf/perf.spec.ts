import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';

// SPEC NFR-01／NFR-02 的條件：4 倍 CPU 節流、下行 1.6 Mbps、延遲 150 ms，20 次冷啟動。
// 這是桌機 Chrome 加節流的「實驗室數字」，不是中階 Android 實機，也不是真實使用者的 INP。
const RUNS = 20;
const p = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(q * xs.length) - 1)];

test('前端初始 JS（壓縮後）≤ 200 KiB；公開內容 ≤ 2 MiB', () => {
  const dir = join(process.cwd(), 'dist', 'assets');
  const js = readdirSync(dir).filter((f) => f.endsWith('.js'));
  const gz = js.reduce((n, f) => n + gzipSync(readFileSync(join(dir, f))).length, 0);
  console.log(`JS gzip 合計：${(gz / 1024).toFixed(1)} KiB`);
  expect(gz).toBeLessThanOrEqual(200 * 1024);
  const content = readFileSync(join(process.cwd(), 'dist', 'content', 'catalog.json'), 'utf8');
  const bytes = JSON.parse(content).quizzes.reduce((n: number, q: { bytes: number }) => n + q.bytes, 0);
  expect(bytes).toBeLessThanOrEqual(2 * 1024 * 1024);
});

test(`冷啟動 ${RUNS} 次：LCP p75 ≤ 2.5 秒、CLS ≤ 0.1；單題本機互動 p95 ≤ 100 ms`, async ({ browser }) => {
  const lcps: number[] = [], clss: number[] = [], inter: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const ctx = await browser.newContext(); // 每次全新（沒有快取）
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.addInitScript(() => {
      const w = window as unknown as { __lcp: number; __cls: number };
      w.__lcp = 0; w.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as Array<{ hadRecentInput: boolean; value: number }>) if (!e.hadRecentInput) w.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto('/#/quiz/1');
    await expect(page.getByRole('heading', { name: '情境' })).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1200);
    const m = await page.evaluate(() => ({ lcp: (window as unknown as { __lcp: number }).__lcp, cls: (window as unknown as { __cls: number }).__cls }));
    lcps.push(m.lcp); clss.push(m.cls);
    // 單題本機互動：選項 → 下一步，量到下一個畫面完成繪製
    const t = await page.evaluate(async () => {
      const raf = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      const radio = document.querySelector<HTMLInputElement>('input[type=radio]')!;
      const t0 = performance.now();
      radio.click();
      await raf();
      return performance.now() - t0;
    });
    inter.push(t);
    await ctx.close();
  }
  const out = { lcp_p75_ms: Math.round(p(lcps, 0.75)), lcp_max_ms: Math.round(Math.max(...lcps)), cls_max: Math.max(...clss), interaction_p95_ms: Math.round(p(inter, 0.95)) };
  console.log('量測結果：', JSON.stringify(out));
  expect(p(lcps, 0.75)).toBeLessThanOrEqual(2500);
  expect(Math.max(...clss)).toBeLessThanOrEqual(0.1);
  expect(p(inter, 0.95)).toBeLessThanOrEqual(100);
});
