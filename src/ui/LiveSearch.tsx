// 即時搜尋面板：讀者按下按鈕才送出（不隨打字逐字送出），失敗時預審清單仍可用。
import { useId, useState } from 'react';
import { searchLive, type SearchOutcome } from '../explorer/client';
import { CATEGORY_LABEL, type ExplorerCategory } from '../explorer/curated';
import { SOURCE_TYPES, type SearchCategory, type SearchItem, type SearchRequest, type SearchSourceType } from '../search/contract';
import type { Item } from '../core/types';
import { fmtDate, fmtDateTime } from './format';

const SEARCH_TYPE_LABEL: Record<SearchSourceType, string> = {
  reporting: '新聞報導', official: '官方', academic: '學術', argument: '論證', commentary: '評論', unknown: '未知',
};
const MODE_LABEL = { curated: '預審清單', live: '即時結果', mixed: '預審＋即時', degraded: '降級：只有預審清單' } as const;

function isoDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function LiveSearch({ item, category }: { item: Item; category: ExplorerCategory | 'all' }) {
  const id = useId();
  const [language, setLanguage] = useState(item.search.language);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [types, setTypes] = useState<SearchSourceType[]>([]);
  const [reviewedOnly, setReviewedOnly] = useState(false);
  const [sort, setSort] = useState<'provider' | 'date'>('provider');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);

  const effectiveCategory: SearchCategory = category === 'all' ? item.search.categories[0] : category;

  async function run() {
    setBusy(true);
    const req: SearchRequest = {
      profileId: item.search.profileId,
      category: effectiveCategory,
      region: item.search.region,
      language,
      from: from || null,
      to: to || null,
      sourceTypes: types,
      reviewFilter: reviewedOnly ? 'reviewed' : 'all',
      cursor: null,
    };
    setOutcome(await searchLive(req));
    setBusy(false);
  }

  const items: SearchItem[] = outcome?.ok ? [...outcome.res.items] : [];
  if (sort === 'date') items.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  const badRange = !!from && !!to && from > to;

  return (
    <section aria-labelledby={`${id}-h`} className="panel">
      <h3 id={`${id}-h`}>搜尋最新資料</h3>
      <p className="muted">
        按下「搜尋」才會送出。送出的只有這一題公開的主題代號和你選的篩選條件，<strong>不含</strong>你的答案、信心或筆記。
        搜尋失敗時，上面的預審清單仍然可以用。
      </p>
      <p className="muted">目前搜尋使用的是{'「測試替身」'}：結果是明示的假資料，不是真實新聞，只用來確認功能與降級行為。</p>

      <div className="filters">
        <label>
          語言
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="zh-Hant">繁體中文</option>
            <option value="zh-Hans">簡體中文</option>
            <option value="en">English</option>
          </select>
        </label>
        <div className="date-row">
          <label>發布日期：從<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>到<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-secondary" onClick={() => { const d = new Date(); const y = new Date(d); y.setFullYear(d.getFullYear() - 1); setFrom(isoDay(y)); setTo(isoDay(d)); }}>最近一年</button>
          <button type="button" className="btn btn-ghost" onClick={() => { setFrom(''); setTo(''); }}>不限日期</button>
        </div>
        {badRange && <p role="alert" className="notice warn">起始日期不能晚於結束日期。</p>}
        <fieldset>
          <legend>來源類型</legend>
          {SOURCE_TYPES.map((t) => (
            <label key={t} className="inline-check">
              <input type="checkbox" checked={types.includes(t)} onChange={(e) => setTypes(e.target.checked ? [...types, t] : types.filter((x) => x !== t))} />
              {SEARCH_TYPE_LABEL[t]}
            </label>
          ))}
        </fieldset>
        <label className="inline-check">
          <input type="checkbox" checked={reviewedOnly} onChange={(e) => setReviewedOnly(e.target.checked)} />
          只看已通過審查的資料
        </label>
        <p className="muted">類別：{category === 'all' ? `${CATEGORY_LABEL[effectiveCategory]}（上方選「全部類別」時，預設用第一個類別）` : CATEGORY_LABEL[effectiveCategory]}</p>
      </div>

      <div className="actions">
        <button type="button" className="btn" disabled={busy || badRange} onClick={() => void run()}>{busy ? '搜尋中…' : outcome ? '重新搜尋' : '搜尋'}</button>
        {outcome?.ok && (
          <label className="inline-check">
            排序
            <select value={sort} onChange={(e) => setSort(e.target.value as 'provider' | 'date')}>
              <option value="provider">供應商排序</option>
              <option value="date">日期（新到舊）</option>
            </select>
          </label>
        )}
      </div>

      <div role="status" aria-live="polite" data-testid="live-status">
        {busy && '搜尋中…'}
        {!busy && outcome?.ok && `${MODE_LABEL[outcome.res.mode]}：共 ${outcome.res.items.length} 筆`}
        {!busy && outcome && !outcome.ok && `搜尋沒有成功：${outcome.error.message}`}
      </div>
      {!busy && outcome && !outcome.ok && (
        <p className="notice warn">
          {outcome.error.retryAfterSeconds ? `請約 ${outcome.error.retryAfterSeconds} 秒後再試。` : '可以再按一次「重新搜尋」。'}
          你的作答不受影響，也可以繼續看上面的預審清單或直接進入下一題。
        </p>
      )}
      {outcome?.ok && outcome.res.warnings.map((w) => <p key={w} className="notice">{w}</p>)}

      <ul className="cards" aria-label="搜尋結果">
        {items.map((it) => (
          <li key={`${it.provenance.provider}-${it.id}-${it.url}`} className="card">
            <h4>{it.title}</h4>
            <p className="meta">
              {it.isTestData && <span className="chip">測試資料</span>}
              <span className="chip">{SEARCH_TYPE_LABEL[it.sourceType]}</span>
              <span className="chip">{it.reviewStatus === 'reviewed' ? '已審查' : '未審查'}</span>
              <span className="chip">{it.provenance.provider === 'curated' ? '編輯預審' : '即時結果'}</span>
            </p>
            <p>{it.publisher}｜發布：{fmtDate(it.publishedAt)}｜語言：{it.language}</p>
            {it.summary && <p>{it.summary}<span className="muted">（{it.summaryOrigin === 'editor' ? '編輯自寫' : '供應商片段'}）</span></p>}
            <p className="muted">取得時間：{fmtDateTime(it.provenance.retrievedAt)}｜連結狀態：{it.linkStatus === 'unknown' ? '尚未檢查' : it.linkStatus}</p>
            <p>
              <a href={it.url} target="_blank" rel="noopener noreferrer">開啟原始連結<span className="visually-hidden">：{it.title}（另開新視窗，離開本站）</span></a>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
