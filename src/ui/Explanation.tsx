import { useEffect, useRef, useState } from 'react';
import type { Eligibility } from '../core/eligibility';
import { HISTORICAL_TEXT } from '../core/eligibility';
import type { Item, QuizPackage } from '../core/types';
import type { Attempt } from '../session/attempt';
import { Explorer } from './Explorer';
import { Markdown } from './Markdown';
import { eligibilityLabel, fmtDate } from './format';
import { useApp } from './AppContext';
import { OUTDATED_PREFIX } from '../core/translation';
import { stripAnswerLead } from '../core/text';
import { isPilot } from '../pilot';
import { PilotPanel } from './Pilot';

interface Props {
  item: Item;
  pkg: QuizPackage;
  attempt: Attempt | null;
  eligibility: Eligibility;
  index: number;
  total: number;
  /** 剛揭曉：焦點移到結果標題、並用 aria-live 宣布一次 */
  justRevealed: boolean;
}

/** 一句話的結果。不說「你錯了」：重點是讓人發現「憲政體制其實不是這樣設計的」。 */
function resultSentence(a: Attempt | null, _e: Eligibility, item: Item): string {
  if (item.knowledge.type === 'reflection') return a && a.answerState === 'answered' && a.selectedOptionIds.length > 0 ? '這題沒有標準答案。你選的想法有它合理的地方，也藏著沒說出口的前提。' : '這題沒有標準答案。';
  if (a && a.answerState === 'answered' && a.result === null) return '這題還沒有有效的正解，無法判定對錯（預覽）。';
  if (!a) return '你直接閱讀了這一題。';
  if (a.viewedExplanationBeforeAnswer && a.answerState === 'skipped') return '你先看了答案，這題不計入作答。';
  if (a.answerState === 'unknown') return '你選了「不知道」。來看看憲政體制怎麼規定。';
  if (a.answerState === 'skipped') return '你略過了這題。來看看憲政體制怎麼規定。';
  if (a.result === 'ineligible') return '這題目前只能當歷史閱讀，不計分。';
  return a.result === 'correct' ? '你選的和憲政規定一致。' : '你選的和憲政規定不一樣。很多人一開始都會這樣想，來看看為什麼。';
}

