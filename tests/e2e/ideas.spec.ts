import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const L = (page: Page, name: string) => page.getByLabel(name, { exact: true });
const MARK = '【待改】';

async function startFromIdea(page: Page) {
  await page.goto('/#/author');
  await expect(page.getByRole('heading', { name: '我有一條法條或觀念，想變成題目' })).toBeVisible();
  await expect(page.getByText('先填你的名字，才會出現下面的問題。')).toBeVisible();
  await L(page, '你的名字').fill('王老師');
  await L(page, '素材名稱（例如「憲法第23條」）').fill('中華民國憲法第23條');
  await L(page, '原始來源網址（選填，之後可以補）').fill('https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=A0000001&flno=23');
  await L(page, '定位（條號、段落、頁碼）').fill('第23條');
  await L(page, '2. 用一句話寫出：憲政體制（或這條規定）真正的答案是什麼？').fill('限制人民權利，要有法律依據，而且要符合必要性。');
  await L(page, '3. 大多數人第一反應會怎麼想？').fill('只要是為了維護公共利益，政府怎麼限制都可以。');
  await page.getByLabel(/目的好，手段就一定可以/).check();
  await page.getByRole('button', { name: '產生題目骨架' }).click();
  await expect(page.getByRole('heading', { name: /作者工具：我的題庫/ })).toBeVisible();
}

/** 把所有範本文字（【待改】）改成自己的內容，模擬作者逐欄修改。 */
async function resolvePlaceholders(page: Page) {
  const fields = page.locator('input[type=text]:visible, textarea:visible');
  const n = await fields.count();
  for (let i = 0; i < n; i++) {
    const f = fields.nth(i);
    const v = await f.inputValue();
    if (v.includes(MARK)) await f.fill(v.split(MARK).join('') + '（作者修訂）');
  }
}

