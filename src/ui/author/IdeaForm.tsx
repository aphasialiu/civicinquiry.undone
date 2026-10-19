// 「我有一條法條或觀念，想變成題目」：先從內建的官方條文找素材（不需要任何 AI），再回答幾個問題，系統起一個題目骨架。
// 判斷的地方（情境、選項、正解）都留給作者。
import { useId, useMemo, useState } from 'react';
import { CORPUS_FETCHED_AT, LAWS, questionsUsing, relatedRulings, searchCorpus, type Article } from '../../authoring/corpus';
import { MATERIAL_KINDS, PATTERNS, type ExtraSource, type IdeaInput } from '../../authoring/ideas';
import type { QuizPackage } from '../../core/types';

const EMPTY: IdeaInput = { kind: 'statute', material: '', sourceTitle: '', sourceUrl: '', sourceLocator: '', jurisdiction: 'TW', rule: '', firstReaction: '', patternId: PATTERNS[0].id, extra: [] };

export function IdeaForm({ onSubmit, submitLabel, pkg }: { onSubmit: (idea: IdeaInput) => void; submitLabel: string; pkg?: QuizPackage }) {
  const id = useId();
  const [v, setV] = useState<IdeaInput>(EMPTY);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Article | null>(null);
  const [rulingIds, setRulingIds] = useState<string[]>([]);
  const set = (patch: Partial<IdeaInput>) => setV({ ...v, ...patch });
  const pattern = PATTERNS.find((p) => p.id === v.patternId)!;
  const ready = v.rule.trim() && v.firstReaction.trim() && v.sourceTitle.trim();
  const hits = useMemo(() => searchCorpus(query), [query]);
  const rulings = picked ? relatedRulings(picked) : [];
  const used = picked && pkg ? questionsUsing(pkg, picked) : [];

  function pick(a: Article) {
    setPicked(a);
    setRulingIds([]);
    setV({ ...v, kind: 'statute', sourceTitle: `${a.law}${a.label}`, sourceUrl: a.url, sourceLocator: a.label, material: a.text, jurisdiction: 'TW', extra: [] });
  }
  function toggleRuling(r: { id: string }, on: boolean) {
    const ids = on ? [...rulingIds, r.id] : rulingIds.filter((x) => x !== r.id);
    setRulingIds(ids);
    const extra: ExtraSource[] = relatedRulings(picked!).filter((x) => ids.includes(x.id)).map((x) => ({ title: x.title, url: x.url, locator: x.note, publisher: x.publisher, type: 'judgment' }));
    setV({ ...v, extra });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(v); setV(EMPTY); setPicked(null); setQuery(''); setRulingIds([]); }}>
      <p className="muted">
        好的題目，是讓人「第一眼覺得合理，卻和憲政體制的規定相反」。從你手上的素材出發，回答幾個問題，系統會幫你起一個題目的骨架；
        需要判斷的地方（情境、選項、正解）都會留給你。
      </p>

      <section className="panel" aria-labelledby={`${id}-find`}>
        <h3 id={`${id}-find`}>1. 找素材：查官方條文</h3>
        <p className="muted hint">
          內建 {LAWS.map((l) => `${l.name}（${l.count} 條）`).join('、')}，原文取自全國法規資料庫（{CORPUS_FETCHED_AT} 查閱，一律以官方網站為準）。
          輸入<strong>條號</strong>（例如 23、增修 2）或<strong>關鍵字</strong>（例如 預算、解散、緊急命令），不需要網路也能查。
        </p>
        <div className="field">
          <label htmlFor={`${id}-q`}>輸入條號或關鍵字</label>
          <input id={`${id}-q`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {query.trim() && hits.length === 0 && <p className="notice">內建的條文裡沒有找到。可以改個關鍵字，或到下面「找不到？自己貼資料」。</p>}
        <ul className="plain-list" aria-label="查到的條文">
          {hits.map((a) => (
            <li key={`${a.pcode}-${a.no}`} className="panel">
              <p><strong>{a.law}　{a.label}</strong></p>
              <p className="plain muted">{a.text.length > 160 ? `${a.text.slice(0, 160)}…` : a.text}</p>
              <button type="button" className="btn btn-secondary" onClick={() => pick(a)}>用這條出題<span className="visually-hidden">：{a.law}{a.label}</span></button>
            </li>
          ))}
        </ul>

        {picked && (
          <div role="status" className="notice">
            <p>已帶入：<strong>{picked.law}{picked.label}</strong>。下面的素材內容、來源網址、定位都已經填好，可以修改。</p>
            {used.length > 0 && <p>這條已經有 {used.length} 題用到：{used.map((u) => `「${u.topic}」`).join('、')}。可以先看看，避免重複。</p>}
            {rulings.length > 0 && (
              <fieldset className="field-group">
                <legend>相關的裁判（勾選會一併加進這題的來源）</legend>
                {rulings.map((r) => (
                  <label key={r.id} className="inline-check">
                    <input type="checkbox" checked={rulingIds.includes(r.id)} onChange={(e) => toggleRuling(r, e.target.checked)} />
                    {r.title}：{r.note}
                  </label>
                ))}
              </fieldset>
            )}
          </div>
        )}
      </section>

      <details open className="panel">
        <summary>{picked ? '素材內容（可修改）' : '找不到？自己貼資料'}</summary>
        <div className="field">
          <label htmlFor={`${id}-kind`}>素材是什麼？</label>
          <select id={`${id}-kind`} value={v.kind} onChange={(e) => set({ kind: e.target.value })}>
            {MATERIAL_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-mat`}>條文原文或觀念重點（會顯示在答案頁的「依據」）</label>
          <textarea id={`${id}-mat`} rows={4} value={v.material} onChange={(e) => set({ material: e.target.value })} />
        </div>
        <div className="field"><label htmlFor={`${id}-st`}>素材名稱（例如「憲法第23條」）</label><input id={`${id}-st`} type="text" value={v.sourceTitle} onChange={(e) => set({ sourceTitle: e.target.value })} /></div>
        <div className="field"><label htmlFor={`${id}-su`}>原始來源網址（選填，之後可以補）</label><input id={`${id}-su`} type="url" value={v.sourceUrl} onChange={(e) => set({ sourceUrl: e.target.value })} /></div>
        <div className="field"><label htmlFor={`${id}-sl`}>定位（條號、段落、頁碼）</label><input id={`${id}-sl`} type="text" value={v.sourceLocator} onChange={(e) => set({ sourceLocator: e.target.value })} /></div>
        <div className="field"><label htmlFor={`${id}-j`}>適用的法域或領域</label><input id={`${id}-j`} type="text" value={v.jurisdiction} onChange={(e) => set({ jurisdiction: e.target.value })} /></div>
      </details>

      <div className="field">
        <label htmlFor={`${id}-rule`}>2. 用一句話寫出：憲政體制（或這條規定）真正的答案是什麼？</label>
        <textarea id={`${id}-rule`} rows={2} value={v.rule} onChange={(e) => set({ rule: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-fr`}>3. 大多數人第一反應會怎麼想？</label>
        <p className="muted hint">寫成一句「聽起來很有道理」的話，例如：「只要是為了公共利益，政府怎麼限制都可以。」它會顯示在首頁的題目卡片上。</p>
        <textarea id={`${id}-fr`} rows={2} value={v.firstReaction} onChange={(e) => set({ firstReaction: e.target.value })} />
      </div>

      <fieldset className="field-group">
        <legend>4. 這個直覺比較像哪一種常見的誤區？</legend>
        {PATTERNS.map((p) => (
          <label key={p.id} className="choice">
            <input type="radio" name={`${id}-pat`} checked={v.patternId === p.id} onChange={() => set({ patternId: p.id })} />
            <span><strong>{p.name}</strong>　<span className="muted">{p.gist}</span></span>
          </label>
        ))}
        {pattern.contextHint && <p className="notice">這一型的題目通常是這樣的結構：<br />情境：{pattern.contextHint}<br />問題：{pattern.question}<br />誘人但不對的選項：「{pattern.wrongOption}」</p>}
      </fieldset>

      <button type="submit" className="btn" disabled={!ready}>{submitLabel}</button>
      {!ready && <p className="muted">請先填：素材名稱（可從上面查條文帶入）、規則的一句話、第一反應。</p>}
    </form>
  );
}
