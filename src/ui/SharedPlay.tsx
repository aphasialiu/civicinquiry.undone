// 「點連結就開始考」：題庫放在網址的 # 後面（不會送到任何伺服器），開啟時解碼、驗證，再用和正式題庫相同的畫面作答。
import { useEffect, useState } from 'react';
import type { QuizPackage, ValidationError } from '../core/types';
import { decodeQuiz } from '../share/link';
import { AppProvider } from './AppContext';
import { Intro, Review } from './Pages';
import { QuizPage } from './Quiz';

export function parseSharedHash(hash: string): { payload: string; rest: string } | null {
  const prefix = '#/s/';
  if (!hash.startsWith(prefix)) return null;
  const [payload, ...restParts] = hash.slice(prefix.length).split('/');
  return payload ? { payload, rest: restParts.join('/') } : null;
}

type State = { phase: 'loading' } | { phase: 'error'; errors: ValidationError[] } | { phase: 'ready'; pkg: QuizPackage };

export function SharedPlay({ payload, rest }: { payload: string; rest: string }) {
  const [state, setState] = useState<State>({ phase: 'loading' });
  useEffect(() => {
    let dead = false;
    setState({ phase: 'loading' });
    void decodeQuiz(payload).then((r) => { if (!dead) setState(r.ok ? { phase: 'ready', pkg: r.pkg } : { phase: 'error', errors: r.errors }); });
    return () => { dead = true; };
  }, [payload]);

  if (state.phase === 'loading') return <p role="status">打開分享的題庫中…</p>;
  if (state.phase === 'error') {
    return (
      <div>
        <h1>這個連結打不開</h1>
        <p className="notice warn">為了安全，這份題庫沒有被開啟。{state.errors[0]?.message}</p>
        {state.errors.length > 1 && (
          <ul className="errors">{state.errors.slice(0, 10).map((e, i) => <li key={i}><code>{e.path || '(整份)'}</code>　{e.code}：{e.message}</li>)}</ul>
        )}
        <p className="muted">請向分享給你的人要一個新的連結。連結太長時，有些通訊軟體會把它截斷。</p>
        <p><a href="#/">回到首頁</a></p>
      </div>
    );
  }
  const quiz = rest.startsWith('quiz/') ? Number(rest.slice(5)) : NaN;
  const base = `#/s/${payload}`;
  return (
    <AppProvider key={payload} preview={state.pkg} linkBase={`${base}/quiz`} endHref={`${base}/review`} homeHref={base}>
      <p className="notice" role="note">
        <strong>這是別人分享給你的題庫。</strong>內容由分享的人負責，沒有經過任何審查；如果你不認識對方，請多留意。你的作答只留在這個分頁，不會傳給任何人。
      </p>
      {Number.isInteger(quiz) ? <QuizPage index={quiz} /> : rest === 'review' ? <Review /> : <Intro />}
    </AppProvider>
  );
}
