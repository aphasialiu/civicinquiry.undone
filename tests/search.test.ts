import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { QuizPackage } from '../src/core/types';
import { parseSearchRequest, type SearchError, type SearchRequest, type SearchResponse } from '../src/search/contract';
import { cleanUrl, handleSearch, type Deps } from '../server/handler';
import { buildProfiles } from '../server/profiles';
import { TestStubProvider, type StubMode } from '../server/providers';
import { Quota } from '../server/quota';
import { STUB_RIGHTS } from '../server/rights';

const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'content-src', 'constitution.quiz.json'), 'utf8')) as QuizPackage;

const req = (over: Partial<SearchRequest> = {}): SearchRequest => ({
  profileId: 'tw-budget', category: 'news', region: 'TW', language: 'zh-Hant',
  from: null, to: null, sourceTypes: [], reviewFilter: 'all', cursor: null, ...over,
});

function mk(mode: StubMode = 'ok', extra: Partial<Deps> = {}) {
  const provider = new TestStubProvider(mode);
  const deps: Deps = {
    profiles: buildProfiles([pkg]), provider, rights: STUB_RIGHTS,
    quota: new Quota({ perMinute: 100, perDay: 100, perMonth: 100 }), now: () => new Date('2026-10-18T00:00:00Z'),
    upstreamTimeoutMs: 50, totalTimeoutMs: 80, ...extra,
  };
  const call = (r: unknown, o: { method?: string; contentType?: string; raw?: string } = {}) =>
    handleSearch({ method: o.method ?? 'POST', contentType: o.contentType ?? 'application/json', body: o.raw ?? JSON.stringify(r) }, deps);
  return { provider, deps, call };
}
const ok = (o: { status: number; body: unknown }) => { expect(o.status).toBe(200); return o.body as SearchResponse; };

describe('請求驗證（拒絕多餘欄位）', () => {
  it('合法請求通過', () => expect(parseSearchRequest(req()).ok).toBe(true));
  for (const extra of ['answer', 'confidence', 'userId', 'sessionId', 'runId', 'url', 'freeText']) {
    it(`拒絕額外欄位 ${extra}`, () => {
      const r = parseSearchRequest({ ...req(), [extra]: 'x' });
      expect(r.ok).toBe(false);
    });
  }
  it('拒絕：日期起訖顛倒、不存在的日期、未登記類別、過多來源類型、過長 cursor', () => {
    expect(parseSearchRequest(req({ from: '2026-10-02', to: '2026-10-01' })).ok).toBe(false);
    expect(parseSearchRequest(req({ from: '2026-02-30' })).ok).toBe(false);
    expect(parseSearchRequest({ ...req(), category: 'gossip' }).ok).toBe(false);
    expect(parseSearchRequest({ ...req(), sourceTypes: ['reporting', 'official', 'academic', 'argument', 'commentary', 'unknown'] }).ok).toBe(false);
    expect(parseSearchRequest(req({ cursor: 'x'.repeat(513) })).ok).toBe(false);
  });
  it('允許起訖同一天（包含首尾）', () => expect(parseSearchRequest(req({ from: '2026-10-01', to: '2026-10-01' })).ok).toBe(true));
});

describe('HTTP 層：錯誤碼', () => {
  it('非 POST、錯 Content-Type、壞 JSON、超過 4 KiB → 4xx', async () => {
    const { call } = mk();
    expect((await call(req(), { method: 'GET' })).status).toBe(405);
    expect((await call(req(), { contentType: 'text/plain' })).status).toBe(400);
    expect((await call(null, { raw: '{oops' })).status).toBe(400);
    expect((await call(null, { raw: JSON.stringify({ ...req(), cursor: 'x'.repeat(5000) }) })).status).toBe(400);
  });
  it('主題不存在 → 404；主題沒登記的類別在驗證層就擋下', async () => {
    const { call } = mk();
    expect((await call(req({ profileId: 'no-such' }))).status).toBe(404);
  });
  it('錯誤本文有 code/message/retryAfterSeconds/canUseCurated，不含上游細節', async () => {
    const { call } = mk();
    const o = await call(req({ profileId: 'no-such' }));
    expect(Object.keys(o.body).sort()).toEqual(['canUseCurated', 'code', 'message', 'retryAfterSeconds']);
  });
});

