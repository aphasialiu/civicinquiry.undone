import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { QuizPackage } from '../src/core/types';
import type { Attempt } from '../src/session/attempt';
import { buildPilotReport, emptyPilotNote } from '../src/pilot';

const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'content-src', 'constitution.quiz.json'), 'utf8')) as QuizPackage;
const NOW = new Date('2026-10-18T10:00:00Z');
const att = (n: number, over: Partial<Attempt>): Attempt => ({
  runId: 'r', runIndex: 0, itemId: pkg.items[n].id, itemVersion: pkg.items[n].version, locale: 'zh-Hant-TW', intuitionOptionId: null,
  answerState: 'answered', selectedOptionIds: ['a'], confidence: null, viewedExplanationBeforeAnswer: false, result: 'incorrect', eligibility: 'prototype', ...over,
});

describe('試答紀錄（純文字）', () => {
  it('列出每題：我選、花的秒數、覺得不像真人會選的選項、卡住的地方；只含作答過的題', () => {
    const text = buildPilotReport(
      pkg,
      [att(0, {}), att(1, { answerState: 'unknown', selectedOptionIds: [], result: null }), att(2, { answerState: 'skipped', viewedExplanationBeforeAnswer: true, selectedOptionIds: [], result: null })],
      { [`${pkg.items[0].id}@${pkg.items[0].version}`]: { unlikely: ['c'], comment: '第二個選項看不懂', seconds: 23 } },
      '小明',
      NOW,
    );
    expect(text).toContain('暱稱：小明');
    expect(text).toContain(`作答 3 題／共 ${pkg.items.length} 題`);
    expect(text).toContain('第 1 題　調整預算項目');
    expect(text).toContain('我選：A（符合。總額沒變，人民沒有多負擔一毛錢，只是調整錢…）（和憲政規定不一樣）');
    expect(text).toContain('花了：23 秒');
    expect(text).toContain('覺得不太可能有人會選的選項：C');
    expect(text).toContain('卡住或看不懂的地方：第二個選項看不懂');
    expect(text).toContain('我選：我不知道');
    expect(text).toContain('我選：直接看了答案（沒作答）');
    expect(text).not.toContain('第 4 題');
    expect(text).toContain('只有你按下載或複製才會產生');
  });
  it('沒填的欄位有明確的預設字樣；不含任何裝置或識別資訊', () => {
    const text = buildPilotReport(pkg, [att(0, {})], {}, '', NOW);
    expect(text).toContain('暱稱：（沒有填）');
    expect(text).toContain('覺得不太可能有人會選的選項：沒有');
    expect(text).toContain('（沒寫）');
    expect(text).not.toMatch(/userAgent|runId|cookie|localhost/i);
  });
  it('emptyPilotNote', () => expect(emptyPilotNote()).toEqual({ unlikely: [], comment: '', seconds: null }));
});
