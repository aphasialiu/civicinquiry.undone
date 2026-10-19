import type { Eligibility } from '../core/eligibility';

const TW = 'Asia/Taipei';

/** 日期（ISO 日期或時間戳）→ 臺灣時區的 yyyy-MM-dd；無法解析則原樣回傳。 */
export function fmtDate(iso: string | null): string {
  if (!iso) return '未知';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TW, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
  return p;
}

export function fmtDateTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Intl.DateTimeFormat('zh-TW', { timeZone: TW, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(t));
}

export function eligibilityLabel(e: Eligibility): string {
  switch (e.kind) {
    case 'eligible': return e.verification === 'reviewed' ? '已通過專業審查' : '自行發布，未經平台專業審查';
    case 'prototype': return '教育原型，尚未審查';
    case 'historical': return '歷史閱讀，不計分';
    case 'withdrawn': return '已撤回';
  }
}

export const CONFIDENCE_LABEL = { high: '很有把握', medium: '有些把握', low: '沒把握' } as const;
