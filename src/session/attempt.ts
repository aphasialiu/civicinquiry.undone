// 讀者的 Attempt（本機資料結構，CONTENT_SCHEMA §2）。
// 這個目錄的內容絕對不能被 src/explorer 引用（PR-01：測驗與搜尋在程式依賴上隔離）。
import type { AnswerState, Confidence, Result } from '../core/assessment';

export type EligibilityKind = 'eligible' | 'prototype' | 'historical' | 'withdrawn' | 'unavailable';

export interface Attempt {
  /** 本機 run 識別碼，不得傳到任何 API */
  runId: string;
  /** 第幾次練習；0 是首次，只有首次計入分數 */
  runIndex: number;
  itemId: string;
  itemVersion: string;
  locale: string;
  /** 第一階段（價值／預測）所選，永不計分；略過則為 null */
  intuitionOptionId: string | null;
  answerState: AnswerState;
  selectedOptionIds: string[];
  confidence: Confidence;
  viewedExplanationBeforeAnswer: boolean;
  result: Result;
  /** 揭曉當下的資格判斷（決定能否計入分數） */
  eligibility: EligibilityKind;
}

export interface SessionData {
  runId: string;
  runIndex: number;
  attempts: Attempt[];
  /** 本機筆記，依題目 ID。預設只在記憶體。 */
  notes: Record<string, string>;
}

export function newRunId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function emptySession(): SessionData {
  return { runId: newRunId(), runIndex: 0, attempts: [], notes: {} };
}