describe('AT-08 降級：測驗不中斷，永遠有可操作的結果', () => {
  // official 類別有預審資料，news 類別沒有，兩種情況都要測
  for (const mode of ['timeout', 'rate_limited', 'upstream'] as StubMode[]) {
    it(`上游 ${mode} + 有預審資料 → 200 degraded，附警告`, async () => {
      const { call } = mk(mode);
      const b = ok(await call(req({ category: 'official' })));
      expect(b.mode).toBe('degraded');
      expect(b.partial).toBe(true);
      expect(b.items.length).toBeGreaterThan(0);
      expect(b.items.every((i) => i.provenance.provider === 'curated')).toBe(true);
      expect(b.warnings.length).toBeGreaterThan(0);
    });
    it(`上游 ${mode} + 沒有預審資料 → 明確的錯誤碼（${{ timeout: 504, rate_limited: 429, upstream: 502 }[mode as 'timeout']}）`, async () => {
      const { call } = mk(mode);
      const o = await call(req({ category: 'news' }));
      expect(o.status).toBe({ timeout: 504, rate_limited: 429, upstream: 502 }[mode as 'timeout']);
      expect((o.body as SearchError).canUseCurated).toBe(false);
    });
  }
  it('逾時在設定時限內回應（不會卡到上游自己結束）', async () => {
    const { call } = mk('timeout');
    const t0 = Date.now();
    await call(req({ category: 'official' }));
    expect(Date.now() - t0).toBeLessThan(500);
  });
  it('沒有結果 → 明確的空狀態警告，不是假資料', async () => {
    const { call } = mk('empty');
    const b = ok(await call(req()));
    expect(b.items).toEqual([]);
    expect(b.warnings.join()).toContain('沒有符合條件');
  });
  it('權利未確認（displayAllowed=false）→ 不呼叫供應商，只給預審清單', async () => {
    const { call, provider } = mk('ok', { rights: { ...STUB_RIGHTS, displayAllowed: false } });
    const b = ok(await call(req({ category: 'official' })));
    expect(b.mode).toBe('degraded');
    expect(provider.calls).toHaveLength(0);
    expect((await call(req({ category: 'news' }))).status).toBe(503);
  });
  it('預算用完 → 降級並帶 retryAfterSeconds，不再呼叫供應商', async () => {
    const { call, provider } = mk('ok', { quota: new Quota({ perMinute: 100, perDay: 1, perMonth: 100 }) });
    ok(await call(req()));
    const o = await call(req({ category: 'news' }));
    expect(o.status).toBe(429);
    expect((o.body as SearchError).retryAfterSeconds).toBeGreaterThan(0);
    expect(provider.calls).toHaveLength(1);
  });
});

describe('配額：最後一個額度不會被兩個並發請求超用', () => {
  it('perMinute=1，同時兩個請求 → 只有一個打到供應商', async () => {
    const { call, provider } = mk('ok', { quota: new Quota({ perMinute: 1, perDay: 100, perMonth: 100 }) });
    const [a, b] = await Promise.all([call(req({ category: 'official' })), call(req({ category: 'official' }))]);
    expect(provider.calls).toHaveLength(1);
    const modes = [ok(a).mode, ok(b).mode].sort();
    expect(modes).toEqual(['degraded', 'mixed']);
  });
  it('用量到 80% 會標記警示；跨月重置', () => {
    let t = Date.parse('2026-10-31T23:59:00Z');
    const q = new Quota({ perMinute: 1000, perDay: 1000, perMonth: 5 }, () => t);
    for (let i = 0; i < 4; i++) expect(q.reserve().ok).toBe(true);
    expect(q.warned).toBe(true);
    expect(q.reserve().ok).toBe(true);
    expect(q.reserve().ok).toBe(false);
    t = Date.parse('2026-11-01T00:01:00Z');
    expect(q.reserve().ok).toBe(true);
    expect(q.warned).toBe(false);
  });
});

