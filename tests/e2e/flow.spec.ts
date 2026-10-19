import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const ORIGIN = 'http://localhost:4180';

/** 第一題（單選，正解 b）：走完整個流程到揭曉。 */
async function answerItem1(page: Page, opts: { intuition?: string; knowledge?: string; confidence?: string | null } = {}) {
  void opts.intuition; void opts.confidence; // 舊流程的參數：新流程沒有立場與把握程度
  await page.goto('/#/quiz/1');
  await expect(page.getByRole('heading', { name: '情境' })).toBeVisible();
  await page.getByLabel(opts.knowledge ?? '不一定符合。總額沒變不代表沒問題：預算由行政院提出，立法院自己增加某個項目的支出，憲法有限制。').check();
  await page.getByRole('button', { name: '確認答案' }).click();
  await expect(page.locator('#result-h')).toBeVisible();
}

test.describe('AT-01 無帳號可用', () => {
  test('全新瀏覽器開啟、完成一題，不出現登入或個資要求', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('民主不是你想的那樣');
    await expect(page.locator('input[type=password], input[type=email]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /登入|註冊/ })).toHaveCount(0);
    await answerItem1(page);
    await expect(page.locator('#result-h')).toContainText('和憲政規定一致');
  });
});

test.describe('一頁讀完：不問立場、不問把握', () => {
  test('情境、問題與選項同一頁；沒有「你的立場」或「有多少把握」；答案相同的人結果相同', async ({ browser }) => {
    const results: string[] = [];
    for (let i = 0; i < 2; i++) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto('/#/quiz/1');
      await expect(page.getByRole('heading', { name: '情境' })).toBeVisible();
      await expect(page.getByRole('radio').first()).toBeVisible(); // 選項就在同一頁
      const text = await page.locator('article').innerText();
      expect(text).not.toMatch(/把握|較同意|較不同意|尚無主張|你的立場|第一步|第二步/);
      await page.getByLabel('不一定符合。總額沒變不代表沒問題：預算由行政院提出，立法院自己增加某個項目的支出，憲法有限制。').check();
      await page.getByRole('button', { name: '確認答案' }).click();
      results.push(await page.locator('#result-h').innerText());
      await ctx.close();
    }
    expect(results[0]).toBe(results[1]);
    expect(results[0]).toContain('和憲政規定一致');
  });

  test('揭曉後不能覆寫首次答案：回到同一題只讀，沒有可改的選項', async ({ page }) => {
    await answerItem1(page, { knowledge: '符合。總額沒變，人民沒有多負擔一毛錢，只是調整錢花在哪裡，這正是國會審預算的本意。' });
    await expect(page.locator('#result-h')).toContainText('不一樣');
    await page.goto('/#/quiz/2');
    await page.goto('/#/quiz/1');
    await expect(page.locator('#result-h')).toContainText('不一樣');
    await expect(page.locator('input[type=radio]')).toHaveCount(0);
  });
});

