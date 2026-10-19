import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validatePackage } from '../src/core/validator';
import { judge } from '../src/core/assessment';
import type { QuizPackage } from '../src/core/types';
import { addItem, addSource, getIn, moveAt, newQuiz, removeSource, setIn } from '../src/authoring/draft';
import { bumpVersion, diffPackages, finalizeRevision, suggestBump } from '../src/authoring/diff';
import { exportDraft, exportFinal, importText } from '../src/authoring/exchange';

const NOW = new Date('2026-10-18T03:00:00Z');
const published = JSON.parse(readFileSync(join(__dirname, '..', 'content-src', 'constitution.quiz.json'), 'utf8')) as QuizPackage;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** 一份「非法律領域」（物理）的完整題庫，只靠編輯器的資料操作做出來。 */
function physicsQuiz(): QuizPackage {
  let p = newQuiz({ namespace: 'sci.demo', quizId: 'physics', title: '物理直覺', locale: 'zh-Hant-TW', authorName: 'Ada Chen', now: NOW });
  p = addSource(p, NOW);
  p = setIn(p, ['description'], '日常物理的反直覺題');
  p = setIn(p, ['authors', 0, 'credentialText'], '高中物理教師（自述）');
  p = setIn(p, ['sources', 0], { id: 'nist', title: 'NIST 物理常數', url: 'https://physics.nist.gov/cuu/Constants/', type: 'research', publisher: 'NIST', publishedAt: null, accessedAt: '2026-10-18', locator: '重力加速度 g 的條目', rights: 'link_only' });
  const it = p.items[0];
  p = setIn(p, ['items', 0], {
    ...it, topic: '落下的快慢', jurisdiction: 'global', context: '在真空中，同時放開一顆鐵球與一根羽毛。',
    intuition: { ...it.intuition, prompt: '重的東西應該落得比較快。' },
    knowledge: { type: 'single', prompt: '在真空中，兩者的落下速度？', options: [{ id: 'a', label: '鐵球先到' }, { id: 'b', label: '同時到' }, { id: 'c', label: '羽毛先到' }], correctOptionIds: ['b'], rationale: '真空中沒有空氣阻力，加速度相同。' },
    explanation: { short: '沒有空氣阻力時，所有物體的落下加速度相同。', mechanism: '重力加速度與質量無關。', possibleReasons: '日常看到的差異來自空氣阻力。', alternatives: '在空氣中結果會不同。', limitations: '本題只談真空。', misconception: '把空氣阻力的效果當成重力本身的差異。' },
    evidenceIds: ['nist'], readingIds: ['nist'], discussionPrompts: ['哪些日常經驗讓你以為重的落得快？'],
    search: { ...it.search, keywords: ['free fall vacuum'], region: 'global', language: 'zh-Hant' },
    validity: { ...it.validity, knowledgeVersion: '牛頓力學；2026-10-18 查閱' },
  });
  return p;
}

