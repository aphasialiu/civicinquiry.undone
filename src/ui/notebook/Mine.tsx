import { notebookStore } from '../../notebook/store';
import { useApp } from '../AppContext';
import { collectBlindSpots, useNotebook } from './common';

export function Mine() {
  const app = useApp();
  const nb = useNotebook();
  if (app.load.phase !== 'ready') return <p role="status">載入中…</p>;
  const { pkg } = app.load;
  const d = app.snapshot.data;
  const spots = collectBlindSpots(pkg, d.attempts, d.runId);
  const mismatch = spots.filter((s) => s.kind === 'mismatch');
  const unknown = spots.filter((s) => s.kind === 'unknown');

  const Row = ({ s }: { s: (typeof spots)[number] }) => {
    const note = nb.notes.find((n) => n.itemId === s.item.id && n.itemVersion === s.item.version);
    return (
      <li className="panel">
        <h3>{s.item.topic}</h3>
        <p className="meta">
          <span className="chip">{s.kind === 'mismatch' ? '和憲政規定不一樣' : s.attempt.answerState === 'unknown' ? '我不知道' : '略過'}</span>
          {note?.status === 'clear' && <span className="chip">已弄懂</span>}
        </p>
        {s.kind === 'mismatch' && <p>我選了：{s.myChoices.join('；')}</p>}
        <p>憲政規定的答案：{s.basis.join('；')}</p>
        <p className="muted">{s.item.explanation.short}</p>
        <p><a href={app.quizHref(s.n)}>回去看完整解釋與原始資料<span className="visually-hidden">：{s.item.topic}</span></a></p>
        <div className="field">
          <label htmlFor={`st-${s.item.id}`}>我弄懂了嗎？</label>
          <select id={`st-${s.item.id}`} value={note?.status ?? 'open'} onChange={(e) => notebookStore.setNote(s.item.id, s.item.version, { status: e.target.value as 'open' | 'clear' }, app.now())}>
            <option value="open">還沒弄懂</option>
            <option value="clear">已經弄懂</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`nt-${s.item.id}`}>我的筆記</label>
          <textarea id={`nt-${s.item.id}`} rows={3} value={note?.note ?? ''} onChange={(e) => notebookStore.setNote(s.item.id, s.item.version, { note: e.target.value }, app.now())} />
        </div>
      </li>
    );
  };

  return (
    <div>
      <h1>我的盲點</h1>
      <p className="notice">
        這裡整理的是：你的選擇和憲政規定<strong>不一樣</strong>，或你還不確定的地方。這<strong>不代表你「錯了」</strong>——
        有可能是題目問的條件和你想的不同。目的是幫你找到「值得再看一眼」的觀念。
      </p>
      <p className="muted">
        這一頁的內容來自你這一次的作答，預設只在這個分頁的記憶體裡。你寫的筆記會存在這台裝置上，關閉分頁後仍在。
      </p>

      {spots.length === 0 && (
        <p>{d.attempts.length === 0 ? '你還沒有作答。' : '目前沒有發現盲點：你作答的題目都和判準一致。'} <a href={app.quizHref(1)}>{d.attempts.length === 0 ? '開始作答' : '再看看其他題'}</a></p>
      )}

      {mismatch.length > 0 && (
        <section aria-labelledby="mm-h">
          <h2 id="mm-h">和憲政規定不一樣（{mismatch.length}）</h2>
          <ul className="plain-list">{mismatch.map((s) => <Row key={s.item.id} s={s} />)}</ul>
        </section>
      )}
      {unknown.length > 0 && (
        <section aria-labelledby="uk-h">
          <h2 id="uk-h">我不知道／略過（{unknown.length}）</h2>
          <ul className="plain-list">{unknown.map((s) => <Row key={s.item.id} s={s} />)}</ul>
        </section>
      )}

    </div>
  );
}
