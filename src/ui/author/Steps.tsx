import { useId, useState } from 'react';
import type { Item } from '../../core/types';
import { addItem, addSource, moveAt, removeAt, removeSource } from '../../authoring/draft';
import { seedItemFromIdea } from '../../authoring/ideas';
import { IdeaForm } from './IdeaForm';
import { DateField, SelectField, SourceChecks, StringList, TextField, errorsAt, useDraft } from './fields';

const LOCALES: Array<[string, string]> = [['zh-Hant-TW', '繁體中文（臺灣）'], ['en', 'English'], ['ja', '日本語'], ['zh-Hans-CN', '簡體中文']];

export function InfoStep() {
  const d = useDraft();
  return (
    <div>
      <h2>題庫資訊</h2>
      <TextField path={['title']} label="題庫名稱" hint="例如「日常物理的反直覺題」" />
      <TextField path={['description']} label="題庫介紹" multiline hint="給讀者看的簡短說明，也請寫明這份題庫的適用範圍與限制。" />
      <SelectField path={['locale']} label="題庫語言" options={LOCALES} />
      <TextField path={['authors', 0, 'displayName']} label="作者名稱" />
      <TextField path={['authors', 0, 'credentialText']} label="作者資歷說明（自述）" hint="這是你自己寫的說明，不等於平台認證；有學位也不代表每一題都正確。" />
      <TextField path={['license']} label="內容授權" hint="還沒確定就維持 UNLICENSED。這不能替你引用的來源授權。" />
      <details>
        <summary>進階：識別碼與版本</summary>
        <TextField path={['namespace']} label="命名空間" hint="小寫英數、點、連字號，例如 sci.demo。公開站會指派唯一的命名空間。" />
        <TextField path={['quizId']} label="題庫代號" hint="小寫英數與連字號，例如 physics。" />
        <TextField path={['version']} label="內容版本" hint="三段數字，例如 0.1.0。修改已發布的內容時，請用「版本與修訂」步驟，不要手動改。" />
      </details>
      <p className="muted">共 {d.pkg.items.length} 題、{d.pkg.sources.length} 個來源。</p>
    </div>
  );
}

const SOURCE_TYPES: Array<[string, string]> = [['law', '法規'], ['judgment', '裁判／解釋'], ['research', '研究'], ['official', '官方文件'], ['reporting', '新聞報導'], ['commentary', '評論'], ['other', '其他']];
const RIGHTS: Array<[string, string]> = [['link_only', '只放連結'], ['permission', '已取得許可'], ['open_license', '開放授權'], ['unknown', '不確定']];

export function SourcesStep({ now }: { now: Date }) {
  const d = useDraft();
  return (
    <div>
      <h2>來源</h2>
      <p className="muted">每個支持正解的來源都要寫清楚「定位」（條號、段落、頁碼或章節），不能只寫網站首頁。</p>
      {d.pkg.sources.map((s, i) => (
        <section key={i} className="panel" aria-label={`來源 ${i + 1}：${s.title || s.id}`}>
          <h3>來源 {i + 1}</h3>
          <TextField path={['sources', i, 'title']} label="標題" />
          <TextField path={['sources', i, 'url']} label="網址" type="url" hint="只能用 http 或 https。" />
          <SelectField path={['sources', i, 'type']} label="性質" options={SOURCE_TYPES} />
          <TextField path={['sources', i, 'publisher']} label="發布單位" />
          <TextField path={['sources', i, 'locator']} label="定位（條號／段落／頁碼）" multiline />
          <DateField path={['sources', i, 'publishedAt']} label="發布日期（不確定就留空）" mode="date" nullable />
          <DateField path={['sources', i, 'accessedAt']} label="查閱日期" mode="date" />
          <SelectField path={['sources', i, 'rights']} label="使用權利" options={RIGHTS} hint="我們只連結，不重製全文。" />
          <TextField path={['sources', i, 'id']} label="來源代號" hint="小寫英數與連字號；題目會用它引用這個來源。" />
          <button type="button" className="btn btn-ghost" onClick={() => d.update((p) => removeSource(p, i))}>刪除這個來源<span className="visually-hidden">（{s.title || s.id}）</span></button>
        </section>
      ))}
      <button type="button" className="btn" onClick={() => d.update((p) => addSource(p, now))}>新增來源</button>
    </div>
  );
}

