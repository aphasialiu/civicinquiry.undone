// 作答流程：直覺 → 知識 → 信心 → 揭曉。揭曉前可回上一步修改；揭曉後原答鎖定。
import { useRef, useState } from 'react';
import { judge, type AnswerState } from '../core/assessment';
import type { Item, QuizPackage } from '../core/types';
import type { Attempt, EligibilityKind } from '../session/attempt';
import { useApp, itemKey } from './AppContext';
import { isPilot } from '../pilot';
import { Explanation } from './Explanation';

export function QuizPage({ index }: { index: number }) {
  const app = useApp();
  if (app.load.phase !== 'ready') return null;
  const { pkg } = app.load;
  const item = pkg.items[index - 1];
  if (!item) return <p>找不到這一題。<a href="#/">回題庫介紹</a></p>;
  return <ItemFlow key={`${itemKey(item)}-${app.snapshot.data.runId}`} item={item} pkg={pkg} index={index} total={pkg.items.length} />;
}

function ItemFlow({ item, pkg, index, total }: { item: Item; pkg: QuizPackage; index: number; total: number }) {
  const app = useApp();
  const [selected, setSelected] = useState<string[]>([]);
  const [justRevealed, setJustRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const revealing = useRef(false);
  const shownAt = useRef(Date.now());

  const eligibility = app.eligibilityOf(item);
  const attempt = app.store.getAttempt(item.id, item.version) ?? null;
  const data = app.snapshot.data; // 訂閱 store，讓揭曉後重繪
  void data;

  if (eligibility.kind === 'withdrawn') {
    return (
      <article>
        <p className="progress">第 {index} 題／共 {total} 題</p>
        <h2>這一題已撤回</h2>
        <p className="notice warn">維護者已將這一題撤回，不再當作現行題目。</p>
        <p>撤回理由：{eligibility.reason ?? '（維護者沒有提供理由）'}</p>
        {eligibility.supersededBy && <p>已有新版本：{eligibility.supersededBy}</p>}
        <Nav index={index} total={total} />
      </article>
    );
  }

  // 揭曉後（或回到已作答的題）：只讀顯示，不能覆寫首次答案
  if (attempt) {
    return <Explanation item={item} pkg={pkg} attempt={attempt} eligibility={eligibility} index={index} total={total} justRevealed={justRevealed} />;
  }

  // 歷史閱讀：不進入作答，直接看說明（不計分）
  if (eligibility.kind === 'historical') {
    return <Explanation item={item} pkg={pkg} attempt={null} eligibility={eligibility} index={index} total={total} justRevealed={false} />;
  }

  const isReflection = item.knowledge.type === 'reflection';
  const multiple = item.knowledge.type === 'multiple';

  async function reveal(answerState: AnswerState, viewedBefore: boolean) {
    if (revealing.current) return; // 雙擊提交冪等
    revealing.current = true;
    setBusy(true);
    const fresh = await app.refreshStatus(); // 揭曉前重新確認狀態
    const el = app.eligibilityOf(item, fresh);
    const kind: EligibilityKind = el.kind;
    const scorable = el.kind === 'eligible' || el.kind === 'prototype';
    const chosen = answerState === 'answered' ? selected : [];
    const a: Attempt = {
      runId: app.snapshot.data.runId,
      runIndex: app.snapshot.data.runIndex,
      itemId: item.id,
      itemVersion: item.version,
      locale: item.language,
      intuitionOptionId: null,
      answerState,
      selectedOptionIds: chosen,
      confidence: null,
      viewedExplanationBeforeAnswer: viewedBefore,
      result: scorable ? judge(item, answerState, chosen) : 'ineligible',
      eligibility: kind,
    };
    app.store.commitAttempt(a);
    if (isPilot()) app.store.setPilot(itemKey(item), { seconds: Math.max(1, Math.round((Date.now() - shownAt.current) / 1000)) });
    setJustRevealed(true);
    setBusy(false);
  }

  // 一頁就讀完：標題 → 情境 → 問題與選項。不先問立場，也不問把握程度。
  return (
    <article aria-labelledby="stage-h">
      <p className="progress">第 {index} 題／共 {total} 題</p>
      <h2 id="stage-h">{item.topic}</h2>

      <section aria-labelledby="ctx-h" className="scenario">
        <h3 id="ctx-h">情境</h3>
        <p>{item.context}</p>
      </section>

      <form onSubmit={(e) => { e.preventDefault(); void reveal('answered', false); }}>
        <fieldset>
          <legend className="prompt">{item.knowledge.prompt}{multiple ? '（可複選）' : ''}</legend>
          {isReflection && <p className="muted">這題沒有標準答案，選一個你覺得最合理的說法就好。</p>}
          {item.knowledge.options.map((o) => (
            <label key={o.id} className="choice">
              <input
                type={multiple ? 'checkbox' : 'radio'}
                name="knowledge"
                value={o.id}
                checked={selected.includes(o.id)}
                onChange={(e) => {
                  if (multiple) setSelected(e.target.checked ? [...selected, o.id] : selected.filter((x) => x !== o.id));
                  else setSelected([o.id]);
                }}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </fieldset>
        {isReflection && (
          <>
            <label htmlFor="reflect-note">我的想法（選填，只留在這個分頁，不會上傳）</label>
            <textarea id="reflect-note" rows={3} value={app.snapshot.data.notes[item.id] ?? ''} onChange={(e) => app.store.setNote(item.id, e.target.value)} />
          </>
        )}
        <div className="actions">
          <button type="submit" className="btn" disabled={busy || selected.length === 0}>{isReflection ? '確認我的想法' : '確認答案'}</button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void reveal('unknown', false)}>我不知道</button>
        </div>
      </form>
      {(
        <p className="muted">
          想直接看答案？
          <button type="button" className="linklike" disabled={busy} onClick={() => void reveal('skipped', true)}>直接看解釋</button>
          （這題就不算作答）
        </p>
      )}
    </article>
  );
}

function Nav({ index, total }: { index: number; total: number }) {
  const app = useApp();
  return (
    <nav className="actions" aria-label="換題">
      {index > 1 && <a className="btn btn-secondary" href={app.quizHref(index - 1)}>上一題</a>}
      {index < total ? <a className="btn" href={app.quizHref(index + 1)}>下一題</a> : <a className="btn" href={app.endHref}>看回顧</a>}
    </nav>
  );
}
