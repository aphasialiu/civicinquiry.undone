// Explorer：SearchRequest → SearchResponse（V0.2 只有預審閱讀清單，沒有動態搜尋）。
// 不變條件：這個目錄不得引用 src/session，也不得出現答案、信心、runId 等型別。
// 輸入只有「題目的公開主題設定」與讀者主動選的篩選條件。
import type { Item, Source, SourceType } from '../core/types';

export type ExplorerCategory = 'news' | 'argument' | 'comparison' | 'official' | 'academic';

export const CATEGORY_LABEL: Record<ExplorerCategory, string> = {
  news: '新聞案例',
  argument: '制度論證',
  comparison: '國際比較',
  official: '官方原始資料',
  academic: '學術專家',
};

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  law: '法規',
  judgment: '裁判／解釋',
  research: '研究',
  reporting: '新聞報導',
  commentary: '評論',
  official: '官方文件',
  other: '其他',
};

const CATEGORY_OF_TYPE: Record<SourceType, ExplorerCategory> = {
  law: 'official',
  judgment: 'official',
  official: 'official',
  research: 'academic',
  reporting: 'news',
  commentary: 'argument',
  other: 'comparison',
};

/** 與 POST /api/v1/search 契約同形的請求（V0.2 只在本機使用）。 */
export interface ExplorerRequest {
  profileId: string;
  category: ExplorerCategory | 'all';
  sourceTypes: SourceType[];
}

export interface ExplorerCard {
  id: string;
  title: string;
  publisher: string;
  sourceType: SourceType;
  category: ExplorerCategory;
  publishedAt: string | null;
  accessedAt: string;
  locator: string;
  url: string;
  /** 動態或自行引用的資料一律「未審查」；本版沒有任何已審查資料標章 */
  reviewStatus: 'unreviewed';
  linkStatus: 'unknown';
  /** 這份資料是支持答案的證據，還是延伸閱讀 */
  role: 'evidence' | 'reading' | 'both';
}

export interface ExplorerResponse {
  mode: 'curated';
  items: ExplorerCard[];
  /** 套用篩選後被排除的筆數（要明說，不能靜默） */
  excluded: number;
  fetchedAt: null;
  warnings: string[];
}

export function curatedCards(item: Item, sources: Source[]): ExplorerCard[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const ids = [...new Set([...item.readingIds, ...item.evidenceIds])];
  const cards: ExplorerCard[] = [];
  for (const id of ids) {
    const s = byId.get(id);
    if (!s) continue;
    const isEv = item.evidenceIds.includes(id);
    const isRd = item.readingIds.includes(id);
    cards.push({
      id: s.id, title: s.title, publisher: s.publisher, sourceType: s.type, category: CATEGORY_OF_TYPE[s.type],
      publishedAt: s.publishedAt, accessedAt: s.accessedAt, locator: s.locator, url: s.url,
      reviewStatus: 'unreviewed', linkStatus: 'unknown', role: isEv && isRd ? 'both' : isEv ? 'evidence' : 'reading',
    });
  }
  // 預審清單排序：延伸閱讀優先 → 官方原始 → 穩定 ID（不以媒體品牌或立場排序）
  return cards.sort((a, b) => {
    const r = (c: ExplorerCard) => (c.role === 'evidence' ? 1 : 0);
    return r(a) - r(b) || a.id.localeCompare(b.id);
  });
}

export function explore(item: Item, sources: Source[], req: ExplorerRequest): ExplorerResponse {
  const all = curatedCards(item, sources);
  const kept = all.filter((c) => (req.category === 'all' || c.category === req.category) && (req.sourceTypes.length === 0 || req.sourceTypes.includes(c.sourceType)));
  const warnings: string[] = [];
  if (kept.length === 0) {
    warnings.push('目前沒有符合條件的預審資料。V0.2 只提供編輯者放入題庫的來源，不提供即時新聞搜尋。');
  }
  return { mode: 'curated', items: kept, excluded: all.length - kept.length, fetchedAt: null, warnings };
}

/**
 * 顯式的「外部搜尋連結」降級方案（ADR-001）。只含題目公開的關鍵詞；
 * 讀者按下後會離開本站，搜尋服務會看到 IP 與查詢字詞。
 */
export function externalSearchUrl(keyword: string): string {
  return `https://duckduckgo.com/?q=${encodeURIComponent(keyword)}`;
}
