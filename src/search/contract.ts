// POST /api/v1/search 的請求與回應契約（NEWS_EXPLORER_SPEC §4）。前後端共用。
// 不變條件：這裡不得出現答案、信心、runId、userId 等欄位。

export const CATEGORIES = ['news', 'argument', 'comparison', 'official', 'academic'] as const;
export type SearchCategory = (typeof CATEGORIES)[number];

export const SOURCE_TYPES = ['reporting', 'official', 'academic', 'argument', 'commentary', 'unknown'] as const;
export type SearchSourceType = (typeof SOURCE_TYPES)[number];

export interface SearchRequest {
  profileId: string;
  category: SearchCategory;
  region: string;
  language: string;
  from: string | null;
  to: string | null;
  sourceTypes: SearchSourceType[];
  reviewFilter: 'all' | 'reviewed';
  cursor: string | null;
}

export type SearchMode = 'curated' | 'live' | 'mixed' | 'degraded';

export interface SearchItem {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: string | null;
  updatedAt: string | null;
  sourceType: SearchSourceType;
  region: string;
  language: string;
  summary: string | null;
  summaryOrigin: 'editor' | 'provider' | 'none';
  reviewStatus: 'reviewed' | 'unreviewed' | 'needs_check';
  linkStatus: 'ok' | 'unknown' | 'broken' | 'paywall';
  provenance: { provider: string; originalId: string; retrievedAt: string; rightsPolicyId: string };
  /** 供應商是測試替身時為 true，畫面必須標示「測試資料」 */
  isTestData: boolean;
}

export interface SearchResponse {
  mode: SearchMode;
  items: SearchItem[];
  nextCursor: string | null;
  fetchedAt: string;
  partial: boolean;
  warnings: string[];
  coverage: { appliedFilters: string[]; unsupportedFilters: string[] };
}

export interface SearchError {
  code: 'BAD_REQUEST' | 'NOT_FOUND' | 'RATE_LIMITED' | 'DISABLED' | 'UPSTREAM_FAILED' | 'UPSTREAM_TIMEOUT';
  message: string;
  retryAfterSeconds: number | null;
  canUseCurated: boolean;
}

export const MAX_BODY_BYTES = 4096;
const REQUEST_KEYS = ['profileId', 'category', 'region', 'language', 'from', 'to', 'sourceTypes', 'reviewFilter', 'cursor'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** 嚴格驗證：拒絕額外欄位（answer／confidence／userId／sessionId／供應商 URL 都會被擋下）。 */
export function parseSearchRequest(raw: unknown): { ok: true; value: SearchRequest } | { ok: false; message: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, message: '請求必須是 JSON 物件' };
  const o = raw as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!REQUEST_KEYS.includes(k)) return { ok: false, message: `不接受的欄位：${k}` };
  for (const k of REQUEST_KEYS) if (!(k in o)) return { ok: false, message: `缺少欄位：${k}` };

  const str = (k: string, max: number) => typeof o[k] === 'string' && (o[k] as string).length > 0 && (o[k] as string).length <= max;
  if (!str('profileId', 80) || !/^[a-z0-9][a-z0-9.-]*$/.test(o.profileId as string)) return { ok: false, message: 'profileId 不合法' };
  if (!CATEGORIES.includes(o.category as SearchCategory)) return { ok: false, message: 'category 不是已登記的類別' };
  if (!str('region', 50)) return { ok: false, message: 'region 不合法' };
  if (typeof o.language !== 'string' || !/^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{1,8})*$/.test(o.language) || o.language.length > 35) return { ok: false, message: 'language 不合法' };
  for (const k of ['from', 'to'] as const) {
    if (o[k] !== null && !(typeof o[k] === 'string' && validDate(o[k] as string))) return { ok: false, message: `${k} 必須是 YYYY-MM-DD 或 null` };
  }
  if (o.from && o.to && (o.from as string) > (o.to as string)) return { ok: false, message: '起始日期不得晚於結束日期' };
  if (!Array.isArray(o.sourceTypes) || o.sourceTypes.length > 5 || new Set(o.sourceTypes).size !== o.sourceTypes.length || !o.sourceTypes.every((t) => SOURCE_TYPES.includes(t as SearchSourceType))) {
    return { ok: false, message: 'sourceTypes 最多 5 項，且必須是已登記的來源類型' };
  }
  if (o.reviewFilter !== 'all' && o.reviewFilter !== 'reviewed') return { ok: false, message: 'reviewFilter 只能是 all 或 reviewed' };
  if (o.cursor !== null && !(typeof o.cursor === 'string' && o.cursor.length <= 512)) return { ok: false, message: 'cursor 不合法' };
  return { ok: true, value: o as unknown as SearchRequest };
}
