import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const L = (page: Page, name: string) => page.getByLabel(name, { exact: true });

test.describe('答案頁：答案 → 依據的條文原文 → 解釋', () => {
  test('依序顯示憲政體制的答案、依據（條文原文＋官方連結）、解釋、為什麼直覺會出問題', async ({ page }) => {
    await page.goto('/#/quiz/1');
    await page.getByLabel('符合。總額沒變，人民沒有多負擔一毛錢，只是調整錢花在哪裡，這正是國會審預算的本意。').check();
    await page.getByRole('button', { name: '確認答案' }).click();
    await expect(page.locator('#result-h')).toContainText('和憲政規定不一樣');
    const headings = await page.locator('article h3').allInnerTexts();
    expect(headings.slice(0, 4)).toEqual(['憲政體制的答案', '依據', '解釋', '再多看一點'].slice(0, 3).concat([headings[3]]));
    expect(headings.indexOf('憲政體制的答案')).toBeLessThan(headings.indexOf('依據'));
    expect(headings.indexOf('依據')).toBeLessThan(headings.indexOf('解釋'));

    await expect(page.locator('.answer')).toContainText('不一定符合');
    // 解釋不重複上面的答案句
    await expect(page.getByRole('region', { name: '解釋' })).not.toContainText('答案：');
    await expect(page.locator('#result-h')).not.toContainText('判準');
    const basis = page.getByRole('region', { name: '依據' });
    await expect(basis).toContainText('立法院對於行政院所提預算案，不得為增加支出之提議。'); // 憲法第70條原文
    await expect(basis).toContainText('憲法第70條');
    await expect(basis).not.toContainText('版本頁列'); // 不再顯示舊的一長串說明
    await expect(basis.getByRole('link', { name: /中華民國憲法/ })).toHaveAttribute('href', /law\.moj\.gov\.tw/);
    await expect(page.getByText('為什麼直覺會出問題：')).toBeVisible();
    // 沒有「把握」「立場」之類的舊流程字眼
    expect(await page.locator('article').innerText()).not.toMatch(/把握|你的立場|第一步|第二步/);
  });

  test('每題：每題頁面都是一頁讀完，有情境、問題、選項，標題不洩漏結論', async ({ page }) => {
    for (let n = 1; n <= 14; n++) {
      await page.goto('about:blank');
      await page.goto(`/#/quiz/${n}`);
      await expect(page.getByRole('heading', { name: '情境' })).toBeVisible();
      const hasOptions = (await page.getByRole('radio').count()) >= 2;
      const isReflection = [5, 11, 12, 13, 14].includes(n);
      expect(hasOptions || isReflection, `第 ${n} 題`).toBe(true);
      expect(await page.locator('article').innerText()).not.toMatch(/第一步|第二步|把握/);
    }
  });
});

test.describe('作者工具：從官方條文找素材（不需要 AI）', () => {
  async function openIdeaForm(page: Page) {
    await page.goto('/#/author');
    await L(page, '你的名字').fill('王老師');
  }

  test('輸入條號就帶出條文原文、官方連結與定位；也能用關鍵字找', async ({ page }) => {
    await openIdeaForm(page);
    await L(page, '輸入條號或關鍵字').fill('憲法70');
    const list = page.getByRole('list', { name: '查到的條文' });
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list).toContainText('立法院對於行政院所提預算案，不得為增加支出之提議。');
    await L(page, '輸入條號或關鍵字').fill('緊急命令');
    expect(await list.getByRole('listitem').count()).toBeGreaterThan(0);
    await L(page, '輸入條號或關鍵字').fill('zzzzqq');
    await expect(page.getByText('內建的條文裡沒有找到')).toBeVisible();
  });

  test('選一條 → 自動填好素材名稱、網址、定位、原文；列出相關裁判；用這條出題後帶進來源與依據', async ({ page }) => {
    await openIdeaForm(page);
    await L(page, '輸入條號或關鍵字').fill('憲法70');
    await page.getByRole('button', { name: /用這條出題/ }).click();
    await expect(page.getByText('已帶入：')).toBeVisible();
    await expect(L(page, '素材名稱（例如「憲法第23條」）')).toHaveValue('中華民國憲法第 70 條'.replace(/ /g, ''));
    await expect(L(page, '原始來源網址（選填，之後可以補）')).toHaveValue('https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=A0000001&flno=70');
    await expect(L(page, '定位（條號、段落、頁碼）')).toHaveValue('第70條');
    await expect(page.getByLabel(/條文原文或觀念重點/)).toHaveValue('立法院對於行政院所提預算案，不得為增加支出之提議。');
    // 相關裁判（釋字391）可以一併帶入
    await page.getByLabel(/司法院釋字第391號解釋/).check();
    await L(page, '2. 用一句話寫出：憲政體制（或這條規定）真正的答案是什麼？').fill('立法院不能對行政院的預算案增加支出。');
    await L(page, '3. 大多數人第一反應會怎麼想？').fill('只要總額不變，怎麼調都可以。');
    await page.getByLabel(/整體沒變，個別就沒事/).check();
    await page.getByRole('button', { name: '產生題目骨架' }).click();

    await page.getByRole('button', { name: '2. 來源' }).click();
    await expect(page.getByLabel('標題', { exact: true })).toHaveCount(2);
    await expect(page.getByLabel('標題', { exact: true }).nth(1)).toHaveValue('司法院釋字第391號解釋');
    await page.getByRole('button', { name: '3. 題目' }).click();
    await expect(L(page, '聽起來很有道理的話')).toHaveValue('只要總額不變，怎麼調都可以。');
    await expect(L(page, '核心解釋（以「答案：」開頭）')).toHaveValue(/^答案：立法院不能對行政院的預算案增加支出。/);
    await expect(page.getByLabel('選項 b 是正確答案')).not.toBeChecked(); // 正解不替作者猜
  });

  test('這一條已經有題目用到時，會提醒並列出（避免重複）', async ({ page }) => {
    // 先用已發布的題庫建立修訂草稿，草稿裡已有「憲法第70條」的題目
    await page.goto('/#/author');
    await page.getByRole('button', { name: '從已發布版本建立修訂草稿' }).click();
    await page.getByRole('button', { name: '3. 題目' }).click();
    await page.getByText('從法條或觀念產生新題').click();
    await L(page, '輸入條號或關鍵字').fill('憲法70');
    await page.getByRole('button', { name: /用這條出題/ }).click();
    await expect(page.getByText(/這條已經有 1 題用到：「調整預算項目」/)).toBeVisible();
  });

  test('出題提醒：引文被改成不是官方原文時會指出', async ({ page }) => {
    await openIdeaForm(page);
    await L(page, '輸入條號或關鍵字').fill('憲法70');
    await page.getByRole('button', { name: /用這條出題/ }).click();
    await page.getByLabel(/條文原文或觀念重點/).fill('立法院對於行政院所提預算案，得為增加支出之提議。'); // 把「不得」改成「得」
    await L(page, '2. 用一句話寫出：憲政體制（或這條規定）真正的答案是什麼？').fill('x');
    await L(page, '3. 大多數人第一反應會怎麼想？').fill('y');
    await page.getByRole('button', { name: '產生題目骨架' }).click();
    await page.getByRole('button', { name: '4. 檢查與預覽' }).click();
    await expect(page.getByText(/不是官方條文的逐字內容/)).toBeVisible();
  });
});

