import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

// 單一檔案版：雙擊就能開、完全離線、不對外連線。用 file:// 開，這就是使用者的實際情況。
const SINGLE = resolve(process.cwd(), 'dist-single', 'civic-inquiry-constitution.html');
const fileUrl = pathToFileURL(SINGLE).href;

test('範本與內建題庫版：只有一個被雜湊允許的 script；CSP 禁止一切對外連線；不含外部引用', () => {
  const html = readFileSync(SINGLE, 'utf8');
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)![1];
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("connect-src 'none'");
  expect(csp).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+'/);
  expect(csp).not.toContain('unsafe-inline');
  expect(csp).not.toContain('unsafe-eval');
  expect(html).not.toMatch(/<script[^>]*\ssrc=/);
  expect(html).not.toMatch(/<link[^>]*href=/);
});

test('雙擊開啟（file://）：能直接看題、作答、看解釋；全程沒有任何網路請求', async ({ page }) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(fileUrl);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('民主不是你想的那樣');
  await expect(page.locator('.gallery-card')).toHaveCount(14);
  await expect(page.getByText('分享連結、單一檔案或作者預覽')).toBeVisible();

  await page.getByRole('link', { name: '開始' }).click();
  await page.getByLabel('不一定符合。總額沒變不代表沒問題：預算由行政院提出，立法院自己增加某個項目的支出，憲法有限制。').check();
  await page.getByRole('button', { name: '確認答案' }).click();
  await expect(page.locator('#result-h')).toContainText('和憲政規定一致');
  await page.goto(`${fileUrl}#/mine`);
  await expect(page.getByText(/目前沒有發現盲點|你還沒有作答/)).toBeVisible();

  for (const u of requests) expect(u.startsWith('file://'), u).toBe(true);
  expect(errors.filter((e) => /Content Security Policy|Refused|violat/i.test(e))).toEqual([]);
  expect(errors).toEqual([]);
});

test('單一檔案版在斷網的瀏覽器裡一樣能用', async ({ page, context }) => {
  await context.setOffline(true);
  await page.goto(fileUrl);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('民主不是你想的那樣');
  await page.getByRole('button', { name: '隨機一題' }).click();
  await expect(page.getByRole('heading', { name: '情境' })).toBeVisible();
});

test('作者工具「下載成單一檔案」：做出來的檔案雙擊就能考，而且是作者自己的題庫', async ({ page, browser, baseURL }) => {
  test.skip(!baseURL, 'no baseURL');
  const quizPath = join(process.cwd(), 'content-src', 'fixtures', 'physics.zh-Hant-TW.quiz.json');
  await page.goto('/#/author');
  await page.getByLabel('選擇檔案').setInputFiles(quizPath);
  await page.getByRole('button', { name: '載入成草稿' }).click();
  await page.getByRole('button', { name: '5. 版本與匯出入' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '下載單一檔案（.html）' }).click()]);
  expect(dl.suggestedFilename()).toBe('physics.html');
  // dl.path() 是沒有副檔名的暫存檔，瀏覽器會當純文字；存成真正的 .html 才是使用者看到的情況
  const path = join(process.cwd(), 'test-results', 'physics.html');
  await dl.saveAs(path);
  const html = readFileSync(path, 'utf8');
  expect(html).toContain('落下的快慢');

  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  const requests: string[] = [];
  p2.on('request', (r) => requests.push(r.url()));
  await p2.goto(pathToFileURL(path).href);
  await expect(p2.getByRole('heading', { level: 1 })).toContainText('日常物理');
  await p2.getByRole('link', { name: '開始' }).click();
  await p2.getByLabel('同時到').check();
  await p2.getByRole('button', { name: '確認答案' }).click();
  await expect(p2.locator('#result-h')).toContainText('和憲政規定一致');
  for (const u of requests) expect(u.startsWith('file://'), u).toBe(true);
  await ctx.close();
});

test('壞掉或被竄改的內嵌題庫：整份不啟用，顯示原因', async ({ page }) => {
  const html = readFileSync(SINGLE, 'utf8').replace('"quizId":"constitution"', '"quizId":"X Y"'); // 違反識別碼格式
  expect(html).not.toBe(readFileSync(SINGLE, 'utf8'));
  await page.route('file:///**/tampered.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await page.goto(pathToFileURL(join(process.cwd(), 'dist-single', 'tampered.html')).href);
  await expect(page.getByRole('heading', { name: '這個檔案裡的題庫打不開' })).toBeVisible();
});
