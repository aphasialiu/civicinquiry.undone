// 「可閱讀的文件」：把題庫排成人看得懂的一份網頁，給審查的人看（可列印或存成 PDF），不需要任何工具。
// 全部文字都經過跳脫，內容不會被當成網頁標籤執行。
import type { QuizPackage } from '../core/types';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const para = (s: string) => esc(s).split('\n').join('<br>');

export function readableFilename(pkg: QuizPackage): string {
  return `${safeName(pkg.title)}-審查用文件.html`;
}

export function safeName(s: string): string {
  const cleaned = [...s].map((c) => (/[\\/:*?"<>|\u0000-\u001f]/.test(c) ? '_' : c)).join('').trim();
  return cleaned.slice(0, 60) || '題庫';
}

export function renderReadable(pkg: QuizPackage, now: Date): string {
  const letter = (i: number) => String.fromCharCode(65 + i);
  const items = pkg.items
    .map((it, n) => {
      const basisRaw = it.extensions?.['civic.basis'];
      const basis = (Array.isArray(basisRaw) ? basisRaw : []) as Array<{ sourceId?: string; quote?: string; locator?: string }>;
      const isRef = it.knowledge.type === 'reflection';
      const notesRaw = it.extensions?.['civic.option-notes'];
      const notes = (notesRaw && typeof notesRaw === 'object' ? notesRaw : {}) as Record<string, string>;
      const viewsRaw = it.extensions?.['civic.views'];
      const views = (Array.isArray(viewsRaw) ? viewsRaw : []) as Array<{ label?: string; text?: string }>;
      const viewsHtml = views.length ? '<h3>各方最有力的論點</h3><ul>' + views.map((v) => '<li><strong>' + esc(v.label ?? '') + '</strong>：' + esc(v.text ?? '') + '</li>').join('') + '</ul>' : '';
      const options = it.knowledge.options
        .map((o, i) => {
          const ok = it.knowledge.correctOptionIds.includes(o.id);
          const note = notes[o.id] ? `<div class="meta">隱含的前提：${esc(notes[o.id])}</div>` : '';
          return `<li${ok ? ' class="ok"' : ''}>${letter(i)}. ${esc(o.label)}${ok ? '　<strong>★ 憲政體制的答案</strong>' : ''}${note}</li>`;
        })
        .join('');
      const sources = it.evidenceIds
        .map((id) => pkg.sources.find((s) => s.id === id))
        .filter((s): s is NonNullable<typeof s> => !!s)
        .map((s) => {
          const mine = basis.filter((b) => b.sourceId === s.id && b.quote);
          const quotes = mine.map((b) => `<div><strong>${esc(b.locator ?? s.locator)}</strong><blockquote>${para(b.quote!)}</blockquote></div>`).join('');
          return `<li>${quotes || `<strong>${esc(s.locator)}</strong>`}（${esc(s.title)}，${esc(s.publisher)}）<div class="url">${esc(s.url)}</div></li>`;
        })
        .join('');
      return `
<section class="item">
  <h2>第 ${n + 1} 題：${esc(it.topic)}</h2>
  <p class="meta">題目代號 ${esc(it.id)}｜版本 ${esc(it.version)}｜適用 ${esc(it.jurisdiction)}｜依據 ${esc(it.validity.asOf)} 的規定</p>
  <h3>聽起來很有道理的話</h3><p class="quote-line">「${esc(it.intuition.prompt)}」</p>
  <h3>情境</h3><p>${para(it.context)}</p>
  <h3>問題</h3><p>${para(it.knowledge.prompt)}</p>
  ${isRef ? '<p>（沒有標準答案：以下每個選項都是一種常見的想法）</p>' : ''}<ol class="opts">${options}</ol>
  <h3>${isRef ? '可以這樣想' : '憲政體制的答案'}</h3><p>${para(it.explanation.short)}</p>
  ${viewsHtml}
  <h3>依據</h3><ul>${sources || '<li>（尚未填寫）</li>'}</ul>
  <h3>解釋</h3><p>${para(it.explanation.mechanism)}</p>
  <h3>為什麼直覺會出問題</h3><p>${para(it.explanation.misconception)}</p>
  <h3>制度理由</h3><p>${para(it.explanation.possibleReasons)}</p>
  <h3>其他作法</h3><p>${para(it.explanation.alternatives)}</p>
  <h3>這題沒有回答什麼</h3><p>${para(it.explanation.limitations)}</p>
  <div class="review">
    <h3>審查意見（請在這裡寫）</h3>
    <p>☐ 內容正確　☐ 需要修改　☐ 不建議使用</p>
    <p class="lines">意見：<br><br><br></p>
  </div>
</section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="${esc(pkg.locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pkg.title)}（審查用文件）</title>
<style>
  body { font-family: system-ui, "Noto Sans TC", "Microsoft JhengHei", sans-serif; line-height: 1.7; max-width: 46rem; margin: 2rem auto; padding: 0 1rem; color: #111; }
  h1 { font-size: 1.6rem; } h2 { font-size: 1.3rem; margin-top: 2.5rem; border-bottom: 2px solid #999; padding-bottom: .25rem; }
  h3 { font-size: 1rem; margin: 1rem 0 .2rem; color: #444; }
  .meta, .url { color: #666; font-size: .85rem; overflow-wrap: anywhere; }
  .opts li.ok { background: #e6f4ea; } .opts { padding-left: 1.5rem; }
  blockquote { margin: .3rem 0; padding: .3rem .8rem; border-left: 4px solid #0b5cad; background: #eef4fb; }
  .quote-line { font-style: italic; } .review { border: 1px dashed #999; padding: .5rem 1rem; margin-top: 1rem; }
  .item { page-break-inside: avoid; }
  @media print { body { margin: 0; } h2 { page-break-before: always; } h2:first-of-type { page-break-before: auto; } }
</style>
</head>
<body>
<h1>${esc(pkg.title)}</h1>
<p>${para(pkg.description)}</p>
<p class="meta">共 ${pkg.items.length} 題｜題庫版本 ${esc(pkg.version)}｜產生於 ${esc(now.toISOString().slice(0, 10))}｜<strong>這是給審查的人閱讀的草稿，尚未經過專業審查。</strong></p>
${items}
</body>
</html>
`;
}
