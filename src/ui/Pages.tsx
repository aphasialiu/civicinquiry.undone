import { useState } from 'react';
import { summarize, type ScorableAttempt } from '../core/assessment';
import { eligibilityLabel, fmtDate, fmtDateTime } from './format';
import { RETENTION_DAYS } from '../session/persistence';
import { itemKey, useApp } from './AppContext';
import { OtherQuizzes, TranslationInfo } from './Multi';
import { isPilot } from '../pilot';

export function Intro() {
  const app = useApp();
  if (app.load.phase !== 'ready') return null;
  const { pkg, entry } = app.load;
  const attempts = app.snapshot.data.attempts.filter((a) => a.runId === app.snapshot.data.runId);
  const seen = new Set(attempts.map((a) => `${a.itemId}@${a.itemVersion}`));

  // 隨機一題：優先挑還沒看過的
  const random = () => {
    const unseen = pkg.items.map((_, i) => i).filter((i) => !seen.has(`${pkg.items[i].id}@${pkg.items[i].version}`));
    const pool = unseen.length ? unseen : pkg.items.map((_, i) => i);
    window.location.hash = app.quizHref(pool[Math.floor(Math.random() * pool.length)] + 1);
  };

  return (
    <div>
      <h1>{pkg.title}</h1>
      {isPilot() && (
        <div className="notice" role="note">
          <p><strong>這是試答版，謝謝你幫忙！</strong></p>
          <ol>
            <li>請<strong>照你的第一直覺</strong>作答，不用查資料，也不用怕選錯。</li>
            <li>每題答完，下面有兩個選填的小問題，請順手回答。</li>
            <li>做完想做的題數後，到上方的「<a href="#/pilot">試答紀錄</a>」，按下載，再傳給邀請你的人。</li>
          </ol>
        </div>
      )}
      <p className="lead">下面每一題，都有一句<strong>聽起來很有道理</strong>的話。你覺得呢？挑一題試試看，再看看憲政規則怎麼說。</p>
      <div className="actions">
        <button type="button" className="btn" onClick={random}>隨機一題</button>
        <a className="btn btn-secondary" href={app.quizHref(1)} onClick={() => void app.refreshStatus()}>{attempts.length ? '繼續作答' : '開始'}</a>
      </div>

      <h2>挑一題來試試</h2>
      <p className="muted">不需要登入。你的答案只留在這個分頁，不會上傳。每一題都可以先看再決定要不要作答。</p>
      <ol className="toc gallery">
        {pkg.items.map((it, i) => {
          const el = app.eligibilityOf(it);
          const done = seen.has(`${it.id}@${it.version}`);
          return (
            <li key={itemKey(it)} className="gallery-card">
              <a href={app.quizHref(i + 1)}>{it.topic}</a>
              <p className="teaser">「{it.intuition.prompt}」</p>
              <p className="muted">{done ? '已看過・' : ''}{eligibilityLabel(el)}</p>
            </li>
          );
        })}
      </ol>

      <TranslationInfo pkg={pkg} />
      <OtherQuizzes />

      <h2>版本與來源</h2>
      <dl className="facts">
        <dt>題庫</dt><dd>{pkg.namespace}/{pkg.quizId}，內容版本 {pkg.version}（{pkg.locale}），共 {entry.itemCount || pkg.items.length} 題</dd>
        <dt>授權</dt><dd>{pkg.license === 'UNLICENSED' ? '尚未確認授權（UNLICENSED）' : pkg.license}</dd>
        <dt>作者</dt><dd>{pkg.authors.map((a) => `${a.displayName}（${a.credentialText}）`).join('、')}</dd>
        {app.preview ? (
          <><dt>來源</dt><dd>分享連結、單一檔案或作者預覽；內容沒有經過審查，也沒有即時狀態確認。</dd></>
        ) : (
          <>
            <dt>狀態目錄</dt>
            <dd>
              {app.status
                ? `產生於 ${fmtDateTime(app.status.generatedAt)}，有效至 ${fmtDateTime(app.status.expiresAt)}`
                : '讀不到狀態目錄；所有題目暫時只能當歷史閱讀'}
            </dd>
            <dt>網路</dt><dd>{app.online ? '線上' : '離線（只能歷史閱讀）'}</dd>
          </>
        )}
      </dl>
      <p className="muted">法源經初步比對，查閱日 {fmtDate(pkg.sources[0]?.accessedAt ?? null)}。全國法規資料庫的整編截止日可能早於查閱日，正式使用前需由專業人員補查。</p>
    </div>
  );
}