test.describe('作答細節', () => {
  test('「我不知道」「略過」不算答錯，也不進分母', async ({ page }) => {
    await page.goto('/#/quiz/1');
    await page.getByRole('button', { name: '我不知道' }).click();
    await expect(page.locator('#result-h')).toContainText('不知道');
    await page.goto('/#/quiz/2');
    await page.getByRole('button', { name: '我不知道' }).click();
    await page.goto('/#/review');
    await expect(page.getByText('尚無已作答的原型題')).toBeVisible();
    await expect(page.getByText('正式計分：尚無可計分題')).toBeVisible();
  });

  test('原型題的結果另計，不混進正式計分', async ({ page }) => {
    await answerItem1(page);
    await page.goto('/#/review');
    await expect(page.getByText('正式計分：尚無可計分題')).toBeVisible();
    await expect(page.getByText(/教育原型題.*1 \/ 1/)).toBeVisible();
  });

  test('沒有定論的題也有選項；選一個之後看到「這個想法隱含的前提」，不判對錯、不計分', async ({ page }) => {
    await page.goto('/#/quiz/5');
    await expect(page.getByRole('radio')).toHaveCount(4);
    await expect(page.getByText('這題沒有標準答案，選一個你覺得最合理的說法就好。')).toBeVisible();
    await page.getByLabel(/^政府比較了解實際情況/).check();
    await page.getByLabel(/我的想法（選填/).fill('先查兩個規定的位階');
    await page.getByRole('button', { name: '確認我的想法' }).click();
    await expect(page.locator('#result-h')).toContainText('這題沒有標準答案');
    await expect(page.getByRole('heading', { name: '這題沒有標準答案，可以這樣想' })).toBeVisible();
    await expect(page.locator('p', { hasText: '你選的想法：' })).toContainText('這個想法假設政府比較了解情況');
    await expect(page.locator('.answer')).toHaveCount(0); // 沒有「標準答案」框
    await page.goto('/#/review');
    await expect(page.getByText('正式計分：尚無可計分題')).toBeVisible();
  });

  test('雙擊「確認」只記一次（冪等）', async ({ page }) => {
    await page.goto('/#/quiz/1');
    await page.getByLabel('不一定符合。總額沒變不代表沒問題：預算由行政院提出，立法院自己增加某個項目的支出，憲法有限制。').check();
    await page.getByRole('button', { name: '確認答案' }).dblclick();
    await expect(page.locator('#result-h')).toBeVisible();
    await page.goto('/#/review');
    await expect(page.getByText(/教育原型題.*1 \/ 1/)).toBeVisible();
  });

  test('重新練習另起一輪，首次答案仍在、分數不混算', async ({ page }) => {
    await answerItem1(page);
    await page.goto('/#/review');
    await page.getByRole('button', { name: /重新練習/ }).click();
    await expect(page.getByRole('heading', { name: '情境' })).toBeVisible();
    await answerItem1(page, { knowledge: '符合。總額沒變，人民沒有多負擔一毛錢，只是調整錢花在哪裡，這正是國會審預算的本意。' });
    await page.goto('/#/review');
    await expect(page.getByText(/教育原型題.*1 \/ 1/)).toBeVisible(); // 仍只算首次
  });
});

test.describe('AT-05 有效性與撤回', () => {
  test('超過 reviewDueAt（2026-11-15T16:00Z）→ 歷史閱讀、不計分、也不能作答', async ({ page }) => {
    // 狀態目錄是 24 小時有效；時鐘移到之後，目錄也會過期，兩者都會導向歷史閱讀
    await page.clock.setFixedTime(new Date('2026-12-01T00:00:00Z'));
    await page.goto('/#/quiz/1');
    await expect(page.getByText('歷史閱讀：')).toBeVisible();
    await expect(page.locator('input[type=radio]')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '此歷史版本所載的答案（不代表現行規則）' })).toBeVisible();
  });

  test('狀態目錄讀不到 → 歷史閱讀，不默認有效', async ({ page }) => {
    await page.route('**/content/status.json', (r) => r.fulfill({ status: 503, body: 'down' }));
    await page.goto('/#/quiz/1');
    await expect(page.getByText(/讀不到狀態目錄/)).toBeVisible();
    await expect(page.locator('input[type=radio]')).toHaveCount(0);
  });

  test('目錄標示撤回 → 顯示理由而不是 404', async ({ page }) => {
    await page.route('**/content/status.json', async (route) => {
      const res = await route.fetch();
      const j = await res.json();
      j.entries[0].lifecycle = 'withdrawn';
      j.entries[0].reason = '來源判決已有更新';
      await route.fulfill({ response: res, json: j });
    });
    await page.goto('/#/quiz/1');
    await expect(page.getByRole('heading', { name: '這一題已撤回' })).toBeVisible();
    await expect(page.getByText('撤回理由：來源判決已有更新')).toBeVisible();
  });

  test('揭曉前才被撤回：以揭曉前重新確認的結果為準，不計分', async ({ page }) => {
    let calls = 0;
    await page.route('**/content/status.json', async (route) => {
      calls++;
      const res = await route.fetch();
      const j = await res.json();
      if (calls > 1) { j.entries[0].lifecycle = 'withdrawn'; j.entries[0].reason = '剛被撤回'; }
      await route.fulfill({ response: res, json: j });
    });
    await page.goto('/#/quiz/1');
    await page.getByLabel('不一定符合。總額沒變不代表沒問題：預算由行政院提出，立法院自己增加某個項目的支出，憲法有限制。').check();
    await page.getByRole('button', { name: '確認答案' }).click();
    await expect(page.getByRole('heading', { name: '這一題已撤回' }).or(page.locator('#result-h'))).toBeVisible();
    await page.goto('/#/review');
    await expect(page.getByText(/教育原型題.*尚無已作答的原型題/)).toBeVisible();
  });

  test('離線 → 歷史閱讀', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(); // 等載入完成才斷網
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await page.evaluate(() => { location.hash = '#/quiz/2'; });
    await expect(page.getByText('歷史閱讀：')).toBeVisible();
  });
});

