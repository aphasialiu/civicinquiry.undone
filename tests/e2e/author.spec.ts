import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const L = (page: Page, name: string) => page.getByLabel(name, { exact: true });

/** 只用畫面操作，做出一份「非法律領域」（物理）的完整題庫。 */
async function buildPhysics(page: Page) {
  await page.goto('/#/author');
  await expect(page.getByRole('heading', { name: '新題庫精靈' })).toBeVisible();
  await L(page, '題庫名稱').fill('物理直覺');
  await L(page, '作者名稱').fill('Ada Chen');
  await L(page, '英數代號（選填）').fill('physics');
  await page.getByRole('button', { name: '開始建立' }).click();
  await expect(page.getByRole('heading', { name: /作者工具：物理直覺/ })).toBeVisible();

  // 1 題庫資訊
  await L(page, '題庫介紹').fill('日常物理的反直覺題；適用範圍為牛頓力學。');
  await L(page, '作者資歷說明（自述）').fill('高中物理教師（自述）');

  // 2 來源
  await page.getByRole('button', { name: '2. 來源' }).click();
  await page.getByRole('button', { name: '新增來源' }).click();
  await L(page, '標題').fill('NIST 物理常數');
  await L(page, '網址').fill('https://physics.nist.gov/cuu/Constants/');
  await L(page, '性質').selectOption('research');
  await L(page, '發布單位').fill('NIST');
  await L(page, '定位（條號／段落／頁碼）').fill('標準重力加速度 g 的條目');

  // 3 題目
  await page.getByRole('button', { name: '3. 題目' }).click();
  await L(page, '主題').fill('落下的快慢');
  await L(page, '適用範圍（法域或領域）').fill('global');
  await L(page, '情境').fill('在真空中，同時放開一顆鐵球與一根羽毛。');
  await L(page, '聽起來很有道理的話').fill('重的東西應該落得比較快。');
  await L(page, '問題').fill('在真空中，兩者的落下速度？');
  await L(page, '選項 a 的文字').fill('鐵球先到');
  await L(page, '選項 b 的文字').fill('同時到');
  await L(page, '選項 c 的文字').fill('羽毛先到');
  await page.getByLabel('選項 b 是正確答案').check();
  await L(page, '依據說明').fill('真空中沒有空氣阻力，加速度相同。');
  await L(page, '核心解釋（以「答案：」開頭）').fill('沒有空氣阻力時，所有物體的落下加速度相同。');
  await L(page, '為什麼直覺會出問題').fill('把空氣阻力的效果當成重力本身的差異。');
  await L(page, '機制：為什麼是這樣').fill('重力加速度與質量無關。');
  await L(page, '可能的理由').fill('日常看到的差異來自空氣阻力。');
  await L(page, '不同的選擇（替代方案）').fill('在空氣中結果會不同。');
  await L(page, '爭議與限制：這題沒有回答什麼').fill('本題只談真空。');
  await page.getByRole('group', { name: '支持答案的原始證據' }).getByLabel('NIST 物理常數').check();
  await page.getByRole('group', { name: '延伸閱讀', exact: true }).getByLabel('NIST 物理常數').check();
  await L(page, '討論引導問題 第 1 項').fill('哪些日常經驗讓你以為重的落得快？');
  await L(page, '搜尋關鍵詞 第 1 項').fill('free fall vacuum');
  await L(page, '知識版本說明').fill('牛頓力學；2026-10-18 查閱');
}

