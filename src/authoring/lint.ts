// 出題提醒（不擋匯出）：幫作者避開「很明顯的錯誤」。結構性錯誤由 validator 負責，這裡只提醒品質問題。
import type { Item, QuizPackage } from '../core/types';
import { PLACEHOLDER } from './ideas';
import { quoteIsOfficial } from './corpus';
import { stripAnswerLead } from '../core/text';

export interface Hint {
  /** 題目索引；題庫層級為 null */
  item: number | null;
  code: 'PLACEHOLDER' | 'QUOTE_NOT_OFFICIAL' | 'SHORT_EXPLANATION' | 'LONGEST_CORRECT' | 'DUP_OPTIONS' | 'ALL_NEGATIVE' | 'SAME_POSITION' | 'WEAK_LOCATOR' | 'TOPIC_LEAK';
  message: string;
}

const len = (s: string) => [...s].length;

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
}

function itemHints(pkg: QuizPackage, it: Item, i: number): Hint[] {
  const out: Hint[] = [];
  const add = (code: Hint['code'], message: string) => out.push({ item: i, code, message });

  const left = strings({ ...it, governance: undefined }).filter((s) => s.includes(PLACEHOLDER)).length;
  if (left > 0) add('PLACEHOLDER', `還有 ${left} 個欄位是範本文字（含「${PLACEHOLDER}」），請改成你自己的內容。`);

  const shown = len(stripAnswerLead(it.explanation.short)) + len(it.explanation.mechanism);
  if (it.knowledge.type !== 'reflection' && shown < 60 && !it.explanation.short.includes(PLACEHOLDER)) {
    add('SHORT_EXPLANATION', `解釋只有 ${shown} 字，太短了。請寫出核心差異，以及這個規定在做什麼（約 60 字以上）。`);
  }

  {
    const labels = it.knowledge.options.map((o) => o.label.trim());
    if (new Set(labels).size < labels.length) add('DUP_OPTIONS', '有兩個選項的文字完全一樣。');
    const correct = it.knowledge.options.filter((o) => it.knowledge.correctOptionIds.includes(o.id));
    const others = it.knowledge.options.filter((o) => !it.knowledge.correctOptionIds.includes(o.id));
    if (correct.length === 1 && others.length > 0) {
      const maxOther = Math.max(...others.map((o) => len(o.label)));
      if (len(correct[0].label) > 12 && len(correct[0].label) >= maxOther * 1.5) {
        add('LONGEST_CORRECT', '正解比其他選項長很多，不看題目也能猜到。請讓各選項長度相近。');
      }
    }
    if (correct.length === 1 && len(it.topic) >= 6) {
      const key = correct[0].label.replace(/[，。、；：「」\s]/g, '').slice(0, 6);
      if (key.length >= 6 && it.topic.replace(/\s/g, '').includes(key)) add('TOPIC_LEAK', '標題和正解幾乎一樣，會洩漏答案。');
    }
  }
  const basisRaw = it.extensions?.['civic.basis'];
  for (const b of (Array.isArray(basisRaw) ? basisRaw : []) as Array<{ sourceId?: string; quote?: string }>) {
    const src = pkg.sources.find((s) => s.id === b.sourceId);
    if (src && b.quote && quoteIsOfficial(src.url, b.quote) === false) add('QUOTE_NOT_OFFICIAL', `「${b.quote.slice(0, 16)}…」不是官方條文的逐字內容，請確認有沒有打錯，或和官方網站核對。`);
  }
  const used = it.evidenceIds.map((id) => pkg.sources.find((s) => s.id === id)).filter(Boolean);
  if (used.some((s) => len(s!.locator.trim()) < 4)) add('WEAK_LOCATOR', '有來源的「定位」太短或沒寫（條號、段落、頁碼），讀者會找不到。');
  return out;
}

export function lintPackage(pkg: QuizPackage): Hint[] {
  const out: Hint[] = pkg.items.flatMap((it, i) => itemHints(pkg, it, i));
  const scored = pkg.items.filter((i) => i.knowledge.type === 'single' && i.knowledge.correctOptionIds.length === 1);
  if (scored.length >= 4) {
    const neg = scored.filter((i) => /^(否|不|不能|不可以|不會|沒有)/.test(i.knowledge.options.find((o) => o.id === i.knowledge.correctOptionIds[0])?.label ?? ''));
    if (neg.length === scored.length) out.push({ item: null, code: 'ALL_NEGATIVE', message: '每一題的正解都是「否／不能」，讀者會學到「選否就對」的捷徑。請混入正解是肯定的題目。' });
    if (new Set(scored.map((i) => i.knowledge.correctOptionIds[0])).size === 1 && scored.length >= 5) {
      out.push({ item: null, code: 'SAME_POSITION', message: '每一題的正解都在同一個位置，請打散。' });
    }
  }
  return out;
}