describe('編輯資料操作', () => {
  it('setIn 不可變、getIn 取值', () => {
    const a = { x: { y: [1, 2] } };
    const b = setIn(a, ['x', 'y', 1], 9);
    expect(a.x.y[1]).toBe(2);
    expect(getIn(b, ['x', 'y', 1])).toBe(9);
  });
  it('新草稿一開始不合法（空欄位會被指出），補完後合法', () => {
    const blank = newQuiz({ namespace: 'sci.demo', quizId: 'physics', title: 'x', locale: 'zh-Hant-TW', authorName: 'Ada', now: NOW });
    expect(validatePackage(clone(blank)).ok).toBe(false);
    const r = validatePackage(clone(physicsQuiz()));
    expect(r.errors).toEqual([]);
  });
  it('刪除來源會同步清掉各題的參照', () => {
    const p = removeSource(physicsQuiz(), 0);
    expect(p.items[0].evidenceIds).toEqual([]);
    expect(p.items[0].readingIds).toEqual([]);
  });
  it('addItem 產生不重複的 ID；moveAt 調整順序', () => {
    let p = physicsQuiz();
    p = addItem(addItem(p, NOW), NOW);
    expect(new Set(p.items.map((i) => i.id)).size).toBe(3);
    expect(moveAt([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(moveAt([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });
  it('正解缺失時，判分回 null（缺資料），不猜答案', () => {
    const it = physicsQuiz().items[0];
    const bad = { ...it, knowledge: { ...it.knowledge, correctOptionIds: [] } };
    expect(judge(bad, 'answered', ['a'])).toBeNull();
  });
});

describe('匯出匯入（往返）', () => {
  it('合法題庫：匯出 → 匯入 → 語意完全相等，包含 extensions；輸出鍵排序、LF、兩格縮排', () => {
    const p = physicsQuiz();
    p.items[0].extensions = { 'org.example.note': { a: [1, 2, { z: 1, b: 2 }] } };
    const out = exportFinal(p);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.text).not.toContain('\r');
    expect(out.text).toMatch(/^\{\n  "authors"/);
    expect(out.filename).toBe('物理直覺（0.1.0）.題庫檔.json');
    const back = importText(out.text, null);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(JSON.stringify(back.pkg)).toBeDefined();
      expect(exportFinal(back.pkg)).toEqual(out); // 再匯出位元組相同
      expect(back.pkg.items[0].extensions).toEqual(p.items[0].extensions);
    }
  });
  it('12 題原型也能往返', () => {
    const out = exportFinal(published);
    expect(out.ok).toBe(true);
    if (out.ok) expect(importText(out.text, null).ok).toBe(true);
  });
  it('未通過驗證不能正式匯出，但草稿可以備份', () => {
    const blank = newQuiz({ namespace: 'sci.demo', quizId: 'physics', title: 'x', locale: 'zh-Hant-TW', authorName: 'Ada', now: NOW });
    const r = exportFinal(blank);
    expect(r.ok).toBe(false);
    expect(exportDraft(blank).filename).toMatch(/草稿\.json$/);
  });
  it('匯入失敗時回報欄位位置，現有草稿不受影響（回傳不含 pkg）', () => {
    const p = physicsQuiz();
    const bad = JSON.stringify({ ...p, items: [{ ...p.items[0], knowledge: { ...p.items[0].knowledge, correctOptionIds: ['zzz'] } }] });
    const r = importText(bad, p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContainEqual(expect.objectContaining({ code: 'REF002', path: '/items/0/knowledge/correctOptionIds/0' }));
  });
  it('AT-19：重複 key、原型污染鍵、HTML、javascript 連結、超大檔、未知 major 都被拒絕', () => {
    const p = physicsQuiz();
    const text = exportFinal(p);
    if (!text.ok) throw new Error('setup');
    const cases = [
      text.text.replace('"quizId"', '"quizId": "x", "quizId"'),
      text.text.replace('"locator"', '"__proto__": {"x":1}, "locator"'),
      text.text.replace('同時到', '<script>alert(1)</script>'),
      text.text.replace('https://physics.nist.gov/cuu/Constants/', 'javascript:alert(1)'),
      text.text.replace('"schemaVersion": "1.0.0"', '"schemaVersion": "2.0.0"'),
      ' '.repeat(2 * 1024 * 1024 + 1),
    ];
    for (const c of cases) expect(importText(c, p).ok).toBe(false);
  });
  it('AT-10：匯入自稱 reviewed 的檔案 → 警告「不被採信」', () => {
    const p = physicsQuiz();
    p.items[0].governance = { lifecycle: 'draft', verification: 'reviewed', lastReviewedAt: '2026-10-17T00:00:00Z', notes: 'x', reviewers: [
      { id: 'r1', scope: 'domain', decision: 'approve', reviewedAt: '2026-10-17T00:00:00Z', notes: 'ok' },
      { id: 'r2', scope: 'education', decision: 'approve', reviewedAt: '2026-10-17T00:00:00Z', notes: 'ok' }] };
    const out = exportFinal(p);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const r = importText(out.text, null);
    expect(r.ok && r.warnings.join()).toContain('不會被採信');
  });
  it('衝突：同一版本內容相同 → no-op；內容不同 → collision（不覆蓋、不偷偷升版）', () => {
    const p = physicsQuiz();
    const same = exportFinal(p);
    if (!same.ok) throw new Error('setup');
    expect(importText(same.text, p)).toMatchObject({ ok: true, relation: 'noop' });
    const q = setIn(p, ['items', 0, 'topic'], '改過的主題');
    const diff = exportFinal(q);
    if (!diff.ok) throw new Error('setup');
    const r = importText(diff.text, p);
    expect(r).toMatchObject({ ok: true, relation: 'collision' });
    if (r.ok) expect(r.changes.some((c) => c.path === '/topic')).toBe(true);
    const other = exportFinal(setIn(p, ['quizId'], 'other'));
    if (!other.ok) throw new Error('setup');
    expect(importText(other.text, p)).toMatchObject({ ok: true, relation: 'other-quiz' });
  });
});

describe('版本差異與修訂（FR-10）', () => {
  it('無變動 → 沒有差異、不升版', () => {
    expect(diffPackages(published, clone(published))).toEqual([]);
    expect(suggestBump([])).toBeNull();
  });
  it('只改解釋文字 → patch；改正解、情境、證據、適用期間 → minor 並標示需重審', () => {
    const typo = setIn(clone(published), ['items', 0, 'explanation', 'short'], '總額不變與個別項目沒有增加是兩回事（修正錯字）。');
    const c1 = diffPackages(published, typo);
    expect(c1).toHaveLength(1);
    expect(c1[0]).toMatchObject({ itemId: 'tw-budget-01', label: '核心解釋', severity: 'text' });
    expect(suggestBump(c1)).toBe('patch');

    const answer = setIn(clone(published), ['items', 0, 'knowledge', 'correctOptionIds'], ['a']);
    const c2 = diffPackages(published, answer);
    expect(c2[0]).toMatchObject({ label: '正解', severity: 'answer', before: '"b"', after: '"a"' });
    expect(suggestBump(c2)).toBe('minor');
    for (const [path, v] of [[['items', 0, 'context'], '新的情境'], [['items', 0, 'validity', 'asOf'], '2026-10-19'], [['items', 0, 'evidenceIds'], ['l01']]] as const) {
      expect(suggestBump(diffPackages(published, setIn(clone(published), path, v)))).toBe('minor');
    }
  });
  it('新增與刪除整題都算需重審的變動', () => {
    const added = addItem(clone(published), NOW);
    expect(diffPackages(published, added).some((c) => c.label === '新增整題')).toBe(true);
    const removed = { ...clone(published), items: published.items.slice(1) };
    expect(diffPackages(published, removed).some((c) => c.label === '刪除整題' && c.itemId === 'tw-budget-01')).toBe(true);
  });
  it('治理聲明與版本號本身的變動不算內容差異', () => {
    const g = setIn(clone(published), ['items', 0, 'governance', 'notes'], '另一段備註');
    expect(diffPackages(published, g)).toEqual([]);
  });
  it('bumpVersion', () => {
    expect(bumpVersion('0.1.0', 'minor')).toBe('0.2.0');
    expect(bumpVersion('1.4.9', 'patch')).toBe('1.4.10');
  });
  it('AT-10：已發布版本改答案 → 只該題升 minor、審查重置、記原因與被取代版本；沒變的題保持原樣；舊版保留', () => {
    const base = clone(published);
    const claim = { lifecycle: 'draft' as const, verification: 'reviewed' as const, lastReviewedAt: '2026-10-17T00:00:00Z', notes: '已審', reviewers: [
      { id: 'r1', scope: 'domain' as const, decision: 'approve' as const, reviewedAt: '2026-10-17T00:00:00Z', notes: 'ok' },
      { id: 'r2', scope: 'education' as const, decision: 'approve' as const, reviewedAt: '2026-10-17T00:00:00Z', notes: 'ok' }] };
    base.items[0].governance = claim;
    base.items[1].governance = claim;
    expect(validatePackage(clone(base)).ok).toBe(true);
    const draft = setIn(clone(base), ['items', 0, 'knowledge', 'correctOptionIds'], ['a']);
    const rev = finalizeRevision(base, draft, '依新判決更正答案');
    expect(rev.version).toBe('0.2.0');
    expect(rev.items[0].version).toBe('0.2.0');
    expect(rev.items[0].governance).toMatchObject({ verification: 'unreviewed', lastReviewedAt: null, reviewers: [] });
    expect(rev.items[0].extensions!['civic.revision']).toEqual({ reason: '依新判決更正答案', supersedes: '0.1.0' });
    expect(rev.items[1]).toEqual(base.items[1]); // 沒變的題原封不動（連同它自己的審查聲明）
    expect(rev.items[1].governance.verification).toBe('reviewed');
    expect(base.items[0].version).toBe('0.1.0'); // 舊版保留
    expect(validatePackage(clone(rev)).ok).toBe(true);
  });
  it('只有錯字 → 題庫與該題升 patch', () => {
    const typo = setIn(clone(published), ['items', 2, 'explanation', 'short'], '修正錯字後的核心解釋。');
    const rev = finalizeRevision(published, typo, '錯字');
    expect(rev.version).toBe('0.1.1');
    expect(rev.items[2].version).toBe('0.1.1');
    expect(rev.items[0].version).toBe('0.1.0');
  });
});