describe('正規化、篩選與標示', () => {
  it('只移除 utm_*／fbclid；其他參數保留；非 http(s) 丟棄', () => {
    expect(cleanUrl('https://a.example/p?id=7&utm_source=x&fbclid=1#top')).toBe('https://a.example/p?id=7');
    expect(cleanUrl('javascript:alert(1)')).toBeNull();
    expect(cleanUrl('data:text/html,hi')).toBeNull();
  });
  it('同一篇只差追蹤參數 → 去重；結果都標示未審查與測試資料', async () => {
    const { call } = mk();
    const b = ok(await call(req()));
    expect(b.items.filter((i) => i.url.includes('/test-stub/1/'))).toHaveLength(1);
    expect(b.items.every((i) => i.reviewStatus === 'unreviewed')).toBe(true);
    expect(b.items.every((i) => i.isTestData)).toBe(true);
    expect(b.items.every((i) => i.title.includes('測試資料') || i.title.includes('TEST DATA'))).toBe(true);
    expect(b.warnings[0]).toContain('測試替身');
  });
  it('語言：zh-Hans 不被當成 zh-Hant；語言未知的排除並說明', async () => {
    const { call } = mk();
    const b = ok(await call(req()));
    expect(b.items.some((i) => i.language === 'zh-Hans')).toBe(false);
    expect(b.items.some((i) => i.language === 'unknown')).toBe(false);
    expect(b.warnings.join()).toContain('簡體');
    expect(b.warnings.join()).toContain('語言未知');
    const en = ok(await call(req({ language: 'en' })));
    expect(en.items.every((i) => i.language === 'en')).toBe(true);
  });
  it('日期：限定時排除日期未知與範圍外，並說明；包含首尾兩日；不限日期時日期未知的會出現', async () => {
    const { call } = mk();
    const all = ok(await call(req())).items.filter((i) => !i.provenance.originalId.startsWith('curated'));
    expect(all.some((i) => i.publishedAt === null)).toBe(true);
    const b = ok(await call(req({ from: '2026-03-01', to: '2026-09-20' })));
    const live = b.items.filter((i) => i.provenance.provider === 'test-stub');
    expect(live.map((i) => i.publishedAt).sort()).toEqual(['2026-03-01', '2026-09-20']);
    expect(b.warnings.join()).toContain('日期未知');
    expect(b.coverage.appliedFilters.join()).toContain('後篩選');
  });
  it('reviewed-only：不呼叫供應商、沒有動態結果；沒有已審資料就明說', async () => {
    const { call, provider } = mk();
    const b = ok(await call(req({ reviewFilter: 'reviewed' })));
    expect(b.items).toEqual([]);
    expect(b.warnings.join()).toContain('已通過專業審查');
    expect(provider.calls).toHaveLength(0);
  });
  it('預審資料在前、依來源類型篩選；不依媒體品牌排序', async () => {
    const { call } = mk();
    const b = ok(await call(req({ category: 'official' })));
    expect(b.items[0].provenance.provider).toBe('curated');
    const only = ok(await call(req({ category: 'official', sourceTypes: ['academic'] })));
    expect(only.items.filter((i) => i.provenance.provider === 'curated')).toEqual([]);
  });
});

describe('PR-01／PR-03：供應商收不到作答或識別資料', () => {
  it('不同的「作答」不會改變送往供應商的查詢（請求本身根本不能攜帶作答）', async () => {
    const { call, provider } = mk();
    for (let i = 0; i < 3; i++) ok(await call(req()));
    expect(provider.calls).toHaveLength(3);
    const strip = ({ signal, ...rest }: (typeof provider.calls)[number]) => { void signal; return JSON.stringify(rest); };
    expect(new Set(provider.calls.map(strip)).size).toBe(1);
    expect(Object.keys(provider.calls[0]).sort()).toEqual(['from', 'language', 'region', 'signal', 'text', 'to']);
  });
  it('查詢字串由伺服器的公開主題目錄決定；國際比較用英文關鍵詞', async () => {
    const { call, provider } = mk();
    await call(req({ category: 'news' }));
    await call(req({ category: 'comparison' }));
    expect(provider.calls[0].text).toBe('中央政府總預算 項目移動 釋字391');
    expect(provider.calls[1].text).toBe('parliament budget amendment powers');
  });
});
