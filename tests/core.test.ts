import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateText, validatePackage } from '../src/core/validator';
import { parseStrictJson, StrictJsonError } from '../src/core/strictJson';
import { judge, summarize, confidenceFeedback } from '../src/core/assessment';
import { evaluateEligibility } from '../src/core/eligibility';
import { itemHash } from '../src/core/hash';
import type { Item, QuizPackage, StatusCatalog } from '../src/core/types';

const root = join(__dirname, '..');
const quizText = readFileSync(join(root, 'content-src', 'constitution.quiz.json'), 'utf8');
const exampleText = readFileSync(join(root, 'tests', 'fixtures', 'demo.quiz.json'), 'utf8');
const pkg = JSON.parse(quizText) as QuizPackage;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe('題庫與範例', () => {
  it('規格附的單題範例通過驗證', () => {
    const r = validateText(exampleText);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
  it('原型題庫通過驗證：單選題加 1 題沒有定論的題', () => {
    const r = validateText(quizText);
    expect(r.errors).toEqual([]);
    expect(pkg.items.length).toBeGreaterThanOrEqual(8);
    const single = pkg.items.filter((i) => i.knowledge.type === 'single').length;
    const reflection = pkg.items.filter((i) => i.knowledge.type === 'reflection').length;
    expect(reflection).toBeGreaterThanOrEqual(1);
    expect(single + reflection).toBe(pkg.items.length);
  });
});

describe('AT-19 格式與安全（負向案例）', () => {
  const codes = (data: unknown) => validatePackage(data).errors.map((e) => e.code);

  it('錯誤的正解 ID → REF002，並定位到欄位', () => {
    const p = clone(pkg);
    p.items[0].knowledge.correctOptionIds = ['zzz'];
    const r = validatePackage(p);
    expect(r.ok).toBe(false);
    expect(r.errors).toContainEqual(expect.objectContaining({ code: 'REF002', path: '/items/0/knowledge/correctOptionIds/0' }));
  });
  it('空的單選答案 → Schema 拒絕', () => {
    const p = clone(pkg);
    p.items[0].knowledge.correctOptionIds = [];
    expect(codes(p)).toContain('SCHEMA');
  });
  it('未知題型 → Schema 拒絕', () => {
    const p = clone(pkg) as unknown as { items: Array<{ knowledge: { type: string } }> };
    p.items[0].knowledge.type = 'matching';
    expect(codes(p)).toContain('SCHEMA');
  });
  it('未知 major 版本 → SCHEMA_UNSUPPORTED，不猜', () => {
    const p = { ...clone(pkg), schemaVersion: '2.0.0' };
    expect(codes(p)).toEqual(['SCHEMA_UNSUPPORTED']);
  });
  it('重複的 JSON key → SEC002', () => {
    const r = validateText('{"a":1,"a":2}');
    expect(r.errors[0].code).toBe('SEC002');
  });
  it('__proto__ / constructor / prototype 鍵（含 extensions 內）被拒絕且不污染原型', () => {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      expect(() => parseStrictJson(`{"x":{"${key}":{"polluted":true}}}`)).toThrow(StrictJsonError);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const txt = quizText.replace('"discussionPrompts"', '"extensions": {"org.example.x": {"__proto__": {"polluted": true}}}, "discussionPrompts"');
    const r = validateText(txt);
    expect(r.ok).toBe(false);
    expect(r.errors[0].code).toBe('SEC002');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('超過 2 MiB → 拒絕', () => {
    const r = validateText('"' + 'x'.repeat(2 * 1024 * 1024 + 1) + '"');
    expect(r.ok).toBe(false);
  });
  it('巢狀過深 → 拒絕', () => {
    const r = validateText('['.repeat(30) + ']'.repeat(30));
    expect(r.ok).toBe(false);
    expect(r.errors[0].code).toBe('SEC001');
  });
  it('JSON 語法錯誤 → 定位並說明', () => {
    const r = validateText('{"a": }');
    expect(r.errors[0].code).toBe('JSON_SYNTAX');
  });
  it('惡意 HTML 與 script → SEC001', () => {
    const p = clone(pkg);
    p.items[0].explanation.short = '看這裡 <script>alert(1)</script>';
    expect(codes(p)).toContain('SEC001');
    const q = clone(pkg);
    q.items[1].context = '<img src=x onerror=alert(1)>';
    expect(codes(q)).toContain('SEC001');
  });
  it('javascript: 連結與遠端圖片 → SEC001', () => {
    const p = clone(pkg);
    p.items[0].explanation.mechanism = '[點我](javascript:alert(1))';
    expect(codes(p)).toContain('SEC001');
    const q = clone(pkg);
    q.items[0].explanation.mechanism = '![x](https://evil.example/a.png)';
    expect(codes(q)).toContain('SEC001');
  });
  it('來源網址為 javascript:/data: → 拒絕', () => {
    const p = clone(pkg);
    p.sources[0].url = 'javascript:alert(1)';
    expect(validatePackage(p).ok).toBe(false);
  });
  it('重複 ID → REF001', () => {
    const p = clone(pkg);
    p.sources[1].id = p.sources[0].id;
    expect(codes(p)).toContain('REF001');
  });
  it('disputeScope=answer 配單選題 → EDU002', () => {
    const p = clone(pkg);
    p.items[0].disputeScope = 'answer';
    expect(codes(p)).toContain('EDU002');
  });
  it('validFrom 晚於 validUntil → TIME001', () => {
    const p = clone(pkg);
    p.items[0].validity.validUntil = '2020-01-01T00:00:00Z';
    expect(codes(p)).toContain('TIME001');
  });
  it('作者自稱 reviewed 但沒有雙報告 → TIME002；作者自審 → GOV002', () => {
    const p = clone(pkg);
    p.items[0].governance.verification = 'reviewed';
    expect(codes(p)).toContain('TIME002');
    const q = clone(pkg);
    q.items[0].governance.reviewers = [{ id: 'spec-editor', scope: 'domain', decision: 'approve', reviewedAt: '2026-10-17T00:00:00Z', notes: 'x' }];
    expect(codes(q)).toContain('GOV002');
  });
  it('已發布單選題沒有原始證據 → GOV001', () => {
    const p = clone(pkg);
    p.items[0].governance.lifecycle = 'published';
    p.items[0].evidenceIds = [];
    expect(codes(p)).toContain('GOV001');
  });
});

function item(type: 'single' | 'multiple' | 'reflection', correct: string[], options = ['a', 'b', 'c']): Item {
  const base = clone(pkg.items[0]);
  base.knowledge = {
    ...base.knowledge,
    type,
    options: type === 'reflection' ? [] : options.map((id) => ({ id, label: id })),
    correctOptionIds: correct,
  };
  return base;
}

describe('AT-03 判分', () => {
  it('single：ID 相等才對', () => {
    const it1 = item('single', ['b']);
    expect(judge(it1, 'answered', ['b'])).toBe('correct');
    expect(judge(it1, 'answered', ['a'])).toBe('incorrect');
  });
  it('multiple：集合完全相等，順序與重複無關，沒有部分分數', () => {
    const m = item('multiple', ['a', 'c']);
    expect(judge(m, 'answered', ['c', 'a'])).toBe('correct');
    expect(judge(m, 'answered', ['a'])).toBe('incorrect');
    expect(judge(m, 'answered', ['a', 'b', 'c'])).toBe('incorrect');
    expect(judge(m, 'answered', ['a', 'a', 'c'])).toBe('correct');
  });
  it('reflection、不知道、略過都不是答錯', () => {
    expect(judge(item('reflection', []), 'answered', [])).toBe('unscored');
    expect(judge(item('single', ['b']), 'unknown', [])).toBeNull();
    expect(judge(item('single', ['b']), 'skipped', [])).toBeNull();
  });
  it('選項順序打亂不改判定（判定只看 ID）', () => {
    const a = item('single', ['b'], ['a', 'b', 'c']);
    const b = item('single', ['b'], ['c', 'b', 'a']);
    expect(judge(a, 'answered', ['b'])).toBe(judge(b, 'answered', ['b']));
  });
  it('分母只含首次、可計分、已回答；0 分母可辨識', () => {
    const base = { isFirstRun: true, eligibility: 'eligible' as const };
    const s = summarize(
      [
        { ...base, answerState: 'answered', result: 'correct' },
        { ...base, answerState: 'answered', result: 'incorrect' },
        { ...base, answerState: 'unknown', result: null },
        { ...base, answerState: 'answered', result: 'unscored' },
        { ...base, isFirstRun: false, answerState: 'answered', result: 'correct' },
        { isFirstRun: true, eligibility: 'prototype', answerState: 'answered', result: 'correct' },
      ],
      'eligible',
      6,
    );
    expect(s).toEqual({ correct: 1, denominator: 2, excluded: 4 });
    expect(summarize([], 'eligible', 12).denominator).toBe(0);
  });
  it('信心回饋：high/low × 對/錯，medium 與缺值不硬分', () => {
    expect(confidenceFeedback('correct', 'high')).toMatch(/一致/);
    expect(confidenceFeedback('correct', 'low')).toMatch(/把握不高/);
    expect(confidenceFeedback('incorrect', 'low')).toMatch(/還不確定/);
    expect(confidenceFeedback('incorrect', 'high')).toMatch(/不同/);
    expect(confidenceFeedback('correct', 'medium')).toMatch(/有些把握/);
    expect(confidenceFeedback('correct', null)).toMatch(/沒有提供/);
    expect(confidenceFeedback('unscored', 'high')).toBeNull();
  });
});

describe('AT-05 資格判斷（注入時鐘）', () => {
  const it0 = clone(pkg.items[0]);
  let hash = '';
  const mk = async (over: Partial<StatusCatalog['entries'][0]> = {}, cat: Partial<StatusCatalog> = {}): Promise<StatusCatalog> => {
    hash = hash || (await itemHash(it0));
    return {
      generatedAt: '2026-10-17T00:00:00Z',
      expiresAt: '2026-10-18T00:00:00Z',
      entries: [{ itemId: it0.id, version: it0.version, locale: 'zh-Hant-TW', sha256: hash, lifecycle: 'published', verification: 'unreviewed', reviewerOrg: null, reason: null, supersededBy: null, ...over }],
      ...cat,
    };
  };
  const run = async (catalog: StatusCatalog | null, now: string, online = true, i: Item = it0) =>
    evaluateEligibility({ item: i, hash: await itemHash(i), locale: 'zh-Hant-TW', catalog, now: new Date(now), online });

  it('正常 → eligible（published）／prototype（draft）', async () => {
    expect((await run(await mk(), '2026-10-17T06:00:00Z')).kind).toBe('eligible');
    expect((await run(await mk({ lifecycle: 'draft' }), '2026-10-17T06:00:00Z')).kind).toBe('prototype');
  });
  it('validFrom 當刻起有效，前一毫秒不是', async () => {
    const cat = await mk({}, { generatedAt: '2026-10-16T00:00:00Z', expiresAt: '2026-10-18T00:00:00Z' });
    expect((await run(cat, '2026-10-16T15:59:59.999Z')).kind).toBe('historical');
    expect((await run(cat, '2026-10-16T16:00:00.000Z')).kind).toBe('eligible');
  });
  it('validUntil 當刻失效（[from, until) 半開區間）', async () => {
    const i = clone(it0);
    i.validity.validUntil = '2026-10-17T12:00:00Z';
    const cat = await mk({ sha256: await itemHash(i) });
    expect((await run(cat, '2026-10-17T11:59:59.999Z', true, i)).kind).toBe('eligible');
    expect(await run(cat, '2026-10-17T12:00:00.000Z', true, i)).toEqual({ kind: 'historical', reason: 'validity_ended' });
  });
  it('reviewDueAt 之後 → historical（validUntil=null 不代表永久有效）', async () => {
    const cat = await mk({}, { generatedAt: '2026-11-15T00:00:00Z', expiresAt: '2026-11-17T00:00:00Z' });
    expect(await run(cat, '2026-11-15T15:59:59Z')).toMatchObject({ kind: 'eligible' });
    expect(await run(cat, '2026-11-15T16:00:00Z')).toEqual({ kind: 'historical', reason: 'review_overdue' });
  });
  it('撤回優先於過期判斷，並保留理由', async () => {
    const cat = await mk({ lifecycle: 'withdrawn', reason: '來源有誤', supersededBy: '0.2.0' }, { expiresAt: '2026-10-17T01:00:00Z' });
    expect(await run(cat, '2026-10-17T05:00:00Z')).toEqual({ kind: 'withdrawn', reason: '來源有誤', supersededBy: '0.2.0' });
  });
  it('狀態缺失／目錄無此題／雜湊不符／24 小時到期／離線／時鐘過早 → historical', async () => {
    expect(await run(null, '2026-10-17T06:00:00Z')).toEqual({ kind: 'historical', reason: 'no_catalog' });
    const empty = await mk({}, { entries: [] });
    expect(await run(empty, '2026-10-17T06:00:00Z')).toEqual({ kind: 'historical', reason: 'not_in_catalog' });
    expect(await run(await mk({ sha256: 'deadbeef' }), '2026-10-17T06:00:00Z')).toEqual({ kind: 'historical', reason: 'hash_mismatch' });
    expect(await run(await mk(), '2026-10-18T00:00:00Z')).toEqual({ kind: 'historical', reason: 'catalog_expired' });
    expect(await run(await mk(), '2026-10-17T06:00:00Z', false)).toEqual({ kind: 'historical', reason: 'offline' });
    expect(await run(await mk(), '2026-10-16T20:00:00Z')).toEqual({ kind: 'historical', reason: 'clock_skew' });
  });
  it('目錄標 expired → historical；內容被改動（雜湊變了）就不再被信任', async () => {
    expect(await run(await mk({ lifecycle: 'expired' }), '2026-10-17T06:00:00Z')).toEqual({ kind: 'historical', reason: 'expired' });
    const tampered = clone(it0);
    tampered.knowledge.correctOptionIds = ['a'];
    expect(await run(await mk(), '2026-10-17T06:00:00Z', true, tampered)).toEqual({ kind: 'historical', reason: 'hash_mismatch' });
  });
  it('作者在題目檔自稱 reviewed 無效：資格只看可信目錄', async () => {
    const i = clone(it0);
    i.governance.verification = 'reviewed';
    const cat = await mk({ sha256: await itemHash(i), lifecycle: 'published', verification: 'unreviewed' });
    expect(await run(cat, '2026-10-17T06:00:00Z', true, i)).toEqual({ kind: 'eligible', verification: 'unreviewed' });
  });
});
