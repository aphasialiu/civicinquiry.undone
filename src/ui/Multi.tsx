// 多題庫與翻譯（FR-13）：語言包與題目翻譯分離；譯文的審查狀態獨立，不沿用原文；缺譯文時引導讀原文。
import { useEffect, useState } from 'react';
import { loadQuiz } from '../core/loader';
import { untranslated } from '../core/translation';
import type { Item, QuizPackage } from '../core/types';
import { useApp } from './AppContext';

const LOCALE_LABEL: Record<string, string> = { 'zh-Hant-TW': '繁體中文（臺灣）', 'zh-Hans-CN': '簡體中文', en: 'English', ja: '日本語' };
export const localeLabel = (l: string) => LOCALE_LABEL[l] ?? l;

const hrefOf = (k: number, suffix = '') => (k === 0 ? `#/${suffix}` : `#/q/${k}${suffix ? '/' + suffix : ''}`);

export function OtherQuizzes() {
  const app = useApp();
  const cat = app.catalog;
  if (app.load.phase !== 'ready' || !cat || cat.quizzes.length < 2) return null;
  const me = cat.quizzes[app.entryIndex];
  return (
    <section aria-labelledby="others-h" className="panel">
      <h2 id="others-h">其他題庫與語言版本</h2>
      <p className="muted">每份題庫的作答互相獨立，切換不會混用答案。</p>
      <ul>
        {cat.quizzes.map((q, k) => {
          const sameQuiz = q.namespace === me.namespace && q.quizId === me.quizId && q.locale !== me.locale;
          if (k === app.entryIndex) return null;
          return (
            <li key={k}>
              <a href={hrefOf(k)}>{q.title}</a>
              <span className="muted">　{localeLabel(q.locale)}・{q.itemCount} 題{sameQuiz ? '・同一份題庫的另一個語言版本' : ''}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function TranslationInfo({ pkg }: { pkg: QuizPackage }) {
  const app = useApp();
  const [missing, setMissing] = useState<Array<{ item: Item; n: number }> | null>(null);
  const [origIdx, setOrigIdx] = useState<number | null>(null);
  const translated = pkg.items.filter((i) => i.translationOf);
  const fromLocale = translated[0]?.translationOf?.locale;

  useEffect(() => {
    const cat = app.catalog;
    if (!cat || !fromLocale) return;
    const k = cat.quizzes.findIndex((q) => q.namespace === pkg.namespace && q.quizId === pkg.quizId && q.locale === fromLocale);
    if (k < 0) return;
    let dead = false;
    void loadQuiz((i, init) => fetch(i, init), cat.quizzes[k]).then((orig) => {
      if (dead) return;
      setOrigIdx(k);
      setMissing(untranslated(orig, pkg).map((item) => ({ item, n: orig.items.indexOf(item) + 1 })));
    }).catch(() => undefined);
    return () => { dead = true; };
  }, [app.catalog, pkg, fromLocale]);

  if (!fromLocale) return null;
  return (
    <section aria-labelledby="tr-h" className="panel">
      <h2 id="tr-h">這是翻譯版本</h2>
      <p>原文語言：{localeLabel(fromLocale)}。譯文的審查狀態<strong>獨立</strong>計算，不會沿用原文的審查結果；原文更新時，譯文會標示「待更新」。</p>
      {missing && missing.length > 0 && origIdx !== null && (
        <>
          <p className="notice" role="note">有 {missing.length} 題還沒有譯文，請閱讀原文（不會自動機器翻譯，尤其是法律與制度內容）：</p>
          <ul>
            {missing.map(({ item, n }) => (
              <li key={item.id}><a href={hrefOf(origIdx, `quiz/${n}`)}>{item.topic}</a><span className="muted">　尚無譯文，原文語言：{localeLabel(fromLocale)}</span></li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