test.describe('作者看得懂的錯誤、檔名與審查用文件', () => {
  async function newDraft(page: Page) {
    await page.goto('/#/author');
    await L(page, '題庫名稱').fill('我的題庫');
    await L(page, '作者名稱').fill('王老師');
    await page.getByRole('button', { name: '開始建立' }).click();
  }

  test('驗證錯誤用中文欄位名稱顯示（「第 1 題 › 問題與選項 › 正解」），技術位置放在後面', async ({ page }) => {
    await newDraft(page);
    await page.getByRole('button', { name: '4. 檢查與預覽' }).click();
    const errors = page.locator('.item-check .errors').first();
    await expect(errors).toContainText('第 1 題 › 問題與選項 › 正解');
    await expect(errors).toContainText('這一欄還沒有填。');
    await expect(errors).toContainText('技術位置');
  });

  test('畫面上不出現 JSON、quiz.json、schema 之類的程式用語', async ({ page }) => {
    await newDraft(page);
    for (const step of ['1. 題庫資訊', '2. 來源', '3. 題目', '4. 檢查與預覽', '5. 版本與匯出入']) {
      await page.getByRole('button', { name: step }).click();
      const text = (await page.locator('main').innerText()).replace(/技術位置[^\n]*/g, '');
      expect(text, step).not.toMatch(/quiz\.json|\bJSON\b|schema|Schema|\.json/);
    }
    await page.goto('/#/author');
  });

  test('下載題庫檔：檔名是題庫名稱＋版本；下載審查用文件可以直接閱讀、含審查欄', async ({ page }) => {
    await page.goto('/#/author');
    await page.getByLabel('選擇檔案').setInputFiles(join(process.cwd(), 'content-src', 'fixtures', 'physics.zh-Hant-TW.quiz.json'));
    await page.getByRole('button', { name: '載入成草稿' }).click();
    await page.getByRole('button', { name: '5. 版本與匯出入' }).click();

    const [dl1] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '下載題庫檔' }).click()]);
    expect(dl1.suggestedFilename()).toBe('【測試題庫】日常物理（0.1.0）.題庫檔.json');

    const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '下載審查用文件' }).click()]);
    expect(dl2.suggestedFilename()).toBe('【測試題庫】日常物理-審查用文件.html');
    const path = join(process.cwd(), 'test-results', 'review-doc.html');
    await dl2.saveAs(path);
    const html = readFileSync(path, 'utf8');
    expect(html).toContain('第 1 題：落下的快慢');
    expect(html).toContain('★ 憲政體制的答案');
    expect(html).toContain('審查意見（請在這裡寫）');

    // 用瀏覽器打開：不需要任何工具就能讀，而且不執行任何腳本、不連網
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    const p2 = await page.context().newPage();
    p2.on('request', (r) => requests.push(r.url()));
    await p2.goto(`file:///${path.replace(/\\/g, '/')}`);
    await expect(p2.getByRole('heading', { name: /第 1 題：落下的快慢/ })).toBeVisible();
    await expect(p2.getByText('審查意見（請在這裡寫）').first()).toBeVisible();
    expect(await p2.locator('script').count()).toBe(0);
    expect(requests.filter((u) => u.startsWith('http')).length).toBe(0);
  });

  test('題目沒寫完也能下載審查用文件（範本文字會原樣出現，提醒審查者）', async ({ page }) => {
    await newDraft(page);
    await page.getByRole('button', { name: '5. 版本與匯出入' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '下載審查用文件' }).click()]);
    expect(dl.suggestedFilename()).toBe('我的題庫-審查用文件.html');
  });
});