function nextOptionId(used: string[]): string {
  for (const c of 'abcdefgh') if (!used.includes(c)) return c;
  return `o${used.length + 1}`;
}

function KnowledgeEditor({ i }: { i: number }) {
  const d = useDraft();
  const item = d.pkg.items[i];
  const k = item.knowledge;
  const base = ['items', i, 'knowledge'] as const;
  const setType = (t: string) => {
    if (t === 'reflection') d.set(base, { ...k, type: t, correctOptionIds: [] });
    else if (k.options.length < 2) d.set(base, { ...k, type: t, options: [{ id: 'a', label: '' }, { id: 'b', label: '' }, { id: 'c', label: '' }], correctOptionIds: [] });
    else d.set(base, { ...k, type: t, correctOptionIds: t === 'single' ? k.correctOptionIds.slice(0, 1) : k.correctOptionIds });
  };
  const multiple = k.type === 'multiple';
  return (
    <fieldset className="field-group">
      <legend>第二階段：知識題</legend>
      <div className="field">
        <label htmlFor={`kt-${i}`}>題型</label>
        <select id={`kt-${i}`} value={k.type} onChange={(e) => setType(e.target.value)}>
          <option value="single">單選（有一個正解）</option>
          <option value="multiple">多選（全部選對才算對）</option>
          <option value="reflection">反思（沒有標準答案，不計分）</option>
        </select>
        <p className="muted hint">若這個問題有合理的爭議、沒有明確的事實判準，請選「反思」，或把它拆成可以檢驗的命題。</p>
      </div>
      <TextField path={[...base, 'prompt']} label={k.type === 'reflection' ? '反思問題' : '問題'} multiline hint="直接問「依憲政體制，這樣做符合規定嗎／會怎樣」。選項要寫成真的會有人這樣想的說法，其中一個是憲政體制實際的規定。" />
      {(
        <fieldset className="field-group">
          <legend>{k.type === 'reflection' ? '選項（沒有標準答案，不用勾正解；每個選項都要是真的會有人這樣想的說法）' : '選項（勾選憲政體制的答案；每個選項都要聽起來合理，包含錯的）'}</legend>
          {k.options.map((o, oi) => {
            const correct = k.correctOptionIds.includes(o.id);
            return (
              <div key={o.id} className="row">
                {k.type !== 'reflection' && <input
                  type={multiple ? 'checkbox' : 'radio'} name={`correct-${i}`} checked={correct}
                  aria-label={`選項 ${o.id} 是正確答案`}
                  onChange={(e) => d.set([...base, 'correctOptionIds'], multiple ? (e.target.checked ? [...k.correctOptionIds, o.id] : k.correctOptionIds.filter((x) => x !== o.id)) : [o.id])}
                />}
                <input type="text" value={o.label} aria-label={`選項 ${o.id} 的文字`} aria-invalid={errorsAt(d.errors, [...base, 'options', oi, 'label']).length > 0 || undefined} onChange={(e) => d.set([...base, 'options', oi, 'label'], e.target.value)} />
                <button type="button" className="btn btn-ghost" disabled={k.options.length <= 2} onClick={() => d.set(base, { ...k, options: removeAt(k.options, oi), correctOptionIds: k.correctOptionIds.filter((x) => x !== o.id) })}>
                  移除<span className="visually-hidden">選項 {o.id}</span>
                </button>
              </div>
            );
          })}
          <button type="button" className="btn btn-secondary" disabled={k.options.length >= 8} onClick={() => d.set([...base, 'options'], [...k.options, { id: nextOptionId(k.options.map((o) => o.id)), label: '' }])}>新增選項</button>
          {[...errorsAt(d.errors, [...base, 'correctOptionIds'], true), ...errorsAt(d.errors, [...base, 'options'])].map((e, n) => <p key={n} className="field-error" role="alert">{e.message}</p>)}
          <p className="muted hint">建議讓正確答案的位置不要總是同一個，也不要讓每題的答案都是「否」。</p>
        </fieldset>
      )}
      <TextField path={[...base, 'rationale']} label="依據說明" multiline hint="一句話說明正解的依據，例如「憲法第70條」。" />
    </fieldset>
  );
}