test.describe('AT-06 / PR-01 隱私：答案不外傳、預設不留存', () => {
  test('完整走一題＋開探索＋寫筆記：所有請求同源、沒有答案或筆記、儲存空白', async ({ page, context }) => {
    const requests: { url: string; method: string; body: string | null }[] = [];
    page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));

    await answerItem1(page, { intuition: '較不同意', confidence: '沒把握' });
    const note = '我的私人筆記XYZ123';
    await page.getByText('想一想、寫筆記').click();
    await page.getByLabel(/我的筆記/).fill(note);
    await page.getByText('想自己查原始資料').click();
    await page.getByLabel('資料類別').selectOption('official');
    await page.getByText('想看更多？用關鍵詞自己搜尋（會離開本站）').click();

    // 所有請求都打自己的來源，且只有 GET
    for (const r of requests) {
      expect(r.url.startsWith(ORIGIN), r.url).toBe(true);
      expect(r.method).toBe('GET');
      expect(r.body).toBeNull();
      // 白名單：網址不得有查詢字串或片段，路徑只能是頁面本身、打包資源與 /content 內的固定檔案
      const u = new URL(r.url);
      expect(u.search, r.url).toBe('');
      const allowed = /^\/(assets\/[\w.-]+|content\/(catalog|status)\.json|content\/prototype\.tw\/constitution\/0\.1\.0\/zh-Hant-TW\.json|favicon\.ico|icon\.svg|manifest\.webmanifest)?$/;
      expect(u.pathname, r.url).toMatch(allowed);
      expect(decodeURIComponent(r.url)).not.toMatch(/XYZ123|confidence|selected|runId|較不同意|沒把握/);
    }
    // 沒有持續儲存
    const storage = await page.evaluate(async () => ({
      ls: Object.keys(localStorage).length,
      ss: Object.keys(sessionStorage).length,
      dbs: (await indexedDB.databases()).map((d) => d.name),
      cookie: document.cookie,
    }));
    expect(storage).toEqual({ ls: 0, ss: 0, dbs: [], cookie: '' });
    expect((await context.cookies()).length).toBe(0);
    // 網址不含答案
    expect(page.url()).toBe(`${ORIGIN}/#/quiz/1`);
  });

  test('重新整理後進度消失（預設只在分頁記憶體）', async ({ page }) => {
    await answerItem1(page);
    await page.reload();
    await page.goto('/#/review');
    await expect(page.getByText('正式計分：尚無可計分題')).toBeVisible();
    await expect(page.getByText(/教育原型題.*尚無已作答/)).toBeVisible();
  });

  test('選擇儲存後可還原；清除後什麼都不剩', async ({ page }) => {
    await answerItem1(page);
    await page.getByText('想一想、寫筆記').click();
    await page.getByLabel(/我的筆記/).fill('儲存的筆記');
    await page.goto('/#/privacy');
    await page.getByRole('button', { name: '儲存在這台裝置' }).click();
    await expect(page.getByText(/已儲存（自/)).toBeVisible();
    await page.reload();
    await page.goto('/#/review');
    await expect(page.getByText(/教育原型題.*1 \/ 1/)).toBeVisible();
    await page.goto('/#/quiz/1');
    await expect(page.getByLabel(/我的筆記/)).toHaveValue('儲存的筆記', { timeout: 15000 }).catch(async () => { await page.getByText('想一想、寫筆記').click(); await expect(page.getByLabel(/我的筆記/)).toHaveValue('儲存的筆記'); });

    await page.goto('/#/privacy');
    await page.getByRole('button', { name: '清除所有進度與筆記' }).click();
    await expect(page.getByText('已清除所有進度與筆記。')).toBeVisible();
    await page.reload();
    const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
    expect(dbs).toEqual([]);
    await page.goto('/#/review');
    await expect(page.getByText(/教育原型題.*尚無已作答/)).toBeVisible();
  });

  test('儲存超過 30 天 → 下次開啟時刪除', async ({ page }) => {
    await answerItem1(page);
    await page.goto('/#/privacy');
    await page.getByRole('button', { name: '儲存在這台裝置' }).click();
    await expect(page.getByText(/已儲存（自/)).toBeVisible();
    // 把時鐘撥到 31 天後再開
    await page.clock.setFixedTime(new Date(Date.now() + 31 * 24 * 3600 * 1000));
    await page.reload();
    await page.goto('/#/privacy');
    await expect(page.getByText('目前狀態：沒有儲存（只在記憶體）')).toBeVisible();
  });

  test('儲存不可用（IndexedDB 開不起來）時回退記憶體，作答不受影響', async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: undefined }); });
    await answerItem1(page);
    await page.goto('/#/privacy');
    await page.getByRole('button', { name: '儲存在這台裝置' }).click();
    await expect(page.getByText(/無法儲存/).first()).toBeVisible();
    await page.goto('/#/review');
    await expect(page.getByText(/教育原型題.*1 \/ 1/)).toBeVisible();
  });
});

