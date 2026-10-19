// 題庫的「寫法」檢查：情境與選項不先講條文或判決名稱；每題至少 3 個選項；
// 選項長度相近，正解不會靠長度被猜到；沒有定論的題也有選項、但沒有正解。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { QuizPackage } from '../src/core/types';
import { validatePackage } from '../src/core/validator';
import { lintPackage } from '../src/authoring/lint';

const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'content-src', 'constitution.quiz.json'), 'utf8')) as QuizPackage;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const SPOILER = /第\s*[0-9一二三四五六七八九十百]+\s*條|釋字|憲判字|增修條文|判決字號/;

describe('12 題的寫法', () => {
  it('情境、問題、選項裡沒有條號、釋字、憲判字（條文留到答案頁才揭曉）', () => {
    for (const it of pkg.items) {
      const front = [it.context, it.knowledge.prompt, ...it.knowledge.options.map((o) => o.label)];
      for (const s of front) expect(SPOILER.test(s), `${it.id}：「${s.slice(0, 24)}…」`).toBe(false);
    }
  });
  it('每題至少 3 個選項；有定論的題恰好一個正解；沒有定論的題有選項、沒有正解', () => {
    for (const it of pkg.items) {
      expect(it.knowledge.options.length, it.id).toBeGreaterThanOrEqual(3);
      if (it.knowledge.type === 'reflection') {
        expect(it.knowledge.correctOptionIds, it.id).toEqual([]);
        const notes = it.extensions?.['civic.option-notes'] as Record<string, string>;
        for (const o of it.knowledge.options) expect(notes[o.id]?.length ?? 0, `${it.id} 的選項 ${o.id} 要有「隱含的前提」`).toBeGreaterThan(10);
      } else {
        expect(it.knowledge.correctOptionIds, it.id).toHaveLength(1);
      }
    }
  });
  it('選項長度相近（最長不超過最短的 1.8 倍），避免靠長度猜答案', () => {
    for (const it of pkg.items) {
      const lens = it.knowledge.options.map((o) => [...o.label].length);
      expect(Math.max(...lens) / Math.min(...lens), `${it.id}：${lens.join('/')}`).toBeLessThanOrEqual(1.8);
    }
  });
  it('正解不是「每次都最長」：最長選項剛好是正解的題目不超過一半', () => {
    const scored = pkg.items.filter((i) => i.knowledge.type === 'single');
    const longestIsCorrect = scored.filter((i) => {
      const lens = i.knowledge.options.map((o) => [...o.label].length);
      const max = Math.max(...lens);
      const idx = lens.indexOf(max);
      return lens.filter((l) => l === max).length === 1 && i.knowledge.options[idx].id === i.knowledge.correctOptionIds[0];
    });
    expect(longestIsCorrect.length / scored.length).toBeLessThanOrEqual(0.5);
  });
  it('正解的位置有變化，不是每題都在同一個', () => {
    const ids = pkg.items.filter((i) => i.knowledge.type === 'single').map((i) => i.knowledge.correctOptionIds[0]);
    expect(new Set(ids).size).toBeGreaterThan(1);
  });
  it('出題提醒（lint）對正式題庫沒有任何提醒', () => {
    expect(lintPackage(pkg)).toEqual([]);
  });
});

describe('沒有定論的題也能有選項', () => {
  it('格式允許；指定正解則被拒絕', () => {
    expect(validatePackage(clone(pkg)).errors).toEqual([]);
    const bad = clone(pkg);
    const i = bad.items.findIndex((x) => x.knowledge.type === 'reflection');
    bad.items[i].knowledge.correctOptionIds = ['a'];
    expect(validatePackage(bad).ok).toBe(false);
  });
});