export function ItemEditor({ i, now }: { i: number; now: Date }) {
  void now;
  const d = useDraft();
  const it = d.pkg.items[i];
  const base = ['items', i] as const;
  return (
    <div>
      <h3>第 {i + 1} 題：{it.topic || '（還沒有主題）'}</h3>
      <details className="panel">
        <summary>出題前自我檢查（10 件事）</summary>
        <ol>
          <li>這個概念值得學嗎？不是冷門細節。</li>
          <li>情境讀得懂嗎？一般人不用先學專有名詞。</li>
          <li>決定性的條件，都寫在情境裡了嗎？（不要藏到解釋才揭曉）</li>
          <li>選項彼此分得開嗎？不會出現兩個都說得通的選項。</li>
          <li>正解找得到依據嗎？有條號、段落、頁碼。</li>
          <li>有把「你希望如何」（價值）和「現在的規則是什麼」（事實）分開嗎？</li>
          <li>有誠實寫出爭議與限制嗎？</li>
          <li>解釋能讓人換個情境也會判斷嗎？不只是公布答案。</li>
          <li>寫了適用的時間與範圍嗎？</li>
          <li>讀起來沒有羞辱人、也沒有暗示該支持哪一邊嗎？</li>
        </ol>
      </details>
      <fieldset className="field-group">
        <legend>基本資料</legend>
        <TextField path={[...base, 'topic']} label="主題" hint="標題不要洩漏結論。" />
        <TextField path={[...base, 'jurisdiction']} label="適用範圍（法域或領域）" hint="例如 TW、global。" />
        <TextField path={[...base, 'id']} label="題目代號" hint="小寫英數與連字號。" />
      </fieldset>
      <fieldset className="field-group">
        <legend>情境與「聽起來很有道理的話」</legend>
        <TextField path={[...base, 'context']} label="情境" multiline hint="寫成一個具體的事件：誰、做了什麼、發生什麼事。這一頁要讓人不用看別的就讀得懂；決定性的條件都寫在這裡。" />
        <TextField path={[...base, 'intuition', 'prompt']} label="聽起來很有道理的話" multiline hint="大多數人第一眼會同意的那句話，會顯示在首頁的題目卡片上，不會洩漏答案。" />
      </fieldset>
      <KnowledgeEditor i={i} />
      <fieldset className="field-group">
        <legend>解釋</legend>
        <TextField path={[...base, 'explanation', 'short']} label="核心解釋（以「答案：」開頭）" multiline hint="先用一兩句寫出憲政體制的答案，再說核心差異。依據的條文由「證據」欄位顯示。" />
        <TextField path={[...base, 'explanation', 'misconception']} label="為什麼直覺會出問題" multiline hint="先承認這個想法為什麼聽起來合理，再說明照這個想法做，會傷害民主制度的什麼（例如：出問題時找不到人負責、少數人的權利被拿走、規則變得不可預期）。" />
        <TextField path={[...base, 'explanation', 'mechanism']} label="機制：為什麼是這樣" multiline />
        <TextField path={[...base, 'explanation', 'possibleReasons']} label="可能的理由" multiline />
        <TextField path={[...base, 'explanation', 'alternatives']} label="不同的選擇（替代方案）" multiline />
        <TextField path={[...base, 'explanation', 'limitations']} label="爭議與限制：這題沒有回答什麼" multiline />
        <SelectField path={[...base, 'epistemic']} label="這個結論的確定程度" options={[['settled', '明確'], ['disputed', '制度或理由有爭議'], ['uncertain', '不確定']]} />
        <SelectField path={[...base, 'disputeScope']} label="爭議涉及的範圍" options={[['none', '沒有爭議'], ['rationale', '只涉及理由'], ['answer', '涉及答案本身（只能用反思題）']]} />
      </fieldset>
      <fieldset className="field-group">
        <legend>證據與延伸閱讀</legend>
        <SourceChecks path={[...base, 'evidenceIds']} label="支持答案的原始證據" hint="至少一個法規、裁判、研究或官方文件。" />
        <SourceChecks path={[...base, 'readingIds']} label="延伸閱讀" />
        <StringList path={[...base, 'discussionPrompts']} label="討論引導問題" addLabel="新增問題" max={5} hint="例如：哪個主張可以查證？哪個是在談理想？" />
      </fieldset>
      <fieldset className="field-group">
        <legend>探索設定（公開主題，不含答案）</legend>
        <TextField path={[...base, 'search', 'profileId']} label="主題代號" hint="小寫英數與連字號。" />
        <StringList path={[...base, 'search', 'keywords']} label="搜尋關鍵詞" addLabel="新增關鍵詞" hint="國際比較可加英文關鍵詞。" />
      </fieldset>
      <fieldset className="field-group">
        <legend>有效期間</legend>
        <DateField path={[...base, 'validity', 'asOf']} label="這個結論依據的時間點" mode="date" />
        <DateField path={[...base, 'validity', 'validFrom']} label="開始適用" mode="datetime" />
        <DateField path={[...base, 'validity', 'validUntil']} label="結束適用（沒有就留空）" mode="datetime" nullable hint="留空不代表永遠有效，仍然要在覆核日之前重新檢查。" />
        <DateField path={[...base, 'validity', 'reviewDueAt']} label="下次覆核日期" mode="datetime" hint="一般 180 天內；法律或醫學這類變動快的內容請更短。" />
        <TextField path={[...base, 'validity', 'knowledgeVersion']} label="知識版本說明" hint="例如「憲法第70條；2026-10-17 查閱」。" />
      </fieldset>
    </div>
  );
}

