import { expect, test } from '@playwright/test';

// AT-20：只啟用靜態模式（沒有搜尋代理）。注意 vite preview 的 /api 轉發在 4181 也存在，
// 所以另外斷言：頁面上根本沒有搜尋面板，也沒有任何 /api 請求。
test.use({ baseURL: 'http://localhost:4181' });

test('靜態模式：完整作答、探索清單可用，沒有搜尋面板、沒有 /api 請求', async ({ page }) => {
  const apiCalls: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/')) apiCalls.push(r.url()); });
  await page.goto('/#/quiz/1');
  await page.getByLabel('不一定符合。總額沒變不代表沒問題：預算由行政院提出，立法院自己增加某個項目的支出，憲法有限制。').check();
  await page.getByRole('button', { name: '確認答案' }).click();
  await expect(page.locator('#result-h')).toContainText('和憲政規定一致');
  await page.getByText('想自己查原始資料').click();
  await expect(page.getByRole('heading', { name: '探索：自己查原始資料' })).toBeVisible();
  await expect(page.getByRole('link', { name: /開啟原始資料/ }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: '搜尋最新資料' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^搜尋$/ })).toHaveCount(0);
  expect(apiCalls).toEqual([]);
  // 用關鍵詞自己搜尋的外部連結仍在（明確離站）
  await page.getByText('想看更多？用關鍵詞自己搜尋（會離開本站）').click();
  await expect(page.getByRole('link', { name: /釋字391/ }).first()).toBeVisible();
});

test('靜態模式：隱私設定與回顧照常運作', async ({ page }) => {
  await page.goto('/#/privacy');
  await expect(page.getByRole('heading', { name: '隱私與本機資料' })).toBeVisible();
  await page.goto('/#/review');
  await expect(page.getByRole('heading', { name: '回顧' })).toBeVisible();
});
