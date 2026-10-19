// Assessment：純函式。沒有網路、時鐘、DOM。
import type { Item } from './types';

export type AnswerState = 'answered' | 'unknown' | 'skipped';
export type Result = 'correct' | 'incorrect' | 'unscored' | 'ineligible' | null;

/**
 * 判定知識題。
 * - single：選一個，ID 相等才對
 * - multiple：去重後集合完全相等才對，沒有部分分數
 * - reflection：永遠 unscored
 * - 「不知道」「略過」不是答錯：回傳 null（unknown／skipped 的 score=null）
 */
export function judge(item: Item, answerState: AnswerState, selectedOptionIds: readonly string[]): Result {
  const k = item.knowledge;
  if (k.type === 'reflection') return 'unscored';
  if (answerState !== 'answered') return null;
  // 沒有有效正解（例如作者預覽尚未填完）時不猜答案
  if (k.correctOptionIds.length === 0) return null;

  const selected = new Set(selectedOptionIds);
  if (k.type === 'single') {
    if (selected.size !== 1) return 'incorrect';
    return k.correctOptionIds.includes([...selected][0]) ? 'correct' : 'incorrect';
  }
  const correct = new Set(k.correctOptionIds);
  if (selected.size !== correct.size) return 'incorrect';
  for (const id of selected) if (!correct.has(id)) return 'incorrect';
  return 'correct';
}

export type Confidence = 'high' | 'medium' | 'low' | null;

/** 信心與正確性的文字回饋（EDUCATIONAL_DESIGN §5）。medium 與缺值不硬分四格。 */
export function confidenceFeedback(result: Result, confidence: Confidence): string | null {
  if (result !== 'correct' && result !== 'incorrect') return null;
  if (confidence === null) return '你沒有提供把握程度。';
  if (confidence === 'medium') return '你的把握程度是「有些把握」。';
  if (result === 'correct') {
    return confidence === 'high'
      ? '這題你的理解與把握一致。'
      : '你答對了，不過把握不高；可以再看一下理由，確認自己為什麼是對的。';
  }
  return confidence === 'low'
    ? '你對這題還不確定，建議讀一下下面的說明。'
    : '這題的結果和你原先的把握不同，可以回頭查證一下依據。';
}

export interface ScoreSummary {
  correct: number;
  /** 分母：首次、可計分、已回答的題數 */
  denominator: number;
  /** 被排除的題數（未回答、失效、反思等）＝ total − denominator */
  excluded: number;
}

export interface ScorableAttempt {
  isFirstRun: boolean;
  eligibility: 'eligible' | 'prototype' | 'historical' | 'withdrawn' | 'unavailable';
  answerState: AnswerState;
  result: Result;
}

/**
 * 分母只含：首次 run、eligible（或原型模式另算）、可計分、已回答。
 * 未知不當答錯，略過不當低信心；分母為 0 時由呼叫端顯示「尚無可計分題」。
 */
export function summarize(attempts: readonly ScorableAttempt[], mode: 'eligible' | 'prototype', total: number): ScoreSummary {
  const counted = attempts.filter(
    (a) => a.isFirstRun && a.eligibility === mode && a.answerState === 'answered' && (a.result === 'correct' || a.result === 'incorrect'),
  );
  const correct = counted.filter((a) => a.result === 'correct').length;
  return { correct, denominator: counted.length, excluded: total - counted.length };
}
