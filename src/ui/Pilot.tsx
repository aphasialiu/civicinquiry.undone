// 試答模式的畫面：作答後的選填回饋、試答紀錄頁。
import { useState } from 'react';
import type { Item } from '../core/types';
import { buildPilotReport } from '../pilot';
import { itemKey, useApp } from './AppContext';
import { download } from './notebook/common';

const letter = (i: number) => String.fromCharCode(65 + i);

export function PilotPanel({ item }: { item: Item }) {
  const app = useApp();
  const key = itemKey(item);
  const note = app.store.getPilot(key);
  return (
    <section className="panel pilot" aria-labelledby={`pilot-h-${item.id}`}>
      <h3 id={`pilot-h-${item.id}`}>試答回饋（選填，兩個問題）</h3>
      <fieldset className="field-group">
        <legend>哪些選項你覺得「根本不太可能有人會選」？</legend>
        {item.knowledge.options.map((o, i) => (
          <label key={o.id} className="inline-check">
            <input
              type="checkbox"
              checked={note.unlikely.includes(o.id)}
              onChange={(e) => app.store.setPilot(key, { unlikely: e.target.checked ? [...note.unlikely, o.id] : note.unlikely.filter((x) => x !== o.id) })}
            />
            <span>選項 {letter(i)}：{o.label.length > 28 ? `${o.label.slice(0, 28)}…` : o.label}</span>
          </label>
        ))}
        <p className="muted hint">每個選項都應該是真的會有人這樣想。如果你覺得哪一個很奇怪，請勾起來。</p>
      </fieldset>
      <div className="field">
        <label htmlFor={`pilot-c-${item.id}`}>情境或選項有哪裡看不懂、讓你卡住嗎？</label>
        <textarea id={`pilot-c-${item.id}`} rows={2} value={note.comment} onChange={(e) => app.store.setPilot(key, { comment: e.target.value })} />
      </div>
    </section>
  );
}

export function PilotReport() {
  const app = useApp();
  const [nick, setNick] = useState('');
  const [msg, setMsg] = useState('');
  if (app.load.phase !== 'ready') return null;
  const d = app.snapshot.data;
  const mine = d.attempts.filter((a) => a.runId === d.runId);
  const text = buildPilotReport(app.load.pkg, mine, app.store.allPilot(), nick, app.now());
  return (
    <div>
      <h1>試答紀錄</h1>
      <p className="notice">
        謝謝你幫忙試答！下面是你的紀錄（純文字）。<strong>只有你按「下載」或「複製」才會產生檔案，程式不會自動傳給任何人</strong>；
        要不要傳回給邀請你的人，由你決定。你可以先看一遍，不想給的內容可以自己刪掉再傳。
      </p>
      <div className="field">
        <label htmlFor="pilot-nick">你的暱稱（選填，不用真名）</label>
        <input id="pilot-nick" type="text" value={nick} onChange={(e) => setNick(e.target.value)} />
      </div>
      <pre className="report-preview" aria-label="試答紀錄預覽">{text}</pre>
      <div className="actions">
        <button type="button" className="btn" onClick={() => { download(text, `試答紀錄-${nick.trim() || '匿名'}.txt`, 'text/plain;charset=utf-8'); setMsg('已下載。'); }}>下載試答紀錄</button>
        <button type="button" className="btn btn-secondary" onClick={async () => { try { await navigator.clipboard.writeText(text); setMsg('已複製。'); } catch { setMsg('無法自動複製，請在上面的方框全選後複製。'); } }}>複製</button>
      </div>
      <p role="status">{msg}</p>
    </div>
  );
}
