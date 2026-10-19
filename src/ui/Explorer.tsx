// 探索區：題內入口，不依答案改變內容（Explorer 模組本身也拿不到答案）。
import { useId, useState } from 'react';
import type { Item, QuizPackage, SourceType } from '../core/types';
import { CATEGORY_LABEL, SOURCE_TYPE_LABEL, explore, externalSearchUrl, type ExplorerCategory } from '../explorer/curated';
import { fmtDate } from './format';
import { LiveSearch } from './LiveSearch';

// 靜態部署（沒有搜尋代理）時以 VITE_SEARCH_ENABLED=false 建置：不顯示一定會失敗的搜尋面板（SPEC §6）。
const SEARCH_ENABLED = import.meta.env.VITE_SEARCH_ENABLED !== 'false';

export function Explorer({ item, pkg }: { item: Item; pkg: QuizPackage }) {
  const catId = useId();
  const [category, setCategory] = useState<ExplorerCategory | 'all'>('all');
  const [types, setTypes] = useState<SourceType[]>([]);
  const res = explore(item, pkg.sources, { profileId: item.search.profileId, category, sourceTypes: types });
  const typeChoices = [...new Set(pkg.sources.filter((s) => item.readingIds.includes(s.id) || item.evidenceIds.includes(s.id)).map((s) => s.type))];

  return (
    <section aria-labelledby={`${catId}-h`} className="panel">
      <h3 id={`${catId}-h`}>探索：自己查原始資料</h3>
      <p className="muted">
        這裡先列出編輯者放進題庫的來源，目前都標示為「未審查」。下方可以另外搜尋較新的資料。這裡的內容不會因為你的答案而改變。
      </p>

      <div className="filters" role="group" aria-label="篩選條件">
        <label>
          資料類別
          <select value={category} onChange={(e) => setCategory(e.target.value as ExplorerCategory | 'all')}>
            <option value="all">全部類別</option>
            {item.search.categories.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </label>
        <fieldset>
          <legend>來源性質</legend>
          {typeChoices.map((t) => (
            <label key={t} className="inline-check">
              <input
                type="checkbox"
                checked={types.includes(t)}
                onChange={(e) => setTypes(e.target.checked ? [...types, t] : types.filter((x) => x !== t))}
              />
              {SOURCE_TYPE_LABEL[t]}
            </label>
          ))}
        </fieldset>
      </div>

      <div aria-live="polite" className="muted">
        共 {res.items.length} 筆{res.excluded > 0 ? `（依篩選排除 ${res.excluded} 筆）` : ''}
      </div>
      {res.warnings.map((w) => <p key={w} className="notice">{w}</p>)}

      <ul className="cards">
        {res.items.map((c) => (
          <li key={c.id} className="card">
            <h4>{c.title}</h4>
            <p className="meta">
              <span className="chip">{SOURCE_TYPE_LABEL[c.sourceType]}</span>
              <span className="chip">{CATEGORY_LABEL[c.category]}</span>
              <span className="chip">未審查</span>
              <span className="chip">{c.role === 'reading' ? '延伸閱讀' : c.role === 'evidence' ? '支持答案的證據' : '證據兼延伸閱讀'}</span>
            </p>
            <p>{c.publisher}｜發布日期：{fmtDate(c.publishedAt)}｜查閱日：{fmtDate(c.accessedAt)}</p>
            <p>定位：{c.locator}</p>
            <p>
              <a href={c.url} target="_blank" rel="noopener noreferrer">
                開啟原始資料<span className="visually-hidden">：{c.title}（另開新視窗，離開本站）</span>
              </a>
              <span className="muted">　連結狀態：尚未檢查</span>
            </p>
          </li>
        ))}
      </ul>

      {SEARCH_ENABLED && <LiveSearch item={item} category={category} />}

      <details>
        <summary>想看更多？用關鍵詞自己搜尋（會離開本站）</summary>
        <p className="notice">
          按下連結後會前往外部搜尋服務，對方會看到你的 IP 位址與搜尋字詞。本站<strong>不會</strong>附上你的作答、信心或筆記。搜尋結果不是本站審查過的資料。
        </p>
        <ul>
          {item.search.keywords.map((k) => (
            <li key={k}>
              <a href={externalSearchUrl(k)} target="_blank" rel="noopener noreferrer">
                {k}<span className="visually-hidden">（另開新視窗，離開本站）</span>
              </a>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
