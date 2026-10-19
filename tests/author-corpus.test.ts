import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { QuizPackage } from '../src/core/types';
import { validatePackage } from '../src/core/validator';
import { newQuiz, setIn } from '../src/authoring/draft';
import { quoteIsOfficial, questionsUsing, relatedRulings, searchCorpus } from '../src/authoring/corpus';
import { seedItemFromIdea, type IdeaInput } from '../src/authoring/ideas';
import { lintPackage } from '../src/authoring/lint';
import { friendlyMessage, friendlyPath } from '../src/authoring/friendly';
import { readableFilename, renderReadable, safeName } from '../src/authoring/readable';

const NOW = new Date('2026-10-18T03:00:00Z');
const published = JSON.parse(readFileSync(join(__dirname, '..', 'content-src', 'constitution.quiz.json'), 'utf8')) as QuizPackage;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe('素材庫搜尋', () => {
  it('條號：23、第23條、憲法23、增修2', () => {
    expect(searchCorpus('23')[0].law).toBe('中華民國憲法');
    expect(searchCorpus('23').map((a) => a.law)).toContain('行政程序法');
    expect(searchCorpus('第23條').every((a) => a.no === '23')).toBe(true);
    expect(searchCorpus('憲法23').map((a) => `${a.law}${a.no}`)).toEqual(['中華民國憲法23']);
    const add = searchCorpus('增修2');
    expect(add).toHaveLength(1);
    expect(add[0].text).toContain('緊急命令');
  });
  it('關鍵字：預算、解散；多個詞都要出現；沒有結果回空陣列', () => {
    expect(searchCorpus('預算').some((a) => a.law === '中華民國憲法' && a.no === '70')).toBe(true);
    const r = searchCorpus('解散 立法院');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((a) => a.text.includes('解散') && a.text.includes('立法院'))).toBe(true);
    expect(searchCorpus('zzzzqqqq')).toEqual([]);
    expect(searchCorpus('   ')).toEqual([]);
  });
  it('每一條都帶官方連結（含條號）', () => {
    const a = searchCorpus('憲法70')[0];
    expect(a.url).toBe('https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=A0000001&flno=70');
  });
  it('相關裁判與「已經有哪些題用到這條」', () => {
    const a70 = searchCorpus('憲法70')[0];
    expect(relatedRulings(a70).map((r) => r.id)).toEqual(['j391']);
    expect(questionsUsing(published, a70).map((q) => q.topic)).toEqual(['調整預算項目']);
    expect(questionsUsing(published, searchCorpus('憲法23')[0]).length).toBeGreaterThan(0);
    expect(questionsUsing(newQuiz({ namespace: 'a.b', quizId: 'c', title: 'x', locale: 'zh-Hant-TW', authorName: 'a', now: NOW }), a70)).toEqual([]);
  });
});

