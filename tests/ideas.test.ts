import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validatePackage } from '../src/core/validator';
import type { QuizPackage } from '../src/core/types';
import { newQuiz, setIn } from '../src/authoring/draft';
import { PATTERNS, PLACEHOLDER, seedItemFromIdea, type IdeaInput } from '../src/authoring/ideas';
import { lintPackage } from '../src/authoring/lint';

const NOW = new Date('2026-10-18T03:00:00Z');
const published = JSON.parse(readFileSync(join(__dirname, '..', 'content-src', 'constitution.quiz.json'), 'utf8')) as QuizPackage;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const idea = (over: Partial<IdeaInput> = {}): IdeaInput => ({
  kind: 'statute', material: '憲法第23條：以上各條列舉之自由權利，除為防止妨礙他人自由…得以法律限制之。', sourceTitle: '中華民國憲法第23條',
  sourceUrl: 'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=A0000001&flno=23', sourceLocator: '第23條', jurisdiction: 'TW',
  rule: '限制人民權利，要有法律依據，而且要符合必要性。', firstReaction: '只要是為了維護公共利益，政府怎麼限制都可以。', patternId: 'purpose-means', ...over,
});
const base = () => ({ ...newQuiz({ namespace: 'local.demo', quizId: 'demo', title: '我的題庫', locale: 'zh-Hant-TW', authorName: 'Ada', now: NOW }), description: '示範題庫' });

describe('素材 → 題目靈感', () => {
  it('每一種型態都能產生題目骨架；骨架一開始不合格（正解與範本文字必須由作者處理）', () => {
    for (const p of PATTERNS) {
      const { pkg, index } = seedItemFromIdea(base(), idea({ patternId: p.id }), NOW, true);
      expect(index).toBe(0);
      const v = validatePackage(clone(pkg));
      expect(v.ok).toBe(false); // 正解空白 → 擋下，不替作者猜答案
      expect(pkg.items[0].knowledge.correctOptionIds).toEqual([]);
    }
  });
  it('第一階段那句話就是使用者寫的「第一反應」；來源與定位被帶進來並設為證據', () => {
    const { pkg } = seedItemFromIdea(base(), idea(), NOW, true);
    const it = pkg.items[0];
    expect(it.intuition.prompt).toBe('只要是為了維護公共利益，政府怎麼限制都可以。');
    expect(it.explanation.short).toContain('限制人民權利，要有法律依據');
    expect(pkg.sources[0]).toMatchObject({ title: '中華民國憲法第23條', type: 'law', locator: '第23條' });
    expect(it.evidenceIds).toEqual([pkg.sources[0].id]);
    expect(it.governance.notes).toContain('素材摘要：憲法第23條');
  });
  it('補完範本與正解後，骨架可以通過全部驗證', () => {
    let { pkg } = seedItemFromIdea(base(), idea(), NOW, true);
    const strip = (s: string) => s.split(PLACEHOLDER).join('');
    const it = pkg.items[0];
    pkg = setIn(pkg, ['items', 0], {
      ...it, topic: '公共利益就能限制自由？', context: '政府以維護公共利益為由，要求人民不得做某件事。',
      knowledge: { ...it.knowledge, prompt: strip(it.knowledge.prompt), options: it.knowledge.options.map((o) => ({ ...o, label: strip(o.label) })), correctOptionIds: ['b'] },
      explanation: Object.fromEntries(Object.entries(it.explanation).map(([k, v]) => [k, strip(v as string) + '（補充說明）'])) as typeof it.explanation,
    });
    pkg = setIn(pkg, ['sources', 0, 'publisher'], '全國法規資料庫');
    pkg = setIn(pkg, ['authors', 0, 'credentialText'], '');
    const v = validatePackage(clone(pkg));
    expect(v.errors).toEqual([]);
  });
  it('加進既有草稿時新增一題，不動原有題目', () => {
    const first = seedItemFromIdea(base(), idea(), NOW, true).pkg;
    const second = seedItemFromIdea(first, idea({ patternId: 'majority-content' }), NOW);
    expect(second.pkg.items).toHaveLength(2);
    expect(second.index).toBe(1);
    expect(second.pkg.items[0]).toEqual(first.items[0]);
    expect(new Set(second.pkg.sources.map((s) => s.id)).size).toBe(2);
  });
  it('素材裡的 HTML 只會被放進文字欄位；驗證器會擋下', () => {
    const { pkg } = seedItemFromIdea(base(), idea({ firstReaction: '<script>alert(1)</script>' }), NOW, true);
    expect(validatePackage(clone(pkg)).errors.some((e) => e.code === 'SEC001')).toBe(true);
  });
});

describe('出題提醒（lint）', () => {
  it('範本文字沒改 → 提醒；12 題原型本身沒有範本文字', () => {
    const { pkg } = seedItemFromIdea(base(), idea(), NOW, true);
    expect(lintPackage(pkg).some((h) => h.code === 'PLACEHOLDER' && h.item === 0)).toBe(true);
    expect(lintPackage(published).some((h) => h.code === 'PLACEHOLDER')).toBe(false);
  });
  it('正解特別長、選項重複、解釋太短 → 提醒', () => {
    const p = clone(published);
    p.items[0].knowledge.options[1].label = '否，個別項目增加仍涉及憲法上的限制，而且這些限制與政策責任的歸屬密切相關。';
    p.items[0].knowledge.options[0].label = '是';
    p.items[0].knowledge.options[2].label = '是';
    p.items[0].explanation.short = '因為憲法。';
    p.items[0].explanation.mechanism = '憲法。';
    const codes = lintPackage(p).filter((h) => h.item === 0).map((h) => h.code).sort();
    expect(codes).toEqual(['DUP_OPTIONS', 'LONGEST_CORRECT', 'SHORT_EXPLANATION']);
  });
  it('每題正解都是「否」型、或都在同一位置 → 題庫層級提醒', () => {
    const p = clone(published);
    const singles = p.items.filter((i) => i.knowledge.type === 'single');
    for (const it of singles) {
      it.knowledge.options = [{ id: 'a', label: '是，可以。' }, { id: 'b', label: '否，不可以。' }, { id: 'c', label: '看情況。' }];
      it.knowledge.correctOptionIds = ['b'];
    }
    const codes = lintPackage(p).filter((h) => h.item === null).map((h) => h.code).sort();
    expect(codes).toEqual(['ALL_NEGATIVE', 'SAME_POSITION']);
  });
  it('提醒不會讓匯出失敗：lint 與驗證互相獨立', () => {
    const p = clone(published);
    p.items[0].explanation.short = '短';
    p.items[0].explanation.mechanism = '短';
    expect(validatePackage(clone(p)).ok).toBe(true);
    expect(lintPackage(p).length).toBeGreaterThan(0);
  });
});
