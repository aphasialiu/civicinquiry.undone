// 安全的 Markdown 子集渲染（SEC-01）：段落、標題、清單、強調、安全連結。
// 全部輸出為 React 元素，不使用 dangerouslySetInnerHTML；其他語法一律當純文字。
import { Fragment, type ReactNode } from 'react';
import { isSafeUrl } from '../core/validator';

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)\s]+\))/g;

function inline(text: string, keyBase: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(part)) return <em key={key}>{part.slice(1, -1)}</em>;
    const m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (m) {
      if (!isSafeUrl(m[2])) return <Fragment key={key}>{m[1]}</Fragment>;
      return <a key={key} href={m[2]} target="_blank" rel="noopener noreferrer">{m[1]}<span className="visually-hidden">（另開新視窗，離開本站）</span></a>;
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

export function Markdown({ text, headingLevel = 3 }: { text: string; headingLevel?: 3 | 4 }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split('\n');
        const key = `b${bi}`;
        const h = /^(#{1,3})\s+(.*)$/.exec(lines[0]);
        if (h && lines.length === 1) {
          const Tag = (`h${headingLevel}`) as 'h3' | 'h4';
          return <Tag key={key}>{inline(h[2], key)}</Tag>;
        }
        if (lines.every((l) => /^[-*]\s+/.test(l))) {
          return <ul key={key}>{lines.map((l, i) => <li key={i}>{inline(l.replace(/^[-*]\s+/, ''), `${key}-${i}`)}</li>)}</ul>;
        }
        if (lines.every((l) => /^\d+[.)]\s+/.test(l))) {
          return <ol key={key}>{lines.map((l, i) => <li key={i}>{inline(l.replace(/^\d+[.)]\s+/, ''), `${key}-${i}`)}</li>)}</ol>;
        }
        return <p key={key}>{lines.map((l, i) => <Fragment key={i}>{i > 0 && <br />}{inline(l, `${key}-${i}`)}</Fragment>)}</p>;
      })}
    </>
  );
}