test.describe('AT-12 討論、筆記與回報', () => {
  test('回報內容只含題號、版本、來源定位與讀者自己輸入的文字', async ({ page }) => {
    await answerItem1(page, { intuition: '較不同意', confidence: '沒把握' });
    await page.getByText('我覺得這題有問題').click();
    await page.getByLabel('說明你發現的問題').fill('第二個來源連結打不開');
    const preview = await page.getByLabel('回報內容預覽').innerText();
    expect(preview).toContain('tw-budget-01');
    expect(preview).toContain('0.1.0');
    expect(preview).toContain('第二個來源連結打不開');
    expect(preview).not.toMatch(/較不同意|沒把握|selected|confidence|answer/i);
  });
});

test.describe('安全標頭與內容', () => {
  test('正式 bundle 帶 CSP／no-referrer，外連都有 noopener noreferrer', async ({ page }) => {
    const res = await page.goto('/');
    const h = res!.headers();
    expect(h['content-security-policy']).toContain("default-src 'self'");
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['referrer-policy']).toBe('no-referrer');
    await answerItem1(page);
    const links = await page.locator('a[target=_blank]').evaluateAll((as) => as.map((a) => a.getAttribute('rel')));
    expect(links.length).toBeGreaterThan(3);
    for (const rel of links) expect(rel).toContain('noopener');
    for (const rel of links) expect(rel).toContain('noreferrer');
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("object-src 'none'");
  });

  test('竄改題庫內容（雜湊不符）→ 整包拒絕載入', async ({ page }) => {
    await page.route('**/content/prototype.tw/**', async (route) => {
      const res = await route.fetch();
      const text = (await res.text()).replace('"b"', '"a"');
      await route.fulfill({ response: res, body: text });
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '題庫無法使用' })).toBeVisible();
    await expect(page.getByText(/雜湊不符/)).toBeVisible();
  });
});

