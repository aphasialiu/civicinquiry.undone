// Eligibility：item、狀態目錄、現在時間、是否在線 → 這題現在能不能當現行題。
// 純函式：時間與網路狀態都由呼叫端注入，方便測 UTC 邊界。
import type { Item, StatusCatalog, StatusEntry, Verification } from './types';

export type Eligibility =
  | { kind: 'eligible'; verification: Verification }
  | { kind: 'prototype'; verification: Verification }
  | { kind: 'historical'; reason: HistoricalReason }
  | { kind: 'withdrawn'; reason: string | null; supersededBy: string | null };

export type HistoricalReason =
  | 'offline'
  | 'no_catalog'
  | 'not_in_catalog'
  | 'hash_mismatch'
  | 'catalog_expired'
  | 'clock_skew'
  | 'not_yet_valid'
  | 'validity_ended'
  | 'review_overdue'
  | 'expired';

export const HISTORICAL_TEXT: Record<HistoricalReason, string> = {
  offline: '目前離線，無法確認這題是否已被撤回，只能當歷史閱讀。',
  no_catalog: '讀不到狀態目錄，無法確認這題目前是否有效，只能當歷史閱讀。',
  not_in_catalog: '狀態目錄裡沒有這題，視為未驗證，只能當歷史閱讀。',
  hash_mismatch: '題目內容與狀態目錄登記的版本不一致，只能當歷史閱讀。',
  catalog_expired: '狀態目錄已超過有效期限，無法確認最新狀態，只能當歷史閱讀。',
  clock_skew: '您的裝置時間比狀態目錄產生時間還早，時鐘可能不準，只能當歷史閱讀。',
  not_yet_valid: '這題的適用期間還沒開始，只能當歷史閱讀。',
  validity_ended: '這題的適用期間已結束，只能當歷史閱讀。',
  review_overdue: '這題已超過預定覆核日期，只能當歷史閱讀，不計分。',
  expired: '這題已標示為過期，只能當歷史閱讀。',
};

export interface EligibilityInput {
  item: Item;
  /** 目前載入的內容雜湊（itemHash） */
  hash: string;
  locale: string;
  catalog: StatusCatalog | null;
  now: Date;
  online: boolean;
}

export function findEntry(catalog: StatusCatalog, item: Item, locale: string): StatusEntry | undefined {
  return catalog.entries.find((e) => e.itemId === item.id && e.version === item.version && e.locale === locale);
}

export function evaluateEligibility(input: EligibilityInput): Eligibility {
  const { item, hash, locale, catalog, now, online } = input;
  const t = now.getTime();

  // 1. 可信目錄已撤回 → withdrawn（撤回比任何過期判斷都優先）
  const entry = catalog ? findEntry(catalog, item, locale) : undefined;
  if (entry && entry.lifecycle === 'withdrawn') {
    return { kind: 'withdrawn', reason: entry.reason, supersededBy: entry.supersededBy };
  }

  // 2. 離線／目錄缺失／目錄不認得／目錄過期／時鐘異常 → historical
  if (!online) return { kind: 'historical', reason: 'offline' };
  if (!catalog) return { kind: 'historical', reason: 'no_catalog' };
  if (!entry) return { kind: 'historical', reason: 'not_in_catalog' };
  if (entry.sha256 !== hash) return { kind: 'historical', reason: 'hash_mismatch' };
  if (t >= Date.parse(catalog.expiresAt)) return { kind: 'historical', reason: 'catalog_expired' };
  if (t < Date.parse(catalog.generatedAt)) return { kind: 'historical', reason: 'clock_skew' };

  // 3. 作者聲明的有效區間為 [validFrom, validUntil)；validUntil=null 仍受 reviewDueAt 約束
  const { validFrom, validUntil, reviewDueAt } = item.validity;
  if (t < Date.parse(validFrom)) return { kind: 'historical', reason: 'not_yet_valid' };
  if (validUntil !== null && t >= Date.parse(validUntil)) return { kind: 'historical', reason: 'validity_ended' };
  if (t >= Date.parse(reviewDueAt)) return { kind: 'historical', reason: 'review_overdue' };

  // 4. 以「可信目錄」的 lifecycle／verification 為準，不採信題目檔內的自我聲明
  if (entry.lifecycle === 'draft') return { kind: 'prototype', verification: entry.verification };
  if (entry.lifecycle === 'expired') return { kind: 'historical', reason: 'expired' };
  return { kind: 'eligible', verification: entry.verification };
}