export function Explanation({ item, pkg, attempt, eligibility, index, total, justRevealed }: Props) {
  const app = useApp();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [announce, setAnnounce] = useState('');
  const [report, setReport] = useState('');
  const [copyMsg, setCopyMsg] = useState('');

  useEffect(() => {
    if (!justRevealed) return;
    headingRef.current?.focus();
    // 只宣布一次結果，不整頁重複朗讀
    setAnnounce(resultSentence(attempt, eligibility, item));
  }, [justRevealed, attempt, eligibility, item]);

  const historical = eligibility.kind === 'historical';
  const outdatedEntry = app.status?.entries.find((x) => x.itemId === item.id && x.version === item.version && x.locale === item.language);
  const outdated = outdatedEntry?.reason?.startsWith(OUTDATED_PREFIX) ? outdatedEntry.reason.slice(OUTDATED_PREFIX.length) : null;
  const note = app.snapshot.data.notes[item.id] ?? '';
  const sourceById = new Map(pkg.sources.map((s) => [s.id, s]));
  const isReflection = item.knowledge.type === 'reflection';
  const label = (id: string) => item.knowledge.options.find((o) => o.id === id)?.label ?? id;
  const myChoices = attempt?.answerState === 'answered' ? attempt.selectedOptionIds.map(label) : [];
  const answers = item.knowledge.correctOptionIds.map(label);
  const coreText = stripAnswerLead(item.explanation.short);
  const rawNotes = item.extensions?.['civic.option-notes'];
  const notes = (rawNotes && typeof rawNotes === 'object' ? rawNotes : {}) as Record<string, string>;
  const rawViews = item.extensions?.['civic.views'];
  const views = (Array.isArray(rawViews) ? rawViews : []) as Array<{ label?: string; text?: string }>;
  const rawBasis = item.extensions?.['civic.basis'];
  const basis = (Array.isArray(rawBasis) ? rawBasis : []) as Array<{ sourceId?: string; quote?: string; locator?: string }>;

  const reportText = () =>
    [
      `題庫：${pkg.namespace}/${pkg.quizId} 版本 ${pkg.version}`,
      `題目：${item.id} 版本 ${item.version}（${item.language}）`,
      `來源定位：${item.evidenceIds.map((id) => `${sourceById.get(id)?.title ?? id}｜${sourceById.get(id)?.locator ?? ''}`).join('；')}`,
      '',
      '我想回報的問題：',
      report,
    ].join('\n');

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(reportText());
      setCopyMsg('已複製到剪貼簿。');
    } catch {
      setCopyMsg('無法自動複製，請手動選取上方文字。');
    }
  }
  function downloadReport() {
    const url = URL.createObjectURL(new Blob([reportText()], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `回報-${item.id}-${item.version}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <article aria-labelledby="result-h">
      <p className="progress">第 {index} 題／共 {total} 題・{item.topic}</p>

      <div role="status" aria-live="polite" className="visually-hidden">{announce}</div>

      {outdated && <p className="notice warn"><strong>譯文待更新：</strong>原文已更新到版本 {outdated}，這個譯本還停在舊版（{item.translationOf?.version}），內容可能已經過時。</p>}
      {historical && <p className="notice warn"><strong>歷史閱讀：</strong>{HISTORICAL_TEXT[eligibility.reason]}</p>}

      <h2 id="result-h" ref={headingRef} tabIndex={-1}>{resultSentence(attempt, eligibility, item)}</h2>
      {myChoices.length > 0 && <p className="mine">你選的是：{myChoices.join('；')}</p>}

      {!isReflection && (
        <section aria-labelledby="ans-h" className="answer-box">
          <h3 id="ans-h">{historical ? '此歷史版本所載的答案（不代表現行規則）' : '憲政體制的答案'}</h3>
          {answers.map((a) => <p key={a} className="answer">{a}</p>)}
        </section>
      )}
      {isReflection && (
        <section aria-labelledby="reflect-h" className="answer-box">
          <h3 id="reflect-h">這題沒有標準答案，可以這樣想</h3>
          {attempt?.answerState === 'answered' && attempt.selectedOptionIds.map((id) => notes[id] && <p key={id}><strong>你選的想法：</strong>{notes[id]}</p>)}
          <p>{item.knowledge.rationale}</p>
          {item.knowledge.options.length > 0 && (
            <details>
              <summary>每一種想法各自隱含的前提</summary>
              <ul>{item.knowledge.options.map((o) => <li key={o.id}><strong>{o.label}</strong><br />{notes[o.id] ?? ''}</li>)}</ul>
            </details>
          )}
        </section>
      )}

      {isReflection && views.length > 0 && (
        <section aria-labelledby="views-h">
          <h3 id="views-h">各方最有力的論點</h3>
          <p className="muted">以下是常見的看法，不是官方立場，順序也不代表哪一個比較對。</p>
          <ul>{views.map((v, k) => <li key={k}><strong>{v.label}</strong><br />{v.text}</li>)}</ul>
        </section>
      )}

      <section aria-labelledby="basis-h">
        <h3 id="basis-h">依據</h3>
        <ul className="basis">
          {item.evidenceIds.map((id) => {
            const s = sourceById.get(id);
            if (!s) return null;
            const mine = basis.filter((b) => b.sourceId === id && b.quote);
            return (
              <li key={id}>
                {mine.length > 0 ? mine.map((b, k) => (
                  <div key={k}>
                    <strong>{b.locator ?? s.locator}</strong>
                    <blockquote className="quote">{b.quote}</blockquote>
                  </div>
                )) : <strong>{s.locator}</strong>}
                <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}<span className="visually-hidden">（另開新視窗，離開本站）</span></a>
                <span className="muted">　{s.publisher}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="why-h" className="panel">
        <h3 id="why-h">解釋</h3>
        {coreText && <Markdown text={coreText} />}
        <Markdown text={item.explanation.mechanism} />
        <p className="intuition-trap"><strong>為什麼直覺會出問題：</strong>{item.explanation.misconception}</p>
      </section>

      {isPilot() && attempt && <PilotPanel item={item} />}

      <details>
        <summary>再多看一點：制度理由、其他作法、這題的限制</summary>
        <h4>可能的制度理由</h4>
        <Markdown text={item.explanation.possibleReasons} headingLevel={4} />
        <h4>其他作法</h4>
        <Markdown text={item.explanation.alternatives} headingLevel={4} />
        <h4>這題沒有回答什麼</h4>
        <Markdown text={item.explanation.limitations} headingLevel={4} />
        <p className="muted">
          適用：{item.jurisdiction}，依據 {fmtDate(item.validity.asOf)} 的規定（{item.validity.knowledgeVersion}）。
          作者：{item.authorIds.map((id) => pkg.authors.find((a) => a.id === id)?.displayName ?? id).join('、')}（自述，不是專業認證）。{eligibilityLabel(eligibility)}。
        </p>
      </details>

      <details>
        <summary>想自己查原始資料</summary>
        <Explorer item={item} pkg={pkg} />
      </details>

      <details>
        <summary>想一想、寫筆記</summary>
        <ul>{item.discussionPrompts.map((p) => <li key={p}>{p}</li>)}</ul>
        <label htmlFor={`note-${item.id}`}><strong>我的筆記</strong>（選填）</label>
        <textarea
          id={`note-${item.id}`}
          rows={4}
          value={note}
          onChange={(e) => app.store.setNote(item.id, e.target.value)}
          aria-describedby={`note-help-${item.id}`}
        />
        <p id={`note-help-${item.id}`} className="muted">
          筆記不會上傳。{app.snapshot.persisted ? '你已選擇儲存在這台裝置，筆記會一起儲存。' : '目前只存在這個分頁的記憶體裡，關閉分頁就會消失。'}
        </p>
      </details>

      <details>
        <summary>我覺得這題有問題</summary>
        <p className="muted">下面只會包含題號、版本、來源定位，以及你自己輸入的文字；<strong>不會</strong>附上你的作答或裝置資訊。</p>
        <label htmlFor="report-text">說明你發現的問題</label>
        <textarea id="report-text" rows={4} value={report} onChange={(e) => setReport(e.target.value)} />
        <pre className="report-preview" aria-label="回報內容預覽">{reportText()}</pre>
        <div className="actions">
          <button type="button" className="btn" onClick={copyReport} disabled={!report.trim()}>複製回報內容</button>
          <button type="button" className="btn btn-secondary" onClick={downloadReport} disabled={!report.trim()}>下載文字檔</button>
        </div>
        <p role="status">{copyMsg}</p>
        <p className="muted">目前沒有線上回報表單，請把內容交給題庫維護者。</p>
      </details>

      <nav className="actions" aria-label="換題">
        {index > 1 && <a className="btn btn-secondary" href={app.quizHref(index - 1)}>上一題</a>}
        {index < total ? <a className="btn" href={app.quizHref(index + 1)}>下一題</a> : <a className="btn" href={app.endHref}>看回顧</a>}
      </nav>
    </article>
  );
}