export function ItemsStep({ now, selected, onSelect }: { now: Date; selected: number; onSelect: (n: number) => void }) {
  const d = useDraft();
  const id = useId();
  const [confirmDel, setConfirmDel] = useState(false);
  const i = Math.min(selected, d.pkg.items.length - 1);
  return (
    <div>
      <h2>題目</h2>
      <nav aria-label="題目清單">
        <ol className="item-tabs">
          {d.pkg.items.map((it: Item, n) => {
            const bad = d.errors.some((e) => e.path.startsWith(`/items/${n}/`) || e.path === `/items/${n}`);
            return (
              <li key={it.id + n}>
                <button type="button" className="btn btn-secondary" aria-current={n === i ? 'true' : undefined} onClick={() => { setConfirmDel(false); onSelect(n); }}>
                  {n + 1}. {it.topic || '（未命名）'}{bad ? '　⚠ 待補' : ''}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="actions">
        <button type="button" className="btn" disabled={d.pkg.items.length >= 500} onClick={() => { d.update((p) => addItem(p, now)); onSelect(d.pkg.items.length); }}>新增一題</button>
        <button type="button" className="btn btn-ghost" disabled={i === 0} onClick={() => { d.update((p) => ({ ...p, items: moveAt(p.items, i, -1) })); onSelect(i - 1); }}>上移</button>
        <button type="button" className="btn btn-ghost" disabled={i >= d.pkg.items.length - 1} onClick={() => { d.update((p) => ({ ...p, items: moveAt(p.items, i, 1) })); onSelect(i + 1); }}>下移</button>
        {!confirmDel ? (
          <button type="button" className="btn btn-ghost" disabled={d.pkg.items.length <= 1} onClick={() => setConfirmDel(true)}>刪除這題</button>
        ) : (
          <button type="button" className="btn btn-secondary" id={`${id}-del`} onClick={() => { d.update((p) => ({ ...p, items: removeAt(p.items, i) })); setConfirmDel(false); onSelect(Math.max(0, i - 1)); }}>確定刪除第 {i + 1} 題</button>
        )}
      </div>
      <details className="panel">
        <summary>從法條或觀念產生新題</summary>
        <IdeaForm pkg={d.pkg} submitLabel="產生題目骨架並加到題庫" onSubmit={(idea) => { const r = seedItemFromIdea(d.pkg, idea, now); d.update(() => r.pkg); onSelect(r.index); }} />
      </details>
      <ItemEditor key={i} i={i} now={now} />
    </div>
  );
}
