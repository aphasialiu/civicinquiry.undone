// 供應商轉接介面。轉接器只收得到「查詢字串、語言、地區、日期」，
// 結構上拿不到 cookie、標頭、IP、答案（PR-03、PR-01）。
export interface ProviderQuery {
  text: string;
  language: string;
  region: string;
  from: string | null;
  to: string | null;
  signal: AbortSignal;
}

export interface RawResult {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: string | null;
  updatedAt?: string | null;
  sourceType: 'reporting' | 'official' | 'academic' | 'argument' | 'commentary' | 'unknown';
  language: string | null;
  region: string | null;
  summary: string | null;
}

export class ProviderError extends Error {
  constructor(public readonly kind: 'timeout' | 'rate_limited' | 'upstream', message: string, public readonly retryAfterSeconds: number | null = null) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface SearchProvider {
  /** 識別名稱，會出現在每筆結果的 provenance */
  readonly name: string;
  /** 測試替身為 true：結果在畫面上必須標示「測試資料」 */
  readonly isTestData: boolean;
  /** 供應商能保證的篩選；不能保證的由代理對有可信 metadata 的結果後篩選 */
  readonly supports: { date: boolean; language: boolean };
  search(q: ProviderQuery): Promise<RawResult[]>;
}

export type StubMode = 'ok' | 'timeout' | 'rate_limited' | 'upstream' | 'empty';

/**
 * 具名測試替身（ROADMAP §1）：沒有金鑰時使用。內容是明示的假資料，
 * 網址一律指向 example.com 的保留網域，不冒充任何真實新聞。
 */
export class TestStubProvider implements SearchProvider {
  readonly name = 'test-stub';
  readonly isTestData = true;
  readonly supports = { date: false, language: false };
  /** 測試用：記錄收到的查詢，檢查有沒有夾帶多餘資料 */
  readonly calls: ProviderQuery[] = [];

  constructor(private mode: StubMode = 'ok') {}

  setMode(m: StubMode) { this.mode = m; }

  async search(q: ProviderQuery): Promise<RawResult[]> {
    this.calls.push({ ...q });
    if (this.mode === 'timeout') {
      return new Promise((_, reject) => q.signal.addEventListener('abort', () => reject(new ProviderError('timeout', '上游逾時'))));
    }
    if (this.mode === 'rate_limited') throw new ProviderError('rate_limited', '上游限流', 30);
    if (this.mode === 'upstream') throw new ProviderError('upstream', '上游錯誤');
    if (this.mode === 'empty') return [];
    const slug = encodeURIComponent(q.text).slice(0, 24);
    const mk = (n: number, over: Partial<RawResult>): RawResult => ({
      id: `stub-${n}`,
      title: `【測試資料】第 ${n} 筆：${q.text}`,
      url: `https://example.com/test-stub/${n}/${slug}`,
      publisher: '測試替身',
      publishedAt: null,
      sourceType: 'reporting',
      language: 'zh-Hant',
      region: 'TW',
      summary: '這是測試替身產生的假資料，不是真實新聞。',
      ...over,
    });
    return [
      mk(1, { publishedAt: '2026-09-20', sourceType: 'reporting' }),
      mk(2, { publishedAt: '2026-03-01', sourceType: 'reporting' }),
      mk(3, { publishedAt: '2025-05-10', sourceType: 'official', publisher: '測試替身（官方）' }),
      mk(4, { publishedAt: null, sourceType: 'academic', summary: null }),
      // 與第 1 筆同一篇，只差追蹤參數：用來驗證去重
      mk(5, { id: 'stub-1b', url: `https://example.com/test-stub/1/${slug}?utm_source=x&fbclid=abc`, publishedAt: '2026-09-20' }),
      mk(6, { publishedAt: '2026-08-01', language: 'zh-Hans', title: '【測試資料】簡體中文結果' }),
      mk(7, { publishedAt: '2026-07-01', language: 'en', sourceType: 'commentary', title: '[TEST DATA] English commentary' }),
      mk(8, { publishedAt: '2026-06-01', language: null, title: '【測試資料】語言未知' }),
    ];
  }
}
