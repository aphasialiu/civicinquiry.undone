import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const WRONG1 = '符合。總額沒變，人民沒有多負擔一毛錢，只是調整錢花在哪裡，這正是國會審預算的本意。';

async function answerQ1(page: Page) {
  await page.getByLabel(WRONG1).check();
  await page.getByRole('button', { name: '確認答案' }).click();
  await expect(page.locator('#result-h')).toBeVisible();
}

test.describe('試答模式（網址加 ?pilot=1）', () => {
  test('一般讀者看不到試答功能', async ({ page }) => {
    await page.goto('/#/quiz/1');
    await answerQ1(page);
    await expect(page.getByRole('heading', { name: /試答回饋/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '試答紀錄' })).toHaveCount(0);
    await expect(page.locator('.fineprint')).not.toContainText('試答版');
  });

  test('作答後出現兩個選填問題；到試答紀錄頁預覽、下載純文字；全程沒有自動外送', async ({ page }) => {
    const requests: Array<{ url: string; method: string }> = [];
    page.on('request', (r) => requests.push({ url: r.url(), method: r.method() }));
    await page.goto('/?pilot=1#/quiz/1');
    await expect(page.locator('.fineprint')).toContainText('【試答版】');
    await answerQ1(page);

    const panel = page.getByRole('region', { name: /試答回饋/ });
    await expect(panel).toBeVisible();
    await panel.getByLabel(/選項 C/).check();
    await panel.getByLabel('情境或選項有哪裡看不懂、讓你卡住嗎？').fill('「國會審預算的本意」我不確定');

    await page.getByRole('link', { name: '試答紀錄' }).click();
    const preview = page.getByLabel('試答紀錄預覽');
    await expect(preview).toContainText('第 1 題　調整預算項目');
    await expect(preview).toContainText('我選：A（符合。總額沒變，人民沒有多負擔一毛錢，只是調整錢…）（和憲政規定不一樣）');
    await expect(preview).toContainText('覺得不太可能有人會選的選項：C');
    await expect(preview).toContainText('「國會審預算的本意」我不確定');
    await expect(preview).toContainText(/花了：\d+ 秒/);

    await page.getByLabel('你的暱稱（選填，不用真名）').fill('小明');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '下載試答紀錄' }).click()]);
    expect(dl.suggestedFilename()).toBe('試答紀錄-小明.txt');
    const text = readFileSync((await dl.path())!, 'utf8');
    expect(text).toContain('暱稱：小明');
    expect(text).toContain('第 1 題');

    // 沒有任何 POST，也沒有查詢字串帶著作答或回饋
    for (const r of requests) {
      expect(r.method, r.url).toBe('GET');
      expect(decodeURIComponent(r.url)).not.toMatch(/不確定|小明|選項/);
    }
  });

  test('試答紀錄頁只含這一輪作答過的題；沒作答時是空的', async ({ page }) => {
    await page.goto('/?pilot=1#/pilot');
    await expect(page.getByLabel('試答紀錄預覽')).toContainText('作答 0 題／共 14 題');
  });

  test('回饋只存在記憶體：重新整理後消失，裝置上沒有留任何資料庫', async ({ page }) => {
    await page.goto('/?pilot=1#/quiz/1');
    await answerQ1(page);
    await page.getByRole('region', { name: /試答回饋/ }).getByLabel('情境或選項有哪裡看不懂、讓你卡住嗎？').fill('測試');
    expect(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).toEqual([]);
    await page.reload();
    await page.goto('/?pilot=1#/pilot');
    await expect(page.getByLabel('試答紀錄預覽')).toContainText('作答 0 題');
  });
});

test.describe('試答版單一檔案（雙擊開啟）', () => {
  const PILOT = resolve(process.cwd(), 'dist-single', 'civic-inquiry-pilot.html');
  const url = pathToFileURL(PILOT).href;

  test('開啟就是試答模式：說明、小字、回饋、紀錄都在；完全離線、沒有網路請求', async ({ page, context }) => {
    await context.setOffline(true);
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto(url);
    await expect(page.getByText('這是試答版，謝謝你幫忙！')).toBeVisible();
    await expect(page.locator('.fineprint')).toContainText('【試答版】');
    await page.getByRole('link', { name: '開始' }).click();
    await answerQ1(page);
    await expect(page.getByRole('region', { name: /試答回饋/ })).toBeVisible();
    await page.getByRole('link', { name: '試答紀錄' }).click();
    await expect(page.getByLabel('試答紀錄預覽')).toContainText('第 1 題　調整預算項目');
    for (const u of requests) expect(u.startsWith('file://'), u).toBe(true);
  });

  test('一般版單一檔案沒有試答功能；兩個檔案只差在設定區塊', () => {
    const normal = readFileSync(join(process.cwd(), 'dist-single', 'civic-inquiry-constitution.html'), 'utf8');
    const pilot = readFileSync(PILOT, 'utf8');
    expect(normal).toContain('id="civic-config">{}</script>');
    expect(pilot).toContain('id="civic-config">{"pilot":true}</script>');
    expect(pilot.replace('{"pilot":true}', '{}')).toBe(normal);
  });
});