test.describe('AT-09／FR-09 作者精靈：建立另一個領域的題庫', () => {
  test('只用畫面操作做出物理題庫 → 檢查通過 → 預覽（與讀者同一套畫面）→ 匯出 → 刪草稿 → 重新匯入', async ({ page, browser }) => {
    await buildPhysics(page);

    // 4 檢查：全部通過
    await page.getByRole('button', { name: '4. 檢查與預覽' }).click();
    await expect(page.getByText('全部檢查通過')).toBeVisible();

    // 預覽：和讀者相同的作答流程與判分
    await page.getByRole('link', { name: /預覽這題/ }).click();
    await expect(page.getByText('作者預覽：')).toBeVisible();
    await expect(page.getByRole('heading', { name: '情境' })).toBeVisible();
    await page.getByLabel('同時到').check();
    await page.getByRole('button', { name: '確認答案' }).click();
    await expect(page.locator('#result-h')).toContainText('和憲政規定一致');
    await expect(page.getByText('沒有空氣阻力時，所有物體的落下加速度相同。')).toBeVisible();
    // 預覽不寫任何讀者儲存（只有作者自己的草稿資料庫）
    await page.waitForTimeout(800); // 等草稿自動儲存
    expect(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).toEqual(['civic-inquiry-author']);

    // 匯出
    await page.getByRole('link', { name: '回到編輯' }).click();
    await page.getByRole('button', { name: '5. 版本與匯出入' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '下載題庫檔' }).click()]);
    expect(dl.suggestedFilename()).toBe('物理直覺（0.1.0）.題庫檔.json');
    const path = await dl.path();
    const text = readFileSync(path, 'utf8');
    const json = JSON.parse(text);
    expect(json.items[0].knowledge.correctOptionIds).toEqual(['b']);
    expect(json.items[0].governance.verification).toBe('unreviewed'); // 匯出不會自己變成已審查
    expect(text).not.toContain('\r');

    // 另一台「乾淨」的瀏覽器：匯入 → 成為草稿 → 再匯出，位元組相同
    const ctx = await browser.newContext({ acceptDownloads: true });
    const p2 = await ctx.newPage();
    await p2.goto('/#/author');
    await p2.getByLabel('選擇檔案').setInputFiles(path);
    await expect(p2.getByText('檢查通過：物理直覺')).toBeVisible();
    await p2.getByRole('button', { name: '載入成草稿' }).click();
    await expect(p2.getByRole('heading', { name: /作者工具：物理直覺/ })).toBeVisible();
    await p2.getByRole('button', { name: '5. 版本與匯出入' }).click();
    const [dl2] = await Promise.all([p2.waitForEvent('download'), p2.getByRole('button', { name: '下載題庫檔' }).click()]);
    expect(readFileSync((await dl2.path())!, 'utf8')).toBe(text);
    await ctx.close();
  });

  test('草稿自動儲存：重新整理後還在；刪除後什麼都不剩', async ({ page }) => {
    await buildPhysics(page);
    await page.waitForTimeout(800); // 等自動儲存（400 ms）
    await page.reload();
    await expect(page.getByRole('heading', { name: /作者工具：物理直覺/ })).toBeVisible();
    await page.getByRole('button', { name: '5. 版本與匯出入' }).click();
    await page.getByRole('button', { name: '刪除這份草稿…' }).click();
    await page.getByRole('button', { name: '確定刪除' }).click();
    await expect(page.getByRole('heading', { name: '新題庫精靈' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: '新題庫精靈' })).toBeVisible();
    expect(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).toEqual([]);
  });

  test('沒寫完不能正式匯出，並指出缺哪裡；補好之後才能', async ({ page }) => {
    await page.goto('/#/author');
    await L(page, '題庫名稱').fill('空白題庫');
    await L(page, '作者名稱').fill('X');
    await page.getByRole('button', { name: '開始建立' }).click();
    await page.getByRole('button', { name: '5. 版本與匯出入' }).click();
    await expect(page.getByText('還不能匯出正式檔案')).toBeVisible();
    await expect(page.getByRole('button', { name: '下載題庫檔' })).toBeDisabled();
    await page.getByRole('button', { name: '4. 檢查與預覽' }).click();
    await expect(page.getByText(/待補/).first()).toBeVisible();
    await expect(page.locator('.errors code').first()).toContainText('/');
    // 草稿備份仍可下載
    await page.getByRole('button', { name: '5. 版本與匯出入' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /下載草稿備份/ }).click()]);
    expect(dl.suggestedFilename()).toMatch(/草稿\.json$/);
  });

  test('預覽缺資料時不猜答案：沒有正解 → 顯示無法判定', async ({ page }) => {
    await page.goto('/#/author');
    await L(page, '題庫名稱').fill('空白題庫');
    await L(page, '作者名稱').fill('X');
    await page.getByRole('button', { name: '開始建立' }).click();
    await page.getByRole('button', { name: '4. 檢查與預覽' }).click();
    await page.getByRole('link', { name: /預覽這題/ }).click();
    await expect(page.getByText(/還有 \d+ 個項目沒處理/)).toBeVisible();
    // 選項文字是空的，用按鈕的 value 勾第一個
    await page.locator('input[name=knowledge]').first().check();
    await page.getByRole('button', { name: '確認答案' }).click();
    await expect(page.locator('#result-h')).toContainText('沒有有效的正解');
  });
});