export function Review() {
  const app = useApp();
  if (app.load.phase !== 'ready') return null;
  const { pkg } = app.load;
  const data = app.snapshot.data;
  const mine = data.attempts.filter((a) => a.runId === data.runId);
  const scorable: ScorableAttempt[] = data.attempts.map((a) => ({
    isFirstRun: a.runIndex === 0,
    eligibility: a.eligibility,
    answerState: a.answerState,
    result: a.result,
  }));
  const formal = summarize(scorable, 'eligible', pkg.items.length);
  const proto = summarize(scorable, 'prototype', pkg.items.length);
  const firstRunNote = data.runIndex > 0 ? '分數只計首次練習；重新練習的作答不會混進去。' : '';

  return (
    <div>
      <h1>回顧</h1>
      <p><a href="#/mine">看我的盲點</a>：和憲政規定不一樣、或我不確定的地方，可以記筆記、整理成觀念卡。</p>
      <p className="muted">這裡不排名，也不和別人比較。你可以挑想重看的題目。{firstRunNote}</p>

      <section aria-labelledby="score-h" className="panel">
        <h2 id="score-h">答題摘要</h2>
        <p>
          正式計分：{formal.denominator === 0 ? '尚無可計分題' : `${formal.correct} / ${formal.denominator}（另有 ${formal.excluded} 題未納入：未作答、不知道、略過、反思或不能計分）`}
        </p>
        <p>
          教育原型題（依原型判準，不是正式計分）：
          {proto.denominator === 0 ? '尚無已作答的原型題' : `${proto.correct} / ${proto.denominator}（另有 ${proto.excluded} 題未納入）`}
        </p>
        <p className="muted">這些數字只代表你這次在這些題上的回答，不代表你的能力或政治傾向。</p>
      </section>

      <h2>逐題回看</h2>
      <ul className="review-list">
        {pkg.items.map((it, i) => {
          const a = mine.find((x) => x.itemId === it.id && x.itemVersion === it.version);
          let state = '尚未看過';
          if (a) {
            if (a.result === 'correct') state = '和憲政規定一致';
            else if (a.result === 'incorrect') state = '和憲政規定不一樣';
            else if (a.result === 'unscored') state = '反思題（不計分）';
            else if (a.result === 'ineligible') state = '歷史閱讀（不計分）';
            else if (a.answerState === 'unknown') state = '不知道';
            else state = '略過';
          }
          return (
            <li key={itemKey(it)}>
              <a href={app.quizHref(i + 1)}>{it.topic}</a>
              <span className="muted">　{state}</span>
            </li>
          );
        })}
      </ul>

      <div className="actions">
        <ResetRun />
      </div>
    </div>
  );
}

function ResetRun() {
  const app = useApp();
  const [done, setDone] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => { app.store.startNewRun(); setDone(true); window.location.hash = app.quizHref(1); }}
      >
        重新練習（另起一輪，不覆蓋首次答案）
      </button>
      <span role="status" className="visually-hidden">{done ? '已開始新的練習。' : ''}</span>
    </>
  );
}

export function Privacy() {
  const app = useApp();
  const { persisted, savedAt, persistFailed } = app.snapshot;
  const [msg, setMsg] = useState('');

  return (
    <div>
      <h1>隱私與本機資料</h1>
      <ul>
        <li>不需要帳號。你的答案、信心和筆記預設<strong>只存在這個分頁的記憶體</strong>，關掉分頁就沒有了。</li>
        <li>它們不會出現在網址、不會送到伺服器、也不會被拿去搜尋。</li>
        <li>本站不使用分析工具、廣告、遠端字型或社群嵌入。載入頁面時，提供網站的主機仍然看得到你的 IP 位址，所以不能說完全匿名。</li>
        <li>你按下外部連結後，對方網站會看到你，並依它自己的政策運作。</li>
      </ul>

      <section aria-labelledby="save-h" className="panel">
        <h2 id="save-h">只儲存在這台裝置</h2>
        <p>
          選了之後，進度和筆記會存進這個瀏覽器（IndexedDB），下次打開可以接續。儲存 {RETENTION_DAYS} 天後，會在下次開啟時自動刪除；之後再改答案也不會延長期限。
        </p>
        <p className="notice warn">如果這是共用的電腦，別人可能看到你儲存的內容。用完請按下面的「清除」。</p>
        <p>目前狀態：{persisted ? `已儲存（自 ${savedAt ? fmtDateTime(savedAt) : ''} 起算）` : '沒有儲存（只在記憶體）'}</p>
        {persistFailed && <p className="notice warn">這台裝置無法儲存（可能是無痕模式或空間不足）。目前改用記憶體模式，作答不受影響。</p>}
        <div className="actions">
          {!persisted ? (
            <button type="button" className="btn" onClick={async () => { const ok = await app.store.enablePersistence(app.now()); setMsg(ok ? '已開始儲存在這台裝置。' : '無法儲存，已改用記憶體模式。'); }}>
              儲存在這台裝置
            </button>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={async () => { await app.store.disablePersistence(); setMsg('已停止儲存，並刪除裝置上的資料。'); }}>
              停止儲存
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={async () => { await app.store.clearAll(); setMsg('已清除所有進度與筆記。'); }}>
            清除所有進度與筆記
          </button>
        </div>
        <p role="status">{msg}</p>
      </section>

      <p className="muted">本版不做任何研究資料蒐集。若未來要做學習成效研究，會另外說明目的、欄位、儲存期間，並取得你的同意後才會啟用。</p>
    </div>
  );
}
