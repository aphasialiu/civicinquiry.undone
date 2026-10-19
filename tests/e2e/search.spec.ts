import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function openExplanation(page: Page, opts: { answer?: string | null; intuition?: string | null } = {}) {
  await page.goto('/#/quiz/1');
  await expect(page.getByRole('heading', { name: '情境' })).toBeVisible();
  if (opts.answer === null) {
    await page.getByRole('button', { name: '直接看解釋' }).click();
  } else {
    await page.getByLabel(opts.answer ?? '不一定符合。總額沒變不代表沒問題：預算由行政院提出，立法院自己增加某個項目的支出，憲法有限制。').check();
    await page.getByRole('button', { name: '確認答案' }).click();
  }
  await expect(page.locator('#result-h')).toBeVisible();
  await page.getByText('想自己查原始資料').click();
}

const searchBtn = (p: Page) => p.getByRole('button', { name: /^(搜尋|重新搜尋)$/ });

test.describe('AT-08 搜尋與降級', () => {
  test('按下搜尋才送出；結果明示測試資料、未審查、來源與取得時間；去重與篩選有說明', async ({ page }) => {
    const posts: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/v1/search')) posts.push(r.method()); });
    await openExplanation(page);
    // 改篩選、打字都不會送出
    await page.getByLabel('語言').selectOption('en');
    await page.getByLabel('語言').selectOption('zh-Hant');
    await page.getByLabel(/只看已通過審查/).check();
    await page.getByLabel(/只看已通過審查/).uncheck();
    expect(posts).toEqual([]);

    await searchBtn(page).click();
    const list = page.getByRole('list', { name: '搜尋結果' });
    await expect(list.getByRole('listitem').first()).toBeVisible();
    expect(posts).toEqual(['POST']);
    await expect(page.getByTestId('live-status')).toContainText('即時結果');
    await expect(page.getByText(/測試替身，下面的「即時結果」是假資料/)).toBeVisible();
    const first = list.getByRole('listitem').first();
    await expect(first).toContainText('測試資料');
    await expect(first).toContainText('未審查');
    await expect(first).toContainText('取得時間');
    await expect(first).toContainText('供應商片段');
    // 同一篇只差追蹤參數 → 只出現一次；繁簡不混；語言未知被排除並說明
    await expect(list.getByRole('heading', { name: /第 1 筆/ })).toHaveCount(1);
    await expect(list.getByRole('heading', { name: /簡體中文結果/ })).toHaveCount(0);
    await expect(page.getByText(/語言未知，已排除/)).toBeVisible();
    // 外連安全
    const rels = await list.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('rel')));
    for (const rel of rels) expect(rel).toMatch(/noopener.*noreferrer|noreferrer.*noopener/);
  });

  for (const [name, status, body, expectText] of [
    ['上游 502', 502, { code: 'UPSTREAM_FAILED', message: '搜尋服務發生錯誤，請稍後再試。', retryAfterSeconds: null, canUseCurated: false }, '搜尋服務發生錯誤'],
    ['上游 429', 429, { code: 'RATE_LIMITED', message: '搜尋服務目前忙碌（被限流），請稍後再試。', retryAfterSeconds: 30, canUseCurated: false }, '約 30 秒後再試'],
    ['未啟用 503', 503, { code: 'DISABLED', message: '即時搜尋尚未啟用', retryAfterSeconds: null, canUseCurated: false }, '即時搜尋尚未啟用'],
  ] as const) {
    test(`${name}：顯示可操作的訊息，預審清單與下一題都不受影響`, async ({ page }) => {
      await page.route('**/api/v1/search', (r) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }));
      await openExplanation(page);
      await searchBtn(page).click();
      await expect(page.getByTestId('live-status')).toContainText('搜尋沒有成功');
      await expect(page.getByText(expectText).first()).toBeVisible();
      // 預審清單（上方）還在，而且可以前往下一題
      await expect(page.getByRole('heading', { name: '探索：自己查原始資料' })).toBeVisible();
      await expect(page.getByRole('link', { name: /開啟原始資料/ }).first()).toBeVisible();
      await page.getByRole('link', { name: '下一題' }).click();
      await expect(page).toHaveURL(/#\/quiz\/2$/);
      await expect(page.getByRole('heading', { name: '情境' })).toBeVisible();
      // 還可以重試
      await page.goBack();
      await page.getByText('想自己查原始資料').click();
      await expect(searchBtn(page)).toBeEnabled();
    });
  }

  test('網路中斷 → 說明並可重試', async ({ page }) => {
    await page.route('**/api/v1/search', (r) => r.abort('failed'));
    await openExplanation(page);
    await searchBtn(page).click();
    await expect(page.getByTestId('live-status')).toContainText('無法連線到搜尋服務');
    await page.unroute('**/api/v1/search');
    await searchBtn(page).click();
    await expect(page.getByRole('list', { name: '搜尋結果' }).getByRole('listitem').first()).toBeVisible();
  });

  test('超過 8 秒沒回應 → 逾時訊息，不卡住測驗', async ({ page }) => {
    test.setTimeout(30_000);
    await page.route('**/api/v1/search', () => { /* 永不回應 */ });
    await openExplanation(page);
    const t0 = Date.now();
    await searchBtn(page).click();
    await expect(page.getByTestId('live-status')).toContainText('超過 8 秒', { timeout: 12_000 });
    expect(Date.now() - t0).toBeLessThan(11_000);
    await expect(page.getByRole('link', { name: '下一題' })).toBeVisible();
  });
});

