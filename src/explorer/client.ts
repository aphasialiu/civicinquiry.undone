// 搜尋代理的瀏覽器端呼叫。請求只含公開主題與讀者主動選的篩選條件；
// 這個模組拿不到作答、信心或 runId（隔離測試會檢查）。
import type { SearchError, SearchRequest, SearchResponse } from '../search/contract';

export type SearchOutcome =
  | { ok: true; res: SearchResponse }
  | { ok: false; error: SearchError | { code: 'NETWORK' | 'TIMEOUT'; message: string; retryAfterSeconds: null; canUseCurated: true } };

export const CLIENT_TIMEOUT_MS = 8000;

export async function searchLive(req: SearchRequest, fetcher: typeof fetch = (i, init) => fetch(i, init), timeoutMs = CLIENT_TIMEOUT_MS): Promise<SearchOutcome> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetcher('/api/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: ac.signal,
    });
    let body: unknown = null;
    try { body = await res.json(); } catch { /* 非 JSON 回應 */ }
    if (res.ok && body && typeof body === 'object' && 'items' in body) return { ok: true, res: body as SearchResponse };
    if (body && typeof body === 'object' && 'code' in body && 'message' in body) return { ok: false, error: body as SearchError };
    return { ok: false, error: { code: 'NETWORK', message: `搜尋服務回應異常（HTTP ${res.status}）`, retryAfterSeconds: null, canUseCurated: true } };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { ok: false, error: { code: 'TIMEOUT', message: '搜尋超過 8 秒沒有回應', retryAfterSeconds: null, canUseCurated: true } };
    }
    return { ok: false, error: { code: 'NETWORK', message: '無法連線到搜尋服務', retryAfterSeconds: null, canUseCurated: true } };
  } finally {
    clearTimeout(timer);
  }
}