test.describe('匯入：錯誤、衝突與不被採信的標章（AT-10／AT-19）', () => {
  async function exportedFile(page: Page): Promise<string> {
    await buildPhysics(page);
    await page.getByRole('button', { name: '5. 版本與匯出入' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '下載題庫檔' }).click()]);
    return (await dl.path())!;
  }
  const file = (name: string, body: string) => ({ name, mimeType: 'application/json', buffer: Buffer.from(body, 'utf8') });

  test('壞檔案：定位到欄位、可下載錯誤報告，而且現有草稿完全不動', async ({ page }) => {
    const path = await exportedFile(page);
    const good = readFileSync(path, 'utf8');
    const doc = JSON.parse(good);
    doc.items[0].knowledge.correctOptionIds = ['zzz'];
    const bad = JSON.stringify(doc, null, 2);
    expect(bad).not.toBe(good);
    await page.getByLabel('選擇題庫檔').setInputFiles(file('bad.quiz.json', bad));
    const alert = page.getByRole('alert').filter({ hasText: '匯入失敗' });
    await expect(alert).toContainText('你目前的草稿完全沒有被動到');
    await expect(alert).toContainText('/items/0/knowledge/correctOptionIds/0');
    await expect(alert).toContainText('REF002');
    const [dl] = await Promise.all([page.waitForEvent('download'), alert.getByRole('button', { name: '下載錯誤報告' }).click()]);
    expect(readFileSync((await dl.path())!, 'utf8')).toContain('REF002');
    // 草稿還在
    await expect(page.getByRole('heading', { name: /作者工具：物理直覺/ })).toBeVisible();
  });

  for (const [name, mutate] of [
    ['重複 key', (t: string) => t.replace('"quizId"', '"quizId": "dup", "quizId"')],
    ['原型污染鍵', (t: string) => t.replace('"locator"', '"__proto__": {"x": 1}, "locator"')],
    ['HTML／script', (t: string) => t.replace('同時到', '<script>alert(1)</script>')],
    ['javascript: 連結', (t: string) => t.replace('https://physics.nist.gov/cuu/Constants/', 'javascript:alert(1)')],
    ['未知 major 版本', (t: string) => t.replace('"schemaVersion": "1.0.0"', '"schemaVersion": "2.0.0"')],
  ] as const) {
    test(`惡意檔案「${name}」被拒絕，沒有執行腳本、沒有外部請求`, async ({ page }) => {
      const path = await exportedFile(page);
      const external: string[] = [];
      page.on('request', (r) => { if (!r.url().startsWith('http://localhost:4180/') && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) external.push(r.url()); });
      let dialog = false;
      page.on('dialog', (d) => { dialog = true; void d.dismiss(); });
      await page.getByLabel('選擇題庫檔').setInputFiles(file('evil.quiz.json', mutate(readFileSync(path, 'utf8'))));
      await expect(page.getByRole('alert').filter({ hasText: '匯入失敗' })).toBeVisible();
      expect(dialog).toBe(false);
      expect(external).toEqual([]);
    });
  }

  test('超過 2 MiB 的檔案：在讀取前就拒絕', async ({ page }) => {
    await exportedFile(page);
    await page.getByLabel('選擇題庫檔').setInputFiles({ name: 'huge.quiz.json', mimeType: 'application/json', buffer: Buffer.alloc(2 * 1024 * 1024 + 10, 32) });
    await expect(page.getByText('檔案超過 2 MiB 上限')).toBeVisible();
  });

  test('同版本但內容不同 → VERSION_COLLISION：不自動覆蓋，顯示差異；明確確認才取代', async ({ page }) => {
    const path = await exportedFile(page);
    const changed = readFileSync(path, 'utf8').replace('落下的快慢', '落下的快慢（改過）');
    await page.getByLabel('選擇題庫檔').setInputFiles(file('changed.quiz.json', changed));
    const box = page.getByRole('status').filter({ hasText: '檢查通過' });
    await expect(box).toContainText('VERSION_COLLISION');
    await expect(box).toContainText('不會自動覆蓋');
    await expect(box).toContainText('落下的快慢');
    await expect(page.getByRole('heading', { name: /作者工具：物理直覺/ })).toBeVisible(); // 還沒取代
    await box.getByRole('button', { name: '放棄目前草稿，改用匯入檔' }).click();
    await expect(page.getByRole('status').filter({ hasText: '已載入匯入的內容' })).toBeVisible();
  });

  test('完全相同 → no-op；自稱 reviewed 的檔案 → 警告「不會被採信」', async ({ page }) => {
    const path = await exportedFile(page);
    const text = readFileSync(path, 'utf8');
    await page.getByLabel('選擇題庫檔').setInputFiles(path);
    await expect(page.getByText('完全相同，不需要匯入')).toBeVisible();

    const j = JSON.parse(text);
    j.version = '0.1.1';
    j.items[0].governance = { lifecycle: 'draft', verification: 'reviewed', lastReviewedAt: '2026-10-17T00:00:00Z', notes: '自稱已審', reviewers: [
      { id: 'r1', scope: 'domain', decision: 'approve', reviewedAt: '2026-10-17T00:00:00Z', notes: 'ok' },
      { id: 'r2', scope: 'education', decision: 'approve', reviewedAt: '2026-10-17T00:00:00Z', notes: 'ok' }] };
    await page.getByLabel('選擇題庫檔').setInputFiles(file('claim.quiz.json', JSON.stringify(j)));
    await expect(page.getByText(/自稱已審查或帶有審查紀錄。這些只是作者聲明，不會被採信/)).toBeVisible();
  });
});