test.describe('AT-07 篩選語意', () => {
  test('日期：限定時排除日期未知與範圍外並說明；不限日期時日期未知的會出現', async ({ page }) => {
    await openExplanation(page);
    await searchBtn(page).click();
    const list = page.getByRole('list', { name: '搜尋結果' });
    await expect(list.getByRole('listitem').first()).toBeVisible();
    await expect(list.getByText('發布：未知').first()).toBeVisible();

    await page.getByLabel(/發布日期：從/).fill('2026-03-01');
    await page.getByLabel('到', { exact: true }).fill('2026-09-20');
    await searchBtn(page).click();
    await expect(page.getByText(/發布日期未知的結果已排除/)).toBeVisible();
    const dates = await list.getByRole('listitem').evaluateAll((els) => els.map((e) => /發布：(\S+?)｜/.exec(e.textContent ?? '')?.[1]));
    expect(dates.sort()).toEqual(['2026-03-01', '2026-09-20']);
  });

  test('日期起訖顛倒時擋住送出並說明', async ({ page }) => {
    await openExplanation(page);
    await page.getByLabel(/發布日期：從/).fill('2026-10-02');
    await page.getByLabel('到', { exact: true }).fill('2026-10-01');
    await expect(page.getByRole('alert')).toContainText('起始日期不能晚於結束日期');
    await expect(searchBtn(page)).toBeDisabled();
  });

  test('語言：繁體不混簡體；選簡體才看到簡體結果', async ({ page }) => {
    await openExplanation(page);
    await page.getByLabel('語言').selectOption('zh-Hans');
    await searchBtn(page).click();
    await expect(page.getByRole('list', { name: '搜尋結果' }).getByRole('heading', { name: /簡體中文結果/ })).toBeVisible();
  });

  test('只看已審查：沒有動態結果，並明說目前沒有已審資料', async ({ page }) => {
    await openExplanation(page);
    await page.getByLabel(/只看已通過審查/).check();
    await searchBtn(page).click();
    await expect(page.getByText('目前沒有任何已通過專業審查的資料。')).toBeVisible();
    await expect(page.getByRole('list', { name: '搜尋結果' }).getByRole('listitem')).toHaveCount(0);
  });

  test('官方類別：預審清單排在即時結果前面並標示編輯預審', async ({ page }) => {
    await openExplanation(page);
    await page.getByLabel('資料類別').selectOption('official');
    await searchBtn(page).click();
    const items = page.getByRole('list', { name: '搜尋結果' }).getByRole('listitem');
    await expect(items.first()).toContainText('編輯預審');
    await expect(items.first()).toContainText('未審查');
  });
});

test.describe('AT-17 搜尋隔離：答對、答錯、沒答的搜尋請求完全相同', () => {
  const scenarios: Array<[string, Parameters<typeof openExplanation>[1]]> = [
    ['答對、價值選較同意', { intuition: '較同意' }],
    ['答錯、價值選較不同意', { intuition: '較不同意', answer: '符合。總額沒變，人民沒有多負擔一毛錢，只是調整錢花在哪裡，這正是國會審預算的本意。' }],
    ['沒作答（直接看解釋）', { answer: null }],
  ];
  test('三種情況送出的 body、標頭與網址相同，沒有 cookie 或識別資料', async ({ browser }) => {
    const seen: Array<{ url: string; body: string; headers: Record<string, string>; method: string }> = [];
    for (const [, opts] of scenarios) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      page.on('request', (r) => {
        if (r.url().includes('/api/v1/search')) seen.push({ url: r.url(), body: r.postData() ?? '', headers: r.headers(), method: r.method() });
      });
      await openExplanation(page, opts);
      await searchBtn(page).click();
      await expect(page.getByRole('list', { name: '搜尋結果' }).getByRole('listitem').first()).toBeVisible();
      expect((await ctx.cookies()).length).toBe(0);
      await ctx.close();
    }
    expect(seen).toHaveLength(3);
    expect(new Set(seen.map((s) => s.body)).size).toBe(1);
    expect(new Set(seen.map((s) => s.url)).size).toBe(1);
    expect(new Set(seen.map((s) => s.method)).size).toBe(1);
    for (const s of seen) {
      expect(s.headers['cookie']).toBeUndefined();
      expect(s.headers['authorization']).toBeUndefined();
      expect(Object.keys(JSON.parse(s.body)).sort()).toEqual(['category', 'cursor', 'from', 'language', 'profileId', 'region', 'reviewFilter', 'sourceTypes', 'to']);
      expect(s.body).not.toMatch(/answer|confidence|runId|較同意|較不同意|很有把握|note/i);
    }
  });

  test('搜尋時不預載外站圖片或追蹤，所有請求都是同源', async ({ page }) => {
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    await openExplanation(page);
    await searchBtn(page).click();
    await expect(page.getByRole('list', { name: '搜尋結果' }).getByRole('listitem').first()).toBeVisible();
    for (const u of urls) expect(u.startsWith('http://localhost:4180/'), u).toBe(true);
    await expect(page.locator('img')).toHaveCount(0);
  });
});

test.describe('無障礙（含搜尋結果）', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`axe：解釋＋搜尋結果（${scheme}）無 critical/serious`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openExplanation(page);
      await searchBtn(page).click();
      await expect(page.getByRole('list', { name: '搜尋結果' }).getByRole('listitem').first()).toBeVisible();
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      const bad = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    });
  }
  test('320px 寬含搜尋結果不水平捲動', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openExplanation(page);
    await searchBtn(page).click();
    await expect(page.getByRole('list', { name: '搜尋結果' }).getByRole('listitem').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