test.describe('AT-15 無障礙（自動掃描＋版面）', () => {
  const routes: Array<[string, (p: Page) => Promise<void>]> = [
    ['題庫介紹', async (p) => { await p.goto('/'); await expect(p.getByRole('heading', { level: 1 })).toBeVisible(); }],
    ['題目頁', async (p) => { await p.goto('/#/quiz/1'); await expect(p.getByRole('heading', { name: '情境' })).toBeVisible(); }],
    ['解釋與探索', async (p) => { await answerItem1(p); }],
    ['回顧', async (p) => { await p.goto('/#/review'); await expect(p.getByRole('heading', { name: '回顧' })).toBeVisible(); }],
    ['隱私', async (p) => { await p.goto('/#/privacy'); await expect(p.getByRole('heading', { name: '隱私與本機資料' })).toBeVisible(); }],
  ];
  for (const scheme of ['light', 'dark'] as const) {
    for (const [name, go] of routes) {
      test(`axe：${name}（${scheme}）無 critical/serious`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await go(page);
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
        const bad = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
        expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
      });
    }
  }

  test('320px 寬所有畫面都不水平捲動', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const [, go] of routes) {
      await page.goto('about:blank'); // 每個畫面從乾淨狀態開始
      await go(page);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over).toBeLessThanOrEqual(0);
    }
  });

  test('互動元件至少 44×44 CSS px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/#/quiz/1');
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('button, .choice, summary, a.btn')]
        .map((el) => ({ t: el.textContent?.trim().slice(0, 20), r: el.getBoundingClientRect() }))
        .filter((x) => x.r.width > 0 && (x.r.height < 43.5 || x.r.width < 43.5))
        .map((x) => `${x.t}:${Math.round(x.r.width)}x${Math.round(x.r.height)}`),
    );
    expect(small).toEqual([]);
  });

  test('揭曉後焦點移到結果標題，且只有一個 polite 宣告區', async ({ page }) => {
    await answerItem1(page);
    await expect(page.locator('#result-h')).toBeFocused();
    await expect(page.locator('[role=status][aria-live=polite]').first()).toContainText('和憲政規定一致');
  });

  test('鍵盤可走完一題（Tab／Space／Enter）', async ({ page }) => {
    await page.goto('/#/quiz/1');
    await page.getByLabel(/^不一定符合/).focus();
    await page.keyboard.press('Space');
    await page.getByRole('button', { name: '確認答案' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#result-h')).toContainText('一致');
  });
});

test('實機量測小工具：加 ?perf=1 才出現，顯示 LCP／CLS／裝置資訊，且不發出額外請求', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.goto('/#/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: '效能量測（實機）' })).toHaveCount(0);
  await page.goto('/?perf=1');
  const box = page.getByRole('region', { name: '效能量測（實機）' });
  await expect(box).toContainText('LCP：');
  await expect(box).toContainText('CLS：');
  await expect(box).toContainText('裝置：');
  await expect(box.getByRole('button', { name: '複製結果' })).toBeVisible();
  for (const u of urls) expect(u.startsWith('http://localhost:4180/'), u).toBe(true);
});

test('「教育原型」但書是頁面最下方的小字，每一頁都在，不占版面；版本號也在', async ({ page }) => {
  for (const route of ['/', '/#/quiz/1', '/#/review', '/#/privacy']) {
    await page.goto('about:blank');
    await page.goto(route);
    const fp = page.locator('.fineprint');
    await expect(fp).toContainText('尚未經過獨立的法律與教育專業審查');
    await expect(fp).toContainText('V0.1');
    const box = await fp.boundingBox();
    expect(box!.height, route).toBeLessThan(110);
    expect((await page.locator('main').boundingBox())!.y, route).toBeLessThan(box!.y); // 在內容之後
    await expect(page.locator('.notice', { hasText: '教育原型' })).toHaveCount(0);
  }
  await page.goto('/#/quiz/1');
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: '確認答案' }).click();
  await expect(page.locator('.notice', { hasText: '教育原型' })).toHaveCount(0);
});

test('頁尾：CC BY 宣告在右下、聯絡作者的 QR code 與信箱可點，每一頁都在', async ({ page }) => {
  for (const route of ['/', '/#/quiz/1', '/#/review']) {
    await page.goto('about:blank');
    await page.goto(route);
    const foot = page.locator('footer');
    await expect(foot.getByRole('link', { name: /CC BY 4\.0/ })).toHaveAttribute('href', /creativecommons\.org\/licenses\/by\/4\.0/);
    const mail = foot.getByRole('link', { name: /聯絡作者/ });
    await expect(mail).toHaveAttribute('href', 'mailto:civicinquiry.undone480@passinbox.com');
    await expect(mail).not.toContainText('@');
    await expect(foot.getByRole('img', { name: /QR code/ })).toBeVisible();
    const f = await foot.boundingBox(); const l = await foot.locator('.license').boundingBox();
    expect(l!.x + l!.width, route).toBeGreaterThan(f!.x + f!.width * 0.6); // 靠右
  }
});
