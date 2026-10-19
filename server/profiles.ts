// 公開主題目錄：由題庫內容建立（profileId → 關鍵詞、預審來源）。瀏覽器只傳 profileId，
// 不提交題目原文，也不能指定查詢字串。
import type { QuizPackage, Source } from '../src/core/types';
import type { SearchCategory, SearchItem, SearchSourceType } from '../src/search/contract';

export interface Profile {
  id: string;
  keywords: string[];
  categories: SearchCategory[];
  region: string;
  language: string;
  curatedSources: Source[];
}

export function buildProfiles(pkgs: QuizPackage[]): Map<string, Profile> {
  const map = new Map<string, Profile>();
  for (const pkg of pkgs) {
    const byId = new Map(pkg.sources.map((s) => [s.id, s]));
    for (const item of pkg.items) {
      const ids = [...new Set([...item.readingIds, ...item.evidenceIds])];
      map.set(item.search.profileId, {
        id: item.search.profileId,
        keywords: item.search.keywords,
        categories: item.search.categories,
        region: item.search.region,
        language: item.search.language,
        curatedSources: ids.map((id) => byId.get(id)).filter((s): s is Source => !!s),
      });
    }
  }
  return map;
}

const TYPE_MAP: Record<Source['type'], SearchSourceType> = {
  law: 'official', judgment: 'official', official: 'official', research: 'academic',
  reporting: 'reporting', commentary: 'commentary', other: 'unknown',
};
const CATEGORY_OF: Record<SearchSourceType, SearchCategory> = {
  official: 'official', academic: 'academic', reporting: 'news', argument: 'argument', commentary: 'argument', unknown: 'comparison',
};
export const categoryOfType = (t: SearchSourceType): SearchCategory => CATEGORY_OF[t];

export function curatedItems(profile: Profile, language: string, rightsPolicyId: string, now: Date): SearchItem[] {
  return profile.curatedSources.map((s) => ({
    id: `curated-${s.id}`,
    title: s.title,
    url: s.url,
    publisher: s.publisher,
    publishedAt: s.publishedAt,
    updatedAt: null,
    sourceType: TYPE_MAP[s.type],
    region: profile.region,
    language,
    summary: s.locator,
    summaryOrigin: 'editor',
    reviewStatus: 'unreviewed',
    linkStatus: 'unknown',
    provenance: { provider: 'curated', originalId: s.id, retrievedAt: now.toISOString(), rightsPolicyId },
    isTestData: false,
  }));
}

const NON_ASCII = /[^\u0000-\u007f]/;

/** 依類別建立查詢字串：國際比較用英文關鍵詞，其他用中文關鍵詞。不使用任何作答資料。 */
export function queryFor(profile: Profile, category: SearchCategory): string {
  const ascii = profile.keywords.filter((k) => !NON_ASCII.test(k));
  const cjk = profile.keywords.filter((k) => NON_ASCII.test(k));
  const pool = category === 'comparison' ? (ascii.length ? ascii : profile.keywords) : (cjk.length ? cjk : profile.keywords);
  return pool[0];
}
