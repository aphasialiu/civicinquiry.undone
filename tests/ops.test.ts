import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkTranslations, translationErrors, untranslated } from '../src/core/translation';
import { applyWithdrawal } from '../scripts/withdraw';
import type { QuizPackage } from '../src/core/types';

const load = (f: string) => JSON.parse(readFileSync(join(__dirname, '..', 'content-src', 'fixtures', f), 'utf8')) as QuizPackage;
const zh = load('physics.zh-Hant-TW.quiz.json');
const en = load('physics.en.quiz.json');
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe('翻譯關係（AT-13）', () => {
  it('原文升版後，停在舊版的譯本被標為待更新；沒翻的題被列出', () => {
    expect(checkTranslations([zh, en])).toEqual([{ itemId: 'phys-fall', locale: 'en', kind: 'outdated', originalVersion: '0.2.0', translatedFrom: '0.1.0' }]);
    expect(untranslated(zh, en).map((i) => i.id)).toEqual(['phys-ice']);
  });
  it('譯本跟上原文版本 → 沒有問題', () => {
    const e = clone(en);
    e.items[0].translationOf!.version = '0.2.0';
    expect(checkTranslations([zh, e])).toEqual([]);
  });
  it('找不到原題 → LANG001 錯誤（不能發布）', () => {
    const errs = translationErrors([en]);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ code: 'LANG001', path: '/items/0/translationOf' });
    expect(translationErrors([zh, en])).toEqual([]);
  });
});

describe('撤回操作', () => {
  it('標記撤回並保留既有欄位；缺理由或格式錯誤會拒絕', () => {
    const o = applyWithdrawal({ 'a-1@0.1.0': { verification: 'reviewed' } }, 'a-1@0.1.0', ' 來源有誤 ', '0.2.0');
    expect(o['a-1@0.1.0']).toEqual({ verification: 'reviewed', lifecycle: 'withdrawn', reason: '來源有誤', supersededBy: '0.2.0' });
    expect(() => applyWithdrawal({}, 'a-1@0.1.0', '  ')).toThrow('理由');
    expect(() => applyWithdrawal({}, 'a-1', 'x')).toThrow('題目代號@版本');
  });
});