test.describe('素材 → 題目靈感 → 分享連結（核心路徑）', () => {
  test('學者拿一條法條出題：骨架保留判斷給作者、提醒範本文字、補完後通過；產生連結；別人點開就能考', async ({ page, browser }) => {
    await startFromIdea(page);

    // 第一反應變成第一階段那句話；正解沒有被替作者猜
    await page.getByRole('button', { name: '3. 題目' }).click();
    await expect(L(page, '聽起來很有道理的話')).toHaveValue('只要是為了維護公共利益，政府怎麼限制都可以。');
    await expect(page.getByLabel('選項 b 是正確答案')).not.toBeChecked();
    await expect(L(page, '問題')).toHaveValue(new RegExp(MARK));

    // 檢查頁：有範本文字提醒，且還不能匯出
    await page.getByRole('button', { name: '4. 檢查與預覽' }).click();
    await expect(page.getByText(/還有 \d+ 個欄位是範本文字/)).toBeVisible();
    await page.getByRole('button', { name: '5. 版本與匯出入' }).click();
    await expect(page.getByRole('button', { name: '下載題庫檔' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '產生分享連結' })).toBeDisabled();

    // 作者逐欄修改：來源與題目
    await page.getByRole('button', { name: '2. 來源' }).click();
    await resolvePlaceholders(page);
    await page.getByRole('button', { name: '3. 題目' }).click();
    await resolvePlaceholders(page);
    await page.getByLabel('選項 b 是正確答案').check();
    await page.getByRole('button', { name: '1. 題庫資訊' }).click();
    await L(page, '題庫介紹').fill('第 23 條的反直覺題');

    await page.getByRole('button', { name: '4. 檢查與預覽' }).click();
    await expect(page.getByText('全部檢查通過')).toBeVisible();
    await expect(page.getByText(/還有 \d+ 個欄位是範本文字/)).toHaveCount(0);

    // 產生連結
    await page.getByRole('button', { name: '5. 版本與匯出入' }).click();
    await page.getByRole('button', { name: '產生分享連結' }).click();
    const link = await page.getByLabel(/分享連結（共/).inputValue();
    expect(link).toContain('#/s/');
    expect(link.length).toBeLessThan(8000);

    // 另一個人（沒有任何草稿、全新瀏覽器）點開連結
    const ctx = await browser.newContext();
    const b = await ctx.newPage();
    const requests: string[] = [];
    b.on('request', (r) => requests.push(r.url()));
    await b.goto(link);
    await expect(b.getByText('這是別人分享給你的題庫')).toBeVisible();
    await expect(b.getByRole('heading', { level: 1 })).toContainText('我的題庫');
    await expect(b.getByText('只要是為了維護公共利益，政府怎麼限制都可以。')).toBeVisible(); // 首頁卡片上的那句話
    await b.getByRole('link', { name: '開始' }).click();
    await b.locator('input[name=knowledge]').nth(1).check();
    await b.getByRole('button', { name: '確認答案' }).click();
    await expect(b.locator('#result-h')).toContainText('和憲政規定一致');
    // 題庫內容沒有透過網路送出（# 後面不會被送出）
    for (const u of requests) expect(u.includes('#'), u).toBe(false);
    for (const u of requests) expect(u.length, u).toBeLessThan(500);
    await ctx.close();
  });

  test('損壞（被截斷）的連結：說明原因、不開啟、可回首頁', async ({ page }) => {
    await page.goto('/#/s/AAAAAAAAAAAAAAAA');
    await expect(page.getByRole('heading', { name: '這個連結打不開' })).toBeVisible();
    await expect(page.getByText('為了安全，這份題庫沒有被開啟')).toBeVisible();
    await page.getByRole('link', { name: '回到首頁' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('民主不是你想的那樣');
  });

  test('連結內容有惡意（HTML）：整份拒絕，沒有腳本執行', async ({ page }) => {
    let dialog = false;
    page.on('dialog', (d) => { dialog = true; void d.dismiss(); });
    const payload = await page.evaluate(async () => {
      const q = {
        schemaVersion: '1.0.0', namespace: 'x.y', quizId: 'evil', version: '0.1.0', title: '<img src=x onerror=alert(1)>', description: 'd', locale: 'zh-Hant-TW', direction: 'ltr', license: 'UNLICENSED',
        authors: [{ id: 'a', displayName: 'a', credentialText: '' }], sources: [], items: [],
      };
      const s = new CompressionStream('deflate-raw');
      const w = s.writable.getWriter();
      void w.write(new TextEncoder().encode(JSON.stringify(q))).then(() => w.close());
      const buf = new Uint8Array(await new Response(s.readable).arrayBuffer());
      return btoa(String.fromCharCode(...buf)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    });
    await page.goto(`/#/s/${payload}`);
    await expect(page.getByRole('heading', { name: '這個連結打不開' })).toBeVisible();
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    expect(dialog).toBe(false);
  });

  test('連結版有自己的作答：不會跟主題庫混在一起', async ({ page }) => {
    await page.goto('/#/quiz/1');
    await page.getByRole('button', { name: '我不知道' }).click();
    await expect(page.locator('#result-h')).toBeVisible();
    await page.goto('/#/review');
    await expect(page.getByText(/教育原型題.*尚無已作答/)).toBeVisible();
  });
});

test.describe('首頁像題庫圖書館：先看到誘人的那句話', () => {
  test('每題卡片有「聽起來很有道理」的那句話，卻不洩漏答案', async ({ page }) => {
    await page.goto('/');
    const cards = page.locator('.gallery-card');
    await expect(cards).toHaveCount(14);
    await expect(cards.first()).toContainText('「國會認為教育比交通重要時，應該能在總額不變下自行重分配預算。」');
    await expect(cards.first()).toContainText('調整預算項目');
    // 不顯示答案、選項
    const text = await page.locator('.gallery').innerText();
    expect(text).not.toContain('憲政體制的答案');
    expect(text).not.toContain('個別項目增加仍涉及憲法上的限制');
  });

  test('「隨機一題」會帶你到某一題；優先挑沒看過的', async ({ page }) => {
    await page.goto('/#/quiz/1');
    await page.getByRole('button', { name: '我不知道' }).click();
    await page.goto('/#/');
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      await page.goto('/#/');
      await page.getByRole('button', { name: '隨機一題' }).click();
      await expect(page).toHaveURL(/#\/quiz\/\d+$/);
      seen.push(page.url().split('/').pop()!);
    }
    expect(seen).not.toContain('1'); // 第 1 題已看過，還有別的沒看過就不會再抽到
    expect(new Set(seen).size).toBeGreaterThan(1);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`axe：首頁圖書館、素材精靈（${scheme}）無 critical/serious；320px 不水平捲動`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      for (const route of ['/', '/#/author']) {
        await page.goto('about:blank');
        await page.goto(route);
        if (route.endsWith('author')) await L(page, '你的名字').fill('X');
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
        expect(r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${route} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
        await page.setViewportSize({ width: 320, height: 640 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), route).toBeLessThanOrEqual(0);
        await page.setViewportSize({ width: 1280, height: 720 });
      }
    });
  }
});
