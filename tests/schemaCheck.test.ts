// 交叉比對：自寫的 schema 直譯器（正式環境用，因 CSP 禁 eval）必須和 Ajv（參考實作）判斷一致。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import schema from '../src/schema/quiz.schema.json';
import { checkSchema } from '../src/core/schemaCheck';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const ref = ajv.compile(schema);

const base = JSON.parse(readFileSync(join(__dirname, '..', 'content-src', 'constitution.quiz.json'), 'utf8'));
const demo = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'demo.quiz.json'), 'utf8'));

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function paths(v: unknown, prefix: Array<string | number> = [], out: Array<Array<string | number>> = []) {
  out.push(prefix);
  if (Array.isArray(v)) v.forEach((x, i) => paths(x, [...prefix, i], out));
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) paths((v as Record<string, unknown>)[k], [...prefix, k], out);
  return out;
}

const REPLACEMENTS: unknown[] = [null, 0, 1, -1, true, false, '', 'x', 'X Y', '2026-02-30', '2026-10-17', '2026-10-17T00:00:00Z', 'not a date', 'javascript:alert(1)', 'https://a.example/', [], [[]], {}, { a: 1 }, 'a'.repeat(801), 'a'.repeat(13000), '1.0.0', '2.0.0', 'ltr', 'rtl', 'single', 'matching', 'zh-Hant-TW', '中文😀'];

describe('schemaCheck 與 Ajv 一致', () => {
  it('兩份有效檔：都通過', () => {
    for (const d of [base, demo]) {
      expect(ref(d)).toBe(true);
      expect(checkSchema(schema as Record<string, unknown>, d)).toEqual([]);
    }
  });

  it('3000 個隨機突變（替換／刪除／加鍵／重複陣列項）：有效與否的判斷完全相同', () => {
    const rand = rng(20261017);
    let invalid = 0;
    for (let n = 0; n < 3000; n++) {
      const doc = JSON.parse(JSON.stringify(n % 2 ? base : demo));
      const ps = paths(doc).filter((p) => p.length > 0);
      const target = ps[Math.floor(rand() * ps.length)];
      const parent = target.slice(0, -1).reduce((o: any, k) => o[k], doc);
      const key = target[target.length - 1];
      const mode = Math.floor(rand() * 4);
      if (mode === 0) parent[key] = REPLACEMENTS[Math.floor(rand() * REPLACEMENTS.length)];
      else if (mode === 1) Array.isArray(parent) ? parent.splice(key as number, 1) : delete parent[key];
      else if (mode === 2 && parent && typeof parent === 'object' && !Array.isArray(parent)) parent['extra-field'] = 1;
      else if (Array.isArray(parent)) parent.push(JSON.parse(JSON.stringify(parent[key as number])));
      else parent[key] = REPLACEMENTS[Math.floor(rand() * REPLACEMENTS.length)];

      const a = ref(doc);
      const b = checkSchema(schema as Record<string, unknown>, doc).length === 0;
      if (a !== b) throw new Error(`第 ${n} 次突變判斷不同：Ajv=${a} 自寫=${b}；路徑 ${JSON.stringify(target)}，突變模式 ${mode}\n${JSON.stringify(checkSchema(schema as Record<string, unknown>, doc).slice(0, 3))}\n${JSON.stringify((ref.errors ?? []).slice(0, 3))}`);
      if (!a) invalid++;
    }
    expect(invalid).toBeGreaterThan(1000); // 確認真的有在測無效情況，不是全部都通過
  });
});