describe('從條文開始出題', () => {
  const idea = (): IdeaInput => {
    const a = searchCorpus('憲法70')[0];
    const r = relatedRulings(a)[0];
    return {
      kind: 'statute', material: a.text, sourceTitle: `${a.law}${a.label}`, sourceUrl: a.url, sourceLocator: a.label, jurisdiction: 'TW',
      rule: '立法院不能對預算案增加支出。', firstReaction: '總額不變就沒問題。', patternId: 'total-part',
      extra: [{ title: r.title, url: r.url, locator: r.note, publisher: r.publisher, type: 'judgment' }],
    };
  };
  const base = () => ({ ...newQuiz({ namespace: 'local.demo', quizId: 'demo', title: '我的題庫', locale: 'zh-Hant-TW', authorName: 'Ada', now: NOW }), description: 'd' });

  it('條文原文成為「依據」引文；裁判成為額外來源；來源與連結帶好', () => {
    const { pkg } = seedItemFromIdea(base(), idea(), NOW, true);
    expect(pkg.sources).toHaveLength(2);
    expect(pkg.sources[0]).toMatchObject({ type: 'law', locator: '第70條' });
    expect(pkg.sources[1]).toMatchObject({ type: 'judgment', title: '司法院釋字第391號解釋' });
    expect(pkg.items[0].evidenceIds).toEqual([pkg.sources[0].id, pkg.sources[1].id]);
    const basis = pkg.items[0].extensions!['civic.basis'] as Array<{ sourceId: string; quote: string }>;
    expect(basis[0]).toMatchObject({ sourceId: pkg.sources[0].id, quote: '立法院對於行政院所提預算案，不得為增加支出之提議。' });
    expect(quoteIsOfficial(pkg.sources[0].url, basis[0].quote)).toBe(true);
  });
  it('骨架的解釋以「答案：」開頭，並留下「會傷害民主制度的什麼」要作者回答', () => {
    const { pkg } = seedItemFromIdea(base(), idea(), NOW, true);
    expect(pkg.items[0].explanation.short.startsWith('答案：')).toBe(true);
    expect(pkg.items[0].explanation.misconception).toContain('傷害民主制度');
  });
  it('正解沒有被猜；補完後帶引文的骨架仍通過完整驗證（引文放在擴充欄位）', () => {
    let { pkg } = seedItemFromIdea(base(), idea(), NOW, true);
    expect(pkg.items[0].knowledge.correctOptionIds).toEqual([]);
    const strip = (s: string) => s.split('【待改】').join('');
    const it = pkg.items[0];
    pkg = setIn(pkg, ['items', 0], {
      ...it, topic: '調整預算', context: '立法院調整預算項目。',
      knowledge: { ...it.knowledge, prompt: strip(it.knowledge.prompt), options: it.knowledge.options.map((o) => ({ ...o, label: strip(o.label) })), correctOptionIds: ['b'] },
      explanation: Object.fromEntries(Object.entries(it.explanation).map(([k, v]) => [k, strip(v as string) + '。補充'])) as typeof it.explanation,
    });
    pkg = setIn(pkg, ['sources', 0, 'publisher'], '全國法規資料庫');
    pkg = setIn(pkg, ['sources', 1, 'publisher'], '憲法法庭');
    const v = validatePackage(clone(pkg));
    expect(v.errors).toEqual([]);
  });
  it('作者改壞引文 → 出題提醒指出「不是官方條文的逐字內容」；原樣則不提醒', () => {
    const { pkg } = seedItemFromIdea(base(), idea(), NOW, true);
    expect(lintPackage(pkg).some((h) => h.code === 'QUOTE_NOT_OFFICIAL')).toBe(false);
    const bad = clone(pkg);
    (bad.items[0].extensions!['civic.basis'] as Array<{ quote: string }>)[0].quote = '立法院對於行政院所提預算案，得為增加支出之提議。';
    expect(lintPackage(bad).some((h) => h.code === 'QUOTE_NOT_OFFICIAL')).toBe(true);
  });
});

describe('作者看得懂的錯誤與檔名', () => {
  it('欄位位置翻成中文', () => {
    expect(friendlyPath('/items/0/knowledge/correctOptionIds/0')).toBe('第 1 題 › 問題與選項 › 正解');
    expect(friendlyPath('/items/2/explanation/misconception')).toBe('第 3 題 › 解釋 › 為什麼直覺會出問題');
    expect(friendlyPath('/sources/1/locator')).toBe('來源 2 › 定位');
    expect(friendlyPath('/items/0/knowledge/options/1/label')).toBe('第 1 題 › 問題與選項 › 選項 2');
    expect(friendlyPath('')).toBe('整份題庫');
  });
  it('訊息：空白欄位說「還沒有填」', () => {
    expect(friendlyMessage('SCHEMA', '這一欄還沒有填。')).toBe('這一欄還沒有填。');
    expect(friendlyMessage('SCHEMA', '長度不得少於 1')).toBe('這一欄還沒有填。');
    expect(friendlyMessage('REF002', '正解 ID「x」不在這一題的選項中')).toContain('正解');
  });
  it('檔名：用題庫名稱、不含不能用的字元；不出現 quiz.json', () => {
    expect(safeName('a/b:c*d?')).toBe('a_b_c_d_');
    expect(readableFilename(published)).toBe('民主不是你想的那樣-審查用文件.html');
  });
});

describe('審查用文件', () => {
  it('包含每一題的情境、選項、答案標記、依據原文與審查欄；全部文字都跳脫', () => {
    const html = renderReadable(published, NOW);
    expect(html).toContain('第 1 題：調整預算項目');
    expect(html).toContain('★ 憲政體制的答案');
    expect(html).toContain('立法院對於行政院所提預算案，不得為增加支出之提議。');
    expect(html).toContain('審查意見（請在這裡寫）');
    expect((html.match(/<section class="item">/g) ?? []).length).toBe(published.items.length);
  });
  it('題目裡的 HTML／script 不會被當成網頁執行', () => {
    const p = clone(published);
    p.items[0].topic = '<script>alert(1)</script>&"\'';
    const html = renderReadable(p, NOW);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;&amp;&quot;&#39;');
  });
});
