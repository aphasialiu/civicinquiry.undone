import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { QuizPackage, ValidationError } from '../../core/types';
import { MAX_BYTES } from '../../core/strictJson';
import { validatePackage } from '../../core/validator';
import { diffPackages, finalizeRevision, suggestBump, type Change } from '../../authoring/diff';
import { newQuiz, setIn, slugify, type DraftRecord, type Path } from '../../authoring/draft';
import { exportDraft, exportFinal, importText, type ImportResult } from '../../authoring/exchange';
import { deleteDraft, loadDraft, saveDraft } from '../../authoring/storage';
import { useApp } from '../AppContext';
import { AppProvider } from '../AppContext';
import { QuizPage } from '../Quiz';
import { DraftCtx, type DraftApi } from './fields';
import { InfoStep, ItemsStep, SourcesStep } from './Steps';
import { IdeaForm } from './IdeaForm';
import { friendlyMessage, friendlyPath } from '../../authoring/friendly';
import { readableFilename, renderReadable } from '../../authoring/readable';
import { encodeQuiz, escapeForScript, RECOMMENDED_LINK_CHARS } from '../../share/link';
import { EMBED_MARKER } from '../../embedded';
import { stableStringify } from '../../core/hash';
import { seedItemFromIdea } from '../../authoring/ideas';
import { lintPackage } from '../../authoring/lint';

// ── 草稿 store（模組層級，讓精靈與預覽頁共用同一份草稿） ──
type Listener = () => void;
const listeners = new Set<Listener>();
let current: DraftRecord | null = null;
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saveFailed = false;

function emit() { listeners.forEach((l) => l()); }
function setRecord(rec: DraftRecord | null, persist = true) {
  current = rec;
  emit();
  if (!persist) return;
  clearTimeout(saveTimer);
  if (rec) saveTimer = setTimeout(async () => { saveFailed = !(await saveDraft(rec)); emit(); }, 400);
}
export const draftStore = {
  subscribe: (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; },
  get: () => current,
  async ensureLoaded() {
    if (loaded) return;
    loaded = true;
    const rec = await loadDraft();
    if (rec && !current) { current = rec; emit(); }
  },
  /** 測試用：重置模組狀態 */
  reset() { current = null; loaded = false; },
};

function useRecord(): DraftRecord | null {
  return useSyncExternalStore(draftStore.subscribe, draftStore.get);
}

