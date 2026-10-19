import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// AT-14：下載（快取）後離線只能歷史閱讀，不得宣稱最新；連網後恢復；舊外殼不配新內容。
test.use({ baseURL: 'http://localhost:4183' });

async function installed(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('民主不是你想的那樣');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  // 讓 SW 接管頁面，並把殼與內容放進快取
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.goto('/#/quiz/1');
  await expect(page.getByRole('heading', { name: '情境' })).toBeVisible();
}

test('建置時 SW 版本識別碼已被替換；快取不含 /api 與 status.json', async ({ page }) => {
  const sw = readFileSync(join(process.cwd(), 'dist-pwa', 'sw.js'), 'utf8');
  expect(sw).not.toContain("const VERSION = '__BUILD_ID__'");
  expect(sw).toMatch(/const VERSION = '[0-9a-f]{12}'/);

  await installed(page);
  // 做一次搜尋，確認搜尋結果不會進快取
  await page.getByRole('button', { name: '直接看解釋' }).click();
  await page.getByText('想自己查原始資料').click();
  await page.getByRole('button', { name: /^搜尋$/ }).click();
  await expect(page.getByRole('list', { name: '搜尋結果' }).getByRole('listitem').first()).toBeVisible();
  const keys = await page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) out.push(new URL(r.url).pathname);
    return out;
  });
  expect(keys).toContain('/content/catalog.json');
  expect(keys.some((k) => k.startsWith('/assets/'))).toBe(true);
  expect(keys.some((k) => k.startsWith('/api/'))).toBe(false);
  expect(keys).not.toContain('/content/status.json');
});

test('離線重新整理：外殼與題庫從快取開啟，但只能歷史閱讀；連網後恢復', async ({ page, context }) => {
  await installed(page);
  await context.setOffline(true);
  await page.goto('about:blank');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('民主不是你想的那樣');
  await expect(page.getByText('離線（只能歷史閱讀）')).toBeVisible();
  await expect(page.getByText(/讀不到狀態目錄/)).toBeVisible();

  await page.goto('/#/quiz/1');
  await expect(page.getByText('歷史閱讀：')).toBeVisible();
  await expect(page.locator('input[type=radio]')).toHaveCount(0);
  // 不宣稱是現行答案
  await expect(page.getByRole('heading', { name: '此歷史版本所載的答案（不代表現行規則）' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '憲政體制的答案' })).toHaveCount(0);

  await context.setOffline(false);
  await page.goto('about:blank');
  await page.goto('/#/quiz/1');
  await expect(page.getByRole('heading', { name: '情境' })).toBeVisible();
  await expect(page.locator('input[type=radio]').first()).toBeVisible();
});

test('離線時外部搜尋失敗不影響閱讀（搜尋結果沒有離線版）', async ({ page, context }) => {
  await installed(page);
  await context.setOffline(true);
  await page.goto('about:blank');
  await page.goto('/#/quiz/1');
  await page.getByText('想自己查原始資料').click();
  await expect(page.getByRole('heading', { name: '探索：自己查原始資料' })).toBeVisible();
  await page.getByRole('button', { name: /^搜尋$/ }).click();
  await expect(page.getByTestId('live-status')).toContainText('搜尋沒有成功');
  await expect(page.getByRole('link', { name: /開啟原始資料/ }).first()).toBeVisible(); // 預審清單仍在
});