test.describe('版本差異與修訂（FR-10）', () => {
  test('從已發布版本建立修訂 → 改答案 → 看到「需重新審查」→ 完成修訂：只該題升版、審查重置', async ({ page }) => {
    await page.goto('/#/author');
    await page.getByRole('button', { name: '從已發布版本建立修訂草稿' }).click();
    await expect(page.getByRole('heading', { name: /作者工具：民主不是你想的那樣/ })).toBeVisible();

    // 還沒改：沒有差異
    await page.getByRole('button', { name: '5. 版本與匯出入' }).click();
    await expect(page.getByText('目前沒有內容差異，不需要升版。')).toBeVisible();

    // 改第 1 題的正解（b → a）
    await page.getByRole('button', { name: '3. 題目' }).click();
    await page.getByLabel('選項 a 是正確答案').check();
    await page.getByRole('button', { name: '5. 版本與匯出入' }).click();
    const diff = page.locator('.changes');
    await expect(diff).toContainText('正解');
    await expect(diff).toContainText('需重新審查');
    await expect(page.getByText(/正解、情境、證據或適用期間變了/)).toBeVisible();
    await expect(page.getByRole('button', { name: '完成修訂（升版並重置審查）' })).toBeDisabled(); // 要先寫原因
    await L(page, '修訂原因').fill('依新判決更正答案');
    await page.getByRole('button', { name: '完成修訂（升版並重置審查）' }).click();
    await expect(page.getByText(/已建立新版本 0\.2\.0/)).toBeVisible();

    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '下載題庫檔' }).click()]);
    const out = JSON.parse(readFileSync((await dl.path())!, 'utf8'));
    expect(out.version).toBe('0.2.0');
    expect(out.items[0].version).toBe('0.2.0');
    expect(out.items[0].extensions['civic.revision']).toEqual({ reason: '依新判決更正答案', supersedes: '0.1.0' });
    expect(out.items[0].governance.verification).toBe('unreviewed');
    expect(out.items[1].version).toBe('0.1.0'); // 沒改的題維持原版
    // 線上的舊版沒有被動到
    const live = await (await page.request.get('/content/catalog.json')).json();
    expect(live.quizzes[0].version).toBe('0.1.0');
  });
});

test.describe('無障礙與版面', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`axe：作者工具各步驟（${scheme}）無 critical/serious`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/#/author');
      const scan = async (label: string) => {
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
        const bad = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
        expect(bad.map((v) => `${label} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
      };
      await scan('起始');
      await L(page, '題庫名稱').fill('測試');
      await L(page, '作者名稱').fill('Ada');
      await page.getByRole('button', { name: '開始建立' }).click();
      for (const s of ['1. 題庫資訊', '2. 來源', '3. 題目', '4. 檢查與預覽', '5. 版本與匯出入']) {
        if (s === '2. 來源') { await page.getByRole('button', { name: s }).click(); await page.getByRole('button', { name: '新增來源' }).click(); }
        await page.getByRole('button', { name: s }).click();
        await scan(s);
      }
    });
  }

  test('320px 寬各步驟不水平捲動', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/#/author');
    await L(page, '題庫名稱').fill('測試');
    await L(page, '作者名稱').fill('Ada');
    await page.getByRole('button', { name: '開始建立' }).click();
    for (const s of ['1. 題庫資訊', '2. 來源', '3. 題目', '4. 檢查與預覽', '5. 版本與匯出入']) {
      await page.getByRole('button', { name: s }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), s).toBeLessThanOrEqual(0);
    }
  });

  test('輸入有錯的欄位時有可讀的錯誤與 aria-invalid，並與欄位關聯', async ({ page }) => {
    await page.goto('/#/author');
    await L(page, '題庫名稱').fill('測試');
    await L(page, '作者名稱').fill('Ada');
    await page.getByRole('button', { name: '開始建立' }).click();
    await page.getByRole('button', { name: '3. 題目' }).click();
    const ctx = L(page, '情境');
    await expect(ctx).toHaveAttribute('aria-invalid', 'true');
    const describedBy = await ctx.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    await ctx.fill('已填寫的情境');
    await expect(ctx).not.toHaveAttribute('aria-invalid', 'true');
  });
});