function download(text: string, filename: string, type = 'application/json;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const STEPS = ['題庫資訊', '來源', '題目', '檢查與預覽', '版本與匯出入'] as const;

export function AuthorPage() {
  const rec = useRecord();
  const [ready, setReady] = useState(loaded && (rec !== null || true));
  useEffect(() => { void draftStore.ensureLoaded().then(() => setReady(true)); }, []);
  if (!ready) return <p role="status">載入草稿中…</p>;
  return rec ? <Wizard rec={rec} /> : <Start />;
}

// ── 起始畫面 ──
function Start() {
  const app = useApp();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [locale, setLocale] = useState('zh-Hant-TW');
  const [slug, setSlug] = useState('');
  const [importMsg, setImportMsg] = useState<ImportResult | null>(null);
  const [fileErr, setFileErr] = useState('');
  const [ideaAuthor, setIdeaAuthor] = useState('');

  const create = () => {
    const code = slugify(slug || title, 'quiz');
    setRecord({ pkg: newQuiz({ namespace: `local.${code}`, quizId: code, title, locale, authorName: author, now: app.now() }), baseline: null });
  };

  async function onFile(f: File | undefined) {
    setFileErr(''); setImportMsg(null);
    if (!f) return;
    if (f.size > MAX_BYTES) { setFileErr('檔案超過 2 MiB 上限，已拒絕。'); return; }
    setImportMsg(importText(await f.text(), null));
  }

  return (
    <div>
      <h1>作者工具</h1>
      <p className="notice">
        你在這裡寫的內容只存在這台裝置上（自動儲存草稿），不會上傳。完成後下載成「題庫檔」；
        <strong>匯出檔不會自動變成「已審查」</strong>，審查標章只能由受信任的發布目錄授予。
      </p>

      <section className="panel" aria-labelledby="idea-h">
        <h2 id="idea-h">我有一條法條或觀念，想變成題目</h2>
        <div className="field"><label htmlFor="idea-author">你的名字</label><input id="idea-author" type="text" value={ideaAuthor} onChange={(e) => setIdeaAuthor(e.target.value)} /></div>
        {ideaAuthor.trim() ? (
          <IdeaForm submitLabel="產生題目骨架" onSubmit={(idea) => {
            const base = newQuiz({ namespace: 'local.my-quiz', quizId: 'my-quiz', title: '我的題庫', locale: 'zh-Hant-TW', authorName: ideaAuthor.trim(), now: app.now() });
            const { pkg } = seedItemFromIdea({ ...base, description: '我整理的反直覺題庫' }, idea, app.now(), true);
            setRecord({ pkg, baseline: null });
          }} />
        ) : <p className="muted">先填你的名字，才會出現下面的問題。</p>}
      </section>

      <section className="panel" aria-labelledby="new-h">
        <h2 id="new-h">新題庫精靈</h2>
        <form onSubmit={(e) => { e.preventDefault(); create(); }}>
          <div className="field"><label htmlFor="n-title">題庫名稱</label><input id="n-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
          <div className="field"><label htmlFor="n-author">作者名稱</label><input id="n-author" type="text" value={author} onChange={(e) => setAuthor(e.target.value)} required /></div>
          <div className="field">
            <label htmlFor="n-locale">題庫語言</label>
            <select id="n-locale" value={locale} onChange={(e) => setLocale(e.target.value)}>
              <option value="zh-Hant-TW">繁體中文（臺灣）</option><option value="en">English</option><option value="ja">日本語</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="n-slug">英數代號（選填）</label>
            <p className="muted hint">用在檔名與識別碼，例如 physics。不填會自動產生。</p>
            <input id="n-slug" type="text" value={slug} onChange={(e) => setSlug(e.target.value)} />
          </div>
          <button type="submit" className="btn" disabled={!title.trim() || !author.trim()}>開始建立</button>
        </form>
      </section>

      <section className="panel" aria-labelledby="imp-h">
        <h2 id="imp-h">匯入題庫檔</h2>
        <p className="muted">只接受單一題庫檔（不收壓縮檔或網頁）。會先檢查格式、安全與內容，通過才載入。</p>
        <label htmlFor="n-file">選擇檔案</label>
        <input id="n-file" type="file" accept=".json,application/json" onChange={(e) => void onFile(e.target.files?.[0])} />
        {fileErr && <p role="alert" className="field-error">{fileErr}</p>}
        <ImportReport result={importMsg} onAccept={(pkg) => setRecord({ pkg, baseline: null })} acceptLabel="載入成草稿" />
      </section>

      {app.load.phase === 'ready' && (
        <section className="panel" aria-labelledby="rev-h">
          <h2 id="rev-h">修訂已發布的題庫</h2>
          <p className="muted">以目前線上的「{app.load.pkg.title}」（版本 {app.load.pkg.version}）為起點建立草稿。改完後會顯示和原版的差異，並自動升版、重置有變動題目的審查。</p>
          <button type="button" className="btn btn-secondary" onClick={() => { const pkg = JSON.parse(JSON.stringify((app.load as { pkg: QuizPackage }).pkg)) as QuizPackage; setRecord({ pkg, baseline: JSON.parse(JSON.stringify(pkg)) as QuizPackage }); }}>
            從已發布版本建立修訂草稿
          </button>
        </section>
      )}
    </div>
  );
}

// ── 匯入結果報告（錯誤定位、警告、差異、確認） ──
function ChangeList({ changes }: { changes: Change[] }) {
  if (changes.length === 0) return <p className="muted">沒有內容差異。</p>;
  return (
    <ul className="changes">
      {changes.slice(0, 80).map((c, i) => (
        <li key={i}>
          <span className={c.severity === 'answer' ? 'tag tag-warn' : 'tag'}>{c.severity === 'answer' ? '需重新審查' : '文字修訂'}</span>{' '}
          {c.itemId ? `題目 ${c.itemId}：` : ''}{c.label}（{c.kind === 'added' ? '新增' : c.kind === 'removed' ? '刪除' : '修改'}）
          {c.before !== null && <span className="muted">　舊：{c.before}</span>}
          {c.after !== null && <span className="muted">　新：{c.after}</span>}
        </li>
      ))}
      {changes.length > 80 && <li className="muted">…還有 {changes.length - 80} 項差異未列出。</li>}
    </ul>
  );
}

function ErrorList({ errors }: { errors: ValidationError[] }) {
  return (
    <ul className="errors">
      {errors.slice(0, 50).map((e, i) => (
        <li key={i}>
          <strong>{friendlyPath(e.path)}</strong>：{friendlyMessage(e.code, e.message)}
          <span className="muted tech">　（技術位置 <code>{e.path || '(整份檔案)'}</code>，{e.code}）</span>
        </li>
      ))}
      {errors.length > 50 && <li>…另有 {errors.length - 50} 個錯誤。</li>}
    </ul>
  );
}

function ImportReport({ result, onAccept, acceptLabel }: { result: ImportResult | null; onAccept: (pkg: QuizPackage) => void; acceptLabel: string }) {
  if (!result) return null;
  if (!result.ok) {
    const report = result.errors.map((e) => `${e.path || '(整份檔案)'}\t${e.code}\t${e.message}`).join('\n');
    return (
      <div role="alert" className="notice warn">
        <p><strong>匯入失敗，你目前的草稿完全沒有被動到。</strong></p>
        <ErrorList errors={result.errors} />
        <button type="button" className="btn btn-secondary" onClick={() => download(report, '匯入錯誤報告.txt')}>下載錯誤報告</button>
      </div>
    );
  }
  const note = {
    none: '', noop: '這份檔案和你目前的草稿完全相同，不需要匯入。', 'other-quiz': '這是另一份題庫，匯入會取代目前的草稿。',
    'different-version': '版本不同，下面列出和目前草稿的差異。',
    collision: '版本衝突（VERSION_COLLISION）：同一個版本號、內容卻不同。系統不會自動覆蓋，也不會偷偷幫你升版。請先看差異，再決定要不要放棄目前草稿。',
  }[result.relation];
  return (
    <div role="status" className="notice">
      <p><strong>檢查通過：</strong>{result.pkg.title}（版本 {result.pkg.version}，{result.pkg.items.length} 題）</p>
      {result.warnings.map((w) => <p key={w} className="notice warn">{w}</p>)}
      {note && <p className={result.relation === 'collision' ? 'notice warn' : ''}>{note}</p>}
      {result.relation !== 'none' && result.relation !== 'noop' && result.relation !== 'other-quiz' && <ChangeList changes={result.changes} />}
      {result.relation !== 'noop' && (
        <button type="button" className={result.relation === 'collision' ? 'btn btn-secondary' : 'btn'} onClick={() => onAccept(result.pkg)}>
          {result.relation === 'collision' ? '放棄目前草稿，改用匯入檔' : acceptLabel}
        </button>
      )}
    </div>
  );
}

// ── 精靈 ──
function Wizard({ rec }: { rec: DraftRecord }) {
  const app = useApp();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState(0);
  const now = useMemo(() => app.now(), [app]);
  const errors = useMemo<ValidationError[]>(() => validatePackage(JSON.parse(JSON.stringify(rec.pkg))).errors, [rec.pkg]);

  const set = useCallback((path: Path, value: unknown) => setRecord({ ...rec, pkg: setIn(rec.pkg, path, value) }), [rec]);
  const update = useCallback((fn: (p: QuizPackage) => QuizPackage) => setRecord({ ...rec, pkg: fn(rec.pkg) }), [rec]);
  const api: DraftApi = { pkg: rec.pkg, errors, set, update };

  const headingRef = useRef<HTMLDivElement>(null);
  const go = (n: number) => { setStep(n); setTimeout(() => headingRef.current?.querySelector('h2')?.setAttribute('tabindex', '-1'), 0); };

  return (
    <DraftCtx.Provider value={api}>
      <h1>作者工具：{rec.pkg.title || '（未命名題庫）'}</h1>
      <p className="muted" role="status">
        {saveFailed ? '這台裝置無法儲存草稿（可能是無痕模式）。請用「下載草稿」備份。' : '草稿會自動儲存在這台裝置。'}
        目前有 {errors.length} 個待補或待修的項目。
      </p>
      <nav aria-label="步驟">
        <ol className="steps">
          {STEPS.map((s, n) => (
            <li key={s}><button type="button" className="btn btn-secondary" aria-current={n === step ? 'step' : undefined} onClick={() => go(n)}>{n + 1}. {s}</button></li>
          ))}
        </ol>
      </nav>
      <div ref={headingRef}>
        {step === 0 && <InfoStep />}
        {step === 1 && <SourcesStep now={now} />}
        {step === 2 && <ItemsStep now={now} selected={selected} onSelect={setSelected} />}
        {step === 3 && <CheckStep errors={errors} pkg={rec.pkg} onJump={(n) => { setSelected(n); go(2); }} />}
        {step === 4 && <ExchangeStep rec={rec} errors={errors} />}
      </div>
      <div className="actions">
        <button type="button" className="btn btn-ghost" disabled={step === 0} onClick={() => go(step - 1)}>上一步</button>
        <button type="button" className="btn" disabled={step === STEPS.length - 1} onClick={() => go(step + 1)}>下一步</button>
      </div>
    </DraftCtx.Provider>
  );
}

function Hints({ pkg }: { pkg: QuizPackage }) {
  const hints = lintPackage(pkg);
  if (hints.length === 0) return <p className="notice">出題提醒：沒有發現明顯的問題。</p>;
  return (
    <section aria-labelledby="hint-h" className="panel">
      <h3 id="hint-h">出題提醒（不影響匯出，但建議處理）</h3>
      <ul>{hints.map((h, i) => <li key={i}>{h.item === null ? '整份題庫：' : `第 ${h.item + 1} 題：`}{h.message}</li>)}</ul>
    </section>
  );
}

function CheckStep({ errors, pkg, onJump }: { errors: ValidationError[]; pkg: QuizPackage; onJump: (item: number) => void }) {
  const itemOf = (p: string) => { const m = /^\/items\/(\d+)/.exec(p); return m ? Number(m[1]) : null; };
  const general = errors.filter((e) => itemOf(e.path) === null);
  return (
    <div>
      <h2>檢查與預覽</h2>
      {errors.length === 0 ? (
        <p className="notice">全部檢查通過：格式、安全、參照、時間與證據。通過檢查不等於內容正確，仍需要領域與教育兩位審查者。</p>
      ) : (
        <p className="notice warn">還有 {errors.length} 個項目需要處理：</p>
      )}
      <Hints pkg={pkg} />
      {general.length > 0 && <><h3>題庫層級</h3><ErrorList errors={general} /></>}
      <ul className="item-check">
        {pkg.items.map((it, n) => {
          const mine = errors.filter((e) => itemOf(e.path) === n);
          return (
            <li key={n} className="panel">
              <h3>第 {n + 1} 題：{it.topic || '（未命名）'}　{mine.length ? `⚠ ${mine.length} 項待補` : '✓ 檢查通過'}</h3>
              {mine.length > 0 && <ErrorList errors={mine} />}
              <div className="actions">
                <button type="button" className="btn btn-secondary" onClick={() => onJump(n)}>回去編輯<span className="visually-hidden">第 {n + 1} 題</span></button>
                <a className="btn" href={`#/author/preview/${n + 1}`}>預覽這題<span className="visually-hidden">（第 {n + 1} 題）</span></a>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="muted">預覽使用和讀者完全相同的畫面與判分引擎。預覽中的作答不會被儲存。若某題還沒有有效的正解，預覽會顯示「無法判定」，不會猜答案。</p>
    </div>
  );
}

function ShareLinkPanel({ pkg, valid }: { pkg: QuizPackage; valid: boolean }) {
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  return (
    <section className="panel" aria-labelledby="lnk-h">
      <h3 id="lnk-h">用連結分享（對方點開就能考）</h3>
      <p className="muted">題目會被壓縮放進連結的 # 後面，這一段不會送到任何伺服器。對方點開連結就能直接考，不用註冊或下載。連結太長時，有些通訊軟體會截斷，請改用下面的檔案。</p>
      <button type="button" className="btn" disabled={!valid || busy} onClick={async () => {
        setBusy(true); setCopied('');
        const payload = await encodeQuiz(pkg);
        setLink(`${window.location.origin}${window.location.pathname}#/s/${payload}`);
        setBusy(false);
      }}>產生分享連結</button>
      {!valid && <p className="muted">要先通過上面的檢查，才能產生連結。</p>}
      {link && (
        <div>
          <label htmlFor="link-out">分享連結（共 {link.length} 字元）</label>
          <textarea id="link-out" rows={4} readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          {link.length > RECOMMENDED_LINK_CHARS && <p className="notice warn" role="alert">連結很長（超過 {RECOMMENDED_LINK_CHARS} 字元），貼到 LINE 或 Email 時可能被截斷。建議減少題數，或改用下載檔案的方式分享。</p>}
          <div className="actions">
            <button type="button" className="btn btn-secondary" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied('已複製。'); } catch { setCopied('無法自動複製，請在上面的方框全選後複製。'); } }}>複製連結</button>
          </div>
          <p role="status">{copied}</p>
        </div>
      )}
    </section>
  );
}

function SingleFilePanel({ pkg, valid }: { pkg: QuizPackage; valid: boolean }) {
  const [msg, setMsg] = useState('');
  return (
    <section className="panel" aria-labelledby="sf-h">
      <h3 id="sf-h">下載成單一檔案（不用網路也能考）</h3>
      <p className="muted">會產生一個 .html 檔，裡面包含整個測驗程式和你的題目。傳給對方後，對方連點兩下就能用瀏覽器開啟，不需要網路、不需要安裝，也不會對外連線。</p>
      <button type="button" className="btn" disabled={!valid} onClick={async () => {
        setMsg('');
        try {
          const res = await fetch('/single-template.html', { cache: 'no-store' });
          const text = res.ok ? await res.text() : '';
          if (!text.includes(EMBED_MARKER)) { setMsg('這個網站沒有提供單一檔案版（可能是用精簡模式部署的）。請改用上面的連結或下載題庫檔。'); return; }
          const data = escapeForScript(JSON.stringify(JSON.parse(stableStringify(pkg, 0))));
          const html = text.replace(EMBED_MARKER, () => '<script type="application/json" id="civic-' + 'data">' + data + '</' + 'script>');
          download(html, `${pkg.quizId}.html`, 'text/html;charset=utf-8');
          setMsg('已下載。把這個檔案傳給對方，連點兩下就能開啟。');
        } catch { setMsg('下載失敗，請稍後再試。'); }
      }}>下載單一檔案（.html）</button>
      {!valid && <p className="muted">要先通過上面的檢查，才能下載。</p>}
      <p role="status">{msg}</p>
    </section>
  );
}

function ExchangeStep({ rec, errors }: { rec: DraftRecord; errors: ValidationError[] }) {
  const app = useApp();
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const [imp, setImp] = useState<ImportResult | null>(null);
  const [fileErr, setFileErr] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const changes = useMemo(() => (rec.baseline ? diffPackages(rec.baseline, rec.pkg) : []), [rec]);
  const bump = suggestBump(changes);
  const needsReview = changes.some((c) => c.severity === 'answer');

  async function onFile(f: File | undefined) {
    setFileErr(''); setImp(null);
    if (!f) return;
    if (f.size > MAX_BYTES) { setFileErr('檔案超過 2 MiB 上限，已拒絕。'); return; }
    setImp(importText(await f.text(), rec.pkg));
  }

  const out = exportFinal(rec.pkg);

  return (
    <div>
      <h2>版本與匯出入</h2>

      {rec.baseline && (
        <section className="panel" aria-labelledby="ver-h">
          <h3 id="ver-h">和原版（{rec.baseline.version}）的差異</h3>
          <ChangeList changes={changes} />
          {bump ? (
            <>
              <p>建議升版：<strong>{bump === 'minor' ? '次版號（需要重新審查）' : '修訂號（只有文字修正）'}</strong>。
                {needsReview && '正解、情境、證據或適用期間變了，這些題目的舊審查不會沿用。'}
              </p>
              <div className="field">
                <label htmlFor="rev-reason">修訂原因</label>
                <textarea id="rev-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <button type="button" className="btn" disabled={!reason.trim()} onClick={() => {
                const revised = finalizeRevision(rec.baseline!, rec.pkg, reason.trim());
                setRecord({ pkg: revised, baseline: null });
                setMsg(`已建立新版本 ${revised.version}。有變動的題目已重置為未審查，舊版本不受影響。`);
              }}>完成修訂（升版並重置審查）</button>
            </>
          ) : <p className="muted">目前沒有內容差異，不需要升版。</p>}
        </section>
      )}
      {!rec.baseline && app.load.phase === 'ready' && (
        <p className="muted">想要修訂已發布的題庫？請回到起始畫面，從「已發布版本建立修訂草稿」開始，才能算出差異與版本號。</p>
      )}
      <p role="status">{msg}</p>

      <section className="panel" aria-labelledby="exp-h">
        <h3 id="exp-h">匯出</h3>
        {out.ok ? (
          <>
            <p>檢查全部通過，可以匯出正式檔案：<code>{out.filename}</code></p>
            <button type="button" className="btn" onClick={() => download(out.text, out.filename)}>下載題庫檔</button>
            <details>
              <summary>怎麼發布？</summary>
              <ol>
                <li>把下載的檔案交給部署管理員，放進網站專案的 <code>content-src</code> 資料夾。</li>
                <li>執行 <code>npm run build</code>。它會再檢查一次，通過才產生網站。</li>
                <li>審查標章不會隨檔案出現。需要領域與教育兩位審查者的報告，並由發布管理員在狀態目錄授予。</li>
              </ol>
              <p className="muted">目前沒有雲端發布服務，所以這裡只提供「下載發布包」。</p>
            </details>
          </>
        ) : (
          <>
            <p className="notice warn">還不能匯出正式檔案：有 {errors.length} 個項目沒通過檢查（請看上一步）。</p>
            <button type="button" className="btn" disabled>下載題庫檔</button>
          </>
        )}
        <div className="actions">
          <button type="button" className="btn btn-secondary" onClick={() => { const d = exportDraft(rec.pkg); download(d.text, d.filename); }}>下載草稿備份（可以還沒完成）</button>
        </div>
      </section>

      <section className="panel" aria-labelledby="rd-h">
        <h3 id="rd-h">給審查的人看（可閱讀的文件）</h3>
        <p className="muted">把所有題目排成一份好讀的文件：每題有情境、選項、憲政體制的答案、依據的條文原文、解釋，最後留一塊空白給審查意見。對方用瀏覽器打開就能讀，也可以列印或存成 PDF。題目還沒寫完也能下載。</p>
        <button type="button" className="btn btn-secondary" onClick={() => download(renderReadable(rec.pkg, app.now()), readableFilename(rec.pkg), 'text/html;charset=utf-8')}>下載審查用文件</button>
      </section>

      <ShareLinkPanel pkg={rec.pkg} valid={out.ok} />
      <SingleFilePanel pkg={rec.pkg} valid={out.ok} />

      <section className="panel" aria-labelledby="imp2-h">
        <h3 id="imp2-h">匯入</h3>
        <label htmlFor="x-file">選擇題庫檔</label>
        <input id="x-file" type="file" accept=".json,application/json" onChange={(e) => void onFile(e.target.files?.[0])} />
        {fileErr && <p role="alert" className="field-error">{fileErr}</p>}
        <ImportReport result={imp} onAccept={(pkg) => { setRecord({ pkg, baseline: null }); setImp(null); setMsg('已載入匯入的內容。'); }} acceptLabel="用匯入檔取代目前草稿" />
      </section>

      <section className="panel" aria-labelledby="del-h">
        <h3 id="del-h">刪除草稿</h3>
        {!confirmDelete ? (
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(true)}>刪除這份草稿…</button>
        ) : (
          <>
            <p className="notice warn">這會從這台裝置永久刪除草稿，無法復原。要保留請先下載備份。</p>
            <button type="button" className="btn btn-secondary" onClick={async () => { clearTimeout(saveTimer); await deleteDraft(); setRecord(null, false); }}>確定刪除</button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>取消</button>
          </>
        )}
      </section>
    </div>
  );
}

