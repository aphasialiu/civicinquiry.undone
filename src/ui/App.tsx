import { CONTACT_EMAIL, QR_PATH, QR_SIZE } from '../data/contact';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppProvider, useApp } from './AppContext';
import { Intro, Privacy, Review } from './Pages';
import { QuizPage } from './Quiz';
import { AuthorPage, AuthorPreview } from './author/AuthorPage';
import { Mine } from './notebook/Mine';
import { SharedPlay, parseSharedHash } from './SharedPlay';
import { PilotReport } from './Pilot';
import { isPilot } from '../pilot';
import { SessionStore } from '../session/store';
import type { Fetcher } from '../core/loader';
import type { Embedded } from '../embedded';


function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

// 第 2 份以後的題庫各自有獨立的記憶體作答（不混用答案）；本機儲存只支援第 1 份。
const secondaryStores = new Map<number, SessionStore>();
function storeFor(k: number): SessionStore {
  let s = secondaryStores.get(k);
  if (!s) { s = new SessionStore(); secondaryStores.set(k, s); }
  return s;
}

function SecondaryQuiz({ k, rest }: { k: number; rest: string }) {
  const quiz = /^quiz\/(\d+)$/.exec(rest);
  return (
    <AppProvider key={k} store={storeFor(k)} entryIndex={k} linkBase={`#/q/${k}/quiz`} endHref={`#/q/${k}/review`} homeHref={`#/q/${k}`}>
      {quiz ? <QuizPage index={Number(quiz[1])} /> : rest === 'review' ? <Review /> : <Intro />}
    </AppProvider>
  );
}

function Router() {
  const app = useApp();
  const hash = useHashRoute();
  const mainRef = useFocusOnRouteChange(hash);

  let body: ReactNode;
  const shared = parseSharedHash(hash);
  if (shared) body = <SharedPlay payload={shared.payload} rest={shared.rest} />;
  else if (app.load.phase === 'loading') body = <p role="status">載入題庫中…</p>;
  else if (app.load.phase === 'error') {
    body = (
      <div>
        <h1>題庫無法使用</h1>
        <p className="notice warn">{app.load.message}。為了安全，這份題庫沒有被部分啟用。</p>
        {app.load.errors.length > 0 && (
          <ul>{app.load.errors.slice(0, 20).map((e, i) => <li key={i}><code>{e.path || '(根)'}</code> {e.code}：{e.message}</li>)}</ul>
        )}
      </div>
    );
  } else {
    const quiz = /^#\/quiz\/(\d+)$/.exec(hash);
    const prev = /^#\/author\/preview\/(\d+)$/.exec(hash);
    const sec = /^#\/q\/(\d+)(?:\/(.*))?$/.exec(hash);
    if (sec && Number(sec[1]) > 0) body = <SecondaryQuiz k={Number(sec[1])} rest={sec[2] ?? ''} />;
    else if (prev) body = <AuthorPreview index={Number(prev[1])} />;
    else if (hash === '#/author') body = <AuthorPage />;
    else if (hash === '#/mine') body = <Mine />;
    else if (hash === '#/pilot' && isPilot()) body = <PilotReport />;
    else if (quiz) body = <QuizPage index={Number(quiz[1])} />;
    else if (hash === '#/review') body = <Review />;
    else if (hash === '#/privacy') body = <Privacy />;
    else body = <Intro />;
  }

  return (
    <>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>跳到主要內容</a>
      <header className="site-header">
        <a className="brand" href="#/">民主不是你想的那樣</a>
        <nav aria-label="主選單">
          <a href="#/">題庫介紹</a>
          <a href="#/review">回顧</a>
          <a href="#/mine">我的盲點</a>
          {isPilot() && <a href="#/pilot">試答紀錄</a>}
          <a href="#/author">作者工具</a>
          <a href="#/privacy">隱私設定</a>
        </nav>
      </header>
      <main id="main" tabIndex={-1} ref={mainRef}>{body}</main>
      <footer className="site-footer">
        <div className="footer-row">
  <p className="fineprint">{isPilot() && <strong>【試答版】</strong>}民主不是你想的那樣　V0.1<br />教育原型。這是供訪談、教育試測與格式驗證的原型題庫，法源經初步比對，尚未經過獨立的法律與教育專業審查，不構成法律意見。<br />你的作答不會離開這個分頁，除非你選擇儲存在這台裝置。</p>
          <div className="footer-right">
            <a className="contact" href={`mailto:${CONTACT_EMAIL}`}>
              <svg viewBox={`-2 -2 ${QR_SIZE + 4} ${QR_SIZE + 4}`} width="72" height="72" role="img" aria-label="聯絡作者的 QR code，掃描後會開啟寄信畫面" shapeRendering="crispEdges">
                <rect x="-2" y="-2" width={QR_SIZE + 4} height={QR_SIZE + 4} fill="#fff" />
                <path d={QR_PATH} fill="#000" />
              </svg>
              <span>聯絡作者（寄信）</span>
            </a>
            <p className="license">
              <a href="https://creativecommons.org/licenses/by/4.0/deed.zh-hant" target="_blank" rel="noopener noreferrer">CC BY 4.0<span className="visually-hidden">（另開新視窗，離開本站）</span></a>
              ：除另有標示外，本站題目與解說以創用 CC 姓名標示 4.0 授權，轉載請標示出處。
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}

function useFocusOnRouteChange(hash: string) {
  const ref = useRef<HTMLElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    window.scrollTo(0, 0);
    ref.current?.focus();
  }, [hash]);
  return ref;
}

export function App({ fetcher, now, store, embedded }: { fetcher?: Fetcher; now?: () => Date; store?: SessionStore; embedded?: Embedded }) {
  if (embedded?.kind === 'error') {
    return (
      <main>
        <h1>這個檔案裡的題庫打不開</h1>
        <p className="notice warn">為了安全，沒有開啟。{embedded.errors[0]?.message}</p>
      </main>
    );
  }
  return (
    <AppProvider fetcher={fetcher} now={now} store={store} preview={embedded?.kind === 'ok' ? embedded.pkg : undefined}>
      <Router />
    </AppProvider>
  );
}
