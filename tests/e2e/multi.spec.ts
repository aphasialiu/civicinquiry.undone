import { expect, test } from '@playwright/test';

// AT-13：科學與歷史題庫、zh-Hant 與英文譯本；原文升版。不改引擎。
test('題庫清單：列出其他題庫與語言版本，切換後作答互相獨立', async ({ page }) => {
  await page.goto('/');
  const others = page.getByRole('region', { name: '其他題庫與語言版本' });
  await expect(others).toBeVisible();
  await expect(others.getByRole('link', { name: '【測試題庫】日常物理' })).toBeVisible();
  await expect(others.getByRole('link', { name: '【測試題庫】歷史小常識' })).toBeVisible();

  // 主題庫答一題
  await page.goto('/#/quiz/1');
  await page.getByLabel('不一定符合。總額沒變不代表沒問題：預算由行政院提出，立法院自己增加某個項目的支出，憲法有限制。').check();
  await page.getByRole('button', { name: '確認答案' }).click();
  await expect(page.locator('#result-h')).toBeVisible();

  // 切到物理題庫（用帶 # 的網址，維持同一份頁面狀態；不帶 # 會整頁重載而清掉記憶體中的作答）
  await page.goto('/#/');
  await others.getByRole('link', { name: '【測試題庫】日常物理' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('日常物理');
  await page.getByRole('link', { name: '開始' }).click();
  await expect(page).toHaveURL(/#\/q\/\d+\/quiz\/1$/);
  await expect(page.getByRole('heading', { name: '情境' })).toBeVisible(); // 沒有繼承憲政題庫的答案
  await page.getByLabel('同時到').check();
  await page.getByRole('button', { name: '確認答案' }).click();
  await expect(page.locator('#result-h')).toContainText('和憲政規定一致');
  // 回顧只算這份題庫
  await page.getByRole('link', { name: '下一題' }).click();
  await page.goto(page.url().replace(/quiz\/\d+$/, 'review'));
  await expect(page.getByRole('heading', { name: '回顧' })).toBeVisible();
  await expect(page.getByText(/教育原型題.*1 \/ 1/)).toBeVisible();
  // 主題庫的回顧仍是自己的 1 題
  await page.goto('/#/review');
  await expect(page.getByText(/教育原型題.*1 \/ 1/)).toBeVisible();
});

test('英文譯本：獨立審查狀態、原文升版標示待更新、缺譯文引導讀原文、UI 與題庫語言分開', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('region', { name: '其他題庫與語言版本' }).getByRole('link', { name: /Everyday Physics/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Everyday Physics');

  // 翻譯資訊與缺譯文
  const tr = page.getByRole('region', { name: '這是翻譯版本' });
  await expect(tr).toContainText('審查狀態獨立');
  await expect(tr).toContainText('不會沿用原文的審查結果');
  await expect(tr.getByText(/有 1 題還沒有譯文/)).toBeVisible();
  await expect(tr.getByRole('link', { name: '冰塊融化後的水位' })).toBeVisible();

  // 題目內容是英文，但操作介面還是介面語言
  await page.getByRole('link', { name: '開始' }).click();
  await expect(page.getByText('In a vacuum, you release an iron ball and a feather at the same moment.')).toBeVisible();
  await page.getByLabel('They arrive together').check();
  await page.getByRole('button', { name: '確認答案' }).click();
  await expect(page.locator('#result-h')).toContainText('和憲政規定一致');
  // 原文已升到 0.2.0、譯本停在 0.1.0 → 待更新
  await expect(page.getByText(/譯文待更新：原文已更新到版本 0\.2\.0/)).toBeVisible();
  // 譯文自己的狀態：未審查（沒有沿用任何原文狀態）
  await expect(page.locator('.fineprint')).toContainText('尚未經過獨立的法律與教育專業審查');
});

test('缺譯文的連結會導向原文題目', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('region', { name: '其他題庫與語言版本' }).getByRole('link', { name: /Everyday Physics/ }).click();
  await page.getByRole('region', { name: '這是翻譯版本' }).getByRole('link', { name: '冰塊融化後的水位' }).click();
  await expect(page.getByText('杯子裡的水面上漂著一塊冰，冰完全融化。')).toBeVisible();
});

test('狀態目錄以（題目、版本、語系）為鍵：譯本即使原文被標已審查也不會繼承', async ({ page }) => {
  const st = await (await page.request.get('/content/status.json')).json();
  const zh = st.entries.find((e: { itemId: string; locale: string }) => e.itemId === 'phys-fall' && e.locale === 'zh-Hant-TW');
  const en = st.entries.find((e: { itemId: string; locale: string }) => e.itemId === 'phys-fall' && e.locale === 'en');
  expect(zh).toBeTruthy();
  expect(en).toBeTruthy();
  expect(en.sha256).not.toBe(zh.sha256);
  expect(en.verification).toBe('unreviewed');
  expect(en.reason).toBe('translation_outdated:0.2.0');
});