// ── 預覽頁：用草稿當題庫，走和讀者完全相同的畫面與引擎 ──
export function AuthorPreview({ index }: { index: number }) {
  const rec = useRecord();
  const [ready, setReady] = useState(false);
  useEffect(() => { void draftStore.ensureLoaded().then(() => setReady(true)); }, []);
  if (!ready) return <p role="status">載入草稿中…</p>;
  if (!rec) return <p>沒有草稿可以預覽。<a href="#/author">回到作者工具</a></p>;
  const errs = validatePackage(JSON.parse(JSON.stringify(rec.pkg))).errors.filter((e) => e.path.startsWith(`/items/${index - 1}/`) || e.path === `/items/${index - 1}`);
  return (
    <div>
      <p className="notice"><strong>作者預覽：</strong>這是你的草稿，用和讀者相同的畫面呈現。這裡的作答不會被儲存。<a href="#/author">回到編輯</a></p>
      {errs.length > 0 && (
        <details className="notice warn" open>
          <summary>這一題還有 {errs.length} 個項目沒處理，預覽可能不完整</summary>
          <ErrorList errors={errs} />
        </details>
      )}
      <AppProvider preview={rec.pkg} linkBase="#/author/preview" endHref="#/author">
        <QuizPage index={index} />
      </AppProvider>
    </div>
  );
}
