// 搜尋代理核心：和 HTTP 框架無關，方便單元測試。
import type { SearchError, SearchItem, SearchRequest, SearchResponse } from '../src/search/contract';
import { MAX_BODY_BYTES, parseSearchRequest } from '../src/search/contract';
import { categoryOfType, curatedItems, queryFor, type Profile } from './profiles';
import { ProviderError, type RawResult, type SearchProvider } from './providers';
import { liveEnabled, type RightsPolicy } from './rights';
import type { Quota } from './quota';

export interface Deps {
  profiles: Map<string, Profile>;
  provider: SearchProvider;
  rights: RightsPolicy;
  quota: Quota;
  now: () => Date;
  /** 單一上游請求逾時（預設 5 秒）與整體回應時限（預設 8 秒） */
  upstreamTimeoutMs?: number;
  totalTimeoutMs?: number;
}

export interface HttpIn { method: string; contentType: string | undefined; body: string }
export interface HttpOut { status: number; body: SearchResponse | SearchError; retryAfter?: number }

const err = (status: number, code: SearchError['code'], message: string, canUseCurated: boolean, retryAfterSeconds: number | null = null): HttpOut => ({
  status, body: { code, message, retryAfterSeconds, canUseCurated }, ...(retryAfterSeconds ? { retryAfter: retryAfterSeconds } : {}),
});

/** 只移除明確的追蹤參數；其他參數可能影響文章身分，保留。 */
export function cleanUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k) || k.toLowerCase() === 'fbclid') u.searchParams.delete(k);
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

function dayOf(iso: string | null): string | null {
  return iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null;
}

function normalize(raw: RawResult[], deps: Deps): { items: SearchItem[]; dropped: number } {
  const seen = new Set<string>();
  const out: SearchItem[] = [];
  let dropped = 0;
  const retrievedAt = deps.now().toISOString();
  for (const r of raw) {
    const url = cleanUrl(r.url);
    if (!url || !r.title) { dropped++; continue; } // 不安全或殘缺的結果直接丟棄
    if (seen.has(url)) { dropped++; continue; } // URL 完全相同才去重；同標題不同網址保留
    seen.add(url);
    out.push({
      id: r.id, title: r.title, url, publisher: r.publisher || '未知來源',
      publishedAt: r.publishedAt, updatedAt: r.updatedAt ?? null,
      sourceType: r.sourceType, region: r.region ?? 'unknown', language: r.language ?? 'unknown',
      summary: r.summary, summaryOrigin: r.summary ? 'provider' : 'none',
      reviewStatus: 'unreviewed', linkStatus: 'unknown',
      provenance: { provider: deps.provider.name, originalId: r.id, retrievedAt, rightsPolicyId: deps.rights.id },
      isTestData: deps.provider.isTestData,
    });
  }
  return { items: out, dropped };
}

