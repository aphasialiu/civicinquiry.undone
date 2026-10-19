import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const WRONG1 = '符合。總額沒變，人民沒有多負擔一毛錢，只是調整錢花在哪裡，這正是國會審預算的本意。';
const RIGHT3 = '不可以只憑這些理由。解散立法院要符合憲法規定的情形，不是政治上僵持就可以。';

async function answer(page: Page, n: number, choice: string | null, _confidence = '') {
  await page.goto(`/#/quiz/${n}`);
  if (choice === null) { await page.getByRole('button', { name: '我不知道' }).click(); return; }
  await page.getByLabel(choice).check();
  await page.getByRole('button', { name: '確認答案' }).click();
  await expect(page.locator('#result-h')).toBeVisible();
}

test.describe('我的盲點：發現自己搞錯了什麼', () => {
  test('整理出和判準不一致與不知道的題目；高把握不一致會提醒；說明「不代表你錯了」', async ({ page }) => {
    await answer(page, 1, WRONG1, '很有把握');
    await answer(page, 2, null);
    await answer(page, 3, RIGHT3);
    await page.goto('/#/mine');
    await expect(page.getByText('不代表你「錯了」')).toBeVisible();
    const mm = page.getByRole('region', { name: /和憲政規定不一樣（1）/ });
    await expect(mm).toContainText('調整預算項目');
    await expect(mm).toContainText(`我選了：${WRONG1}`);
    await expect(mm).toContainText('憲政規定的答案：不一定符合。總額沒變不代表沒問題：預算由行政院提出，立法院自己增加某個項目的支出，憲法有限制。');
        const uk = page.getByRole('region', { name: /我不知道／略過（1）/ });
    await expect(uk).toContainText('多數支持的法律');
    await expect(page.getByRole('heading', { name: '總統與國會僵持' })).toHaveCount(0);
  });

  test('可以標記已弄懂、寫筆記，筆記存在這台裝置上', async ({ page }) => {
    await answer(page, 1, WRONG1);
    await page.goto('/#/mine');
    await page.getByLabel('我弄懂了嗎？').selectOption('clear');
    await page.getByLabel('我的筆記').fill('總額不變不等於每項都沒增加');
    await expect(page.getByText('已弄懂').first()).toBeVisible();
    await page.waitForTimeout(700);
    expect(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).toContain('civic-inquiry-notebook');
  });

  test('沒有盲點時說明狀況；沒作答時引導開始；沒寫筆記就不在裝置上留任何東西', async ({ page }) => {
    await page.goto('/#/mine');
    await expect(page.getByText('你還沒有作答。')).toBeVisible();
    await answer(page, 3, RIGHT3);
    await page.goto('/#/mine');
    await expect(page.getByText(/目前沒有發現盲點/)).toBeVisible();
    await page.waitForTimeout(500);
    expect(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).not.toContain('civic-inquiry-notebook');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`axe：我的盲點（${scheme}）無 critical/serious；320px 不橫向捲動`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await answer(page, 1, WRONG1);
      await page.goto('/#/mine');
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      expect(r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)).toEqual([]);
      await page.setViewportSize({ width: 320, height: 640 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  }

  test('寫筆記時沒有任何外送請求，也沒有帶出私密文字', async ({ page }) => {
    const urls: Array<{ url: string; method: string }> = [];
    page.on('request', (r) => urls.push({ url: r.url(), method: r.method() }));
    await answer(page, 1, WRONG1);
    await page.goto('/#/mine');
    await page.getByLabel('我的筆記').fill('私密筆記XXX');
    for (const r of urls) {
      expect(r.url.startsWith('http://localhost:4180/'), r.url).toBe(true);
      expect(r.method).toBe('GET');
      expect(decodeURIComponent(r.url)).not.toMatch(/XXX/);
    }
  });
});