function applyFilters(items: SearchItem[], req: SearchRequest) {
  let noDate = 0, noLang = 0, outOfRange = 0, wrongLang = 0, wrongType = 0;
  const kept = items.filter((it) => {
    if (req.sourceTypes.length && !req.sourceTypes.includes(it.sourceType)) { wrongType++; return false; }
    if (it.language === 'unknown') { noLang++; return false; }
    if (it.language !== req.language) { wrongLang++; return false; }
    if (req.from || req.to) {
      const d = dayOf(it.publishedAt);
      if (!d) { noDate++; return false; }
      if ((req.from && d < req.from) || (req.to && d > req.to)) { outOfRange++; return false; }
    }
    return true;
  });
  const warnings: string[] = [];
  if (noLang) warnings.push(`有 ${noLang} 筆結果的語言未知，已排除，覆蓋範圍可能減少。`);
  if (wrongLang) warnings.push(`有 ${wrongLang} 筆結果語言不符，已排除（繁體與簡體中文不視為同一語言）。`);
  if (noDate) warnings.push(`限定日期時，有 ${noDate} 筆發布日期未知的結果已排除。`);
  if (outOfRange) warnings.push(`有 ${outOfRange} 筆結果不在所選日期範圍內。`);
  if (wrongType) warnings.push(`有 ${wrongType} 筆結果的來源類型不符。`);
  return { kept, warnings };
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await Promise.race([
      run(ac.signal),
      new Promise<never>((_, reject) => ac.signal.addEventListener('abort', () => reject(new ProviderError('timeout', '上游逾時')))),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function handleSearch(input: HttpIn, deps: Deps): Promise<HttpOut> {
  if (input.method !== 'POST') return err(405, 'BAD_REQUEST', '只接受 POST', false);
  if (!/^application\/json(\s*;|$)/i.test(input.contentType ?? '')) return err(400, 'BAD_REQUEST', 'Content-Type 必須是 application/json', false);
  if (Buffer.byteLength(input.body, 'utf8') > MAX_BODY_BYTES) return err(400, 'BAD_REQUEST', '請求超過 4 KiB', false);

  let json: unknown;
  try { json = JSON.parse(input.body); } catch { return err(400, 'BAD_REQUEST', '請求不是有效的 JSON', false); }
  const parsed = parseSearchRequest(json);
  if (!parsed.ok) return err(400, 'BAD_REQUEST', parsed.message, false);
  const req = parsed.value;

  const profile = deps.profiles.get(req.profileId);
  if (!profile) return err(404, 'NOT_FOUND', '找不到這個主題', false);
  if (!profile.categories.includes(req.category)) return err(400, 'BAD_REQUEST', '這個主題沒有登記這個類別', false);

  const now = deps.now();
  const fetchedAt = now.toISOString();

  // 預審清單（本地已有資料）：依類別與來源類型篩，永遠可用
  const curatedAll = curatedItems(profile, req.language, deps.rights.id, now).filter((c) => categoryOfType(c.sourceType) === req.category);
  const curated = curatedAll.filter((c) => !req.sourceTypes.length || req.sourceTypes.includes(c.sourceType));
  const coverage = { appliedFilters: ['category', 'language', 'sourceTypes', 'reviewFilter'], unsupportedFilters: [] as string[] };
  const base = { nextCursor: null, fetchedAt, coverage };

  // reviewed-only：只顯示本地已審資料，不把動態結果自動升級
  if (req.reviewFilter === 'reviewed') {
    const reviewed = curated.filter((c) => c.reviewStatus === 'reviewed');
    return { status: 200, body: { mode: 'curated', items: reviewed, partial: false, warnings: reviewed.length ? [] : ['目前沒有任何已通過專業審查的資料。'], ...base } };
  }

  const degrade = (why: string, retryAfterSeconds: number | null, code: SearchError['code'], status: number): HttpOut =>
    curated.length
      ? { status: 200, body: { mode: 'degraded', items: curated, partial: true, warnings: [why], ...base } }
      : err(status, code, why, false, retryAfterSeconds);

  if (!liveEnabled(deps.rights)) return degrade('即時搜尋尚未啟用（供應商的使用權限尚未確認），只顯示預審清單。', null, 'DISABLED', 503);

  const slot = deps.quota.reserve();
  if (!slot.ok) return degrade('今天或本月的即時搜尋額度已用完，只顯示預審清單。', slot.retryAfterSeconds, 'RATE_LIMITED', 429);

  if (req.from || req.to) coverage.appliedFilters.push(deps.provider.supports.date ? 'date' : 'date（代理後篩選，日期未知的結果會被排除）');
  const query = queryFor(profile, req.category);

  let raw: RawResult[];
  try {
    raw = await withTimeout(
      (signal) => deps.provider.search({ text: query, language: req.language, region: req.region, from: req.from, to: req.to, signal }),
      Math.min(deps.upstreamTimeoutMs ?? 5000, deps.totalTimeoutMs ?? 8000),
    );
  } catch (e) {
    if (e instanceof ProviderError && e.kind === 'rate_limited') return degrade('搜尋服務目前忙碌（被限流），請稍後再試。', e.retryAfterSeconds ?? 30, 'RATE_LIMITED', 429);
    if (e instanceof ProviderError && e.kind === 'timeout') return degrade('搜尋服務逾時，請稍後再試。', null, 'UPSTREAM_TIMEOUT', 504);
    return degrade('搜尋服務發生錯誤，請稍後再試。', null, 'UPSTREAM_FAILED', 502);
  }

  const norm = normalize(raw, deps);
  const { kept, warnings } = applyFilters(norm.items, req);
  if (norm.dropped) warnings.push(`已合併或略過 ${norm.dropped} 筆重複或無效的結果。`);
  if (deps.provider.isTestData) warnings.unshift('目前使用的是測試替身，下面的「即時結果」是假資料，不是真實新聞。');
  if (kept.length === 0) warnings.push('沒有符合條件的即時結果。');

  const items = [...curated, ...kept]; // 預審在前；動態結果保留供應商排序並標示未審查
  return { status: 200, body: { mode: curated.length && kept.length ? 'mixed' : kept.length ? 'live' : 'curated', items, partial: false, warnings, ...base } };
}
