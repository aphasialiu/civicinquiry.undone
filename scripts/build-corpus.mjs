// 從「全國法規資料庫」抓取法條原文，做成作者工具內建的素材庫（離線可查、不需要任何 AI）。
// 用法：node scripts/build-corpus.mjs [pcode ...]（預設：憲法、憲法增修條文、行政程序法）
// 內容只存條文文字與官方連結；一律以官方網站為準，查閱日會一併記錄。
// 自我檢查：每一條解析出的段落數，必須等於原始網頁裡的段落數；不一致就中止，不寫檔。
import { writeFileSync } from 'node:fs';

const DEFAULT = ['A0000001', 'A0000002', 'A0030055'];
const pcodes = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT;

const decode = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

/** 回傳條文文字，以及原始網頁裡這一條的段落數（用來自我檢查）。 */
function parseArticle(html, label) {
  const rawCount = (html.match(/<div class="line-/g) ?? []).length;
  const lines = [...html.matchAll(/<div class="line-\d+[^"]*"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => decode(m[1].replace(/<[^>]+>/g, '')).trim()).filter(Boolean);
  if (rawCount === 0) return decode(html.replace(/<[^>]+>/g, '')).trim();
  if (lines.length !== rawCount) throw new Error(`${label}: 網頁有 ${rawCount} 段，只解析到 ${lines.length} 段`);
  return lines.join('\n');
}

async function fetchLaw(pcode) {
  const url = `https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=${pcode}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${pcode}: HTTP ${res.status}`);
  const html = await res.text();
  const name = decode((/<title>\s*([\s\S]*?)\s*[-－|｜]/.exec(html)?.[1] ?? pcode).trim());
  const body = html.slice(html.indexOf('law-reg-content'));
  const articles = [];
  let chapter = '';
  // 文章區塊結尾是：最後一段的 </div>、law-article 的 </div>、col-data 的 </div>、row 的 </div>。
  // 內容群組必須「包含」最後一段的 </div>，否則最後一段會被吃掉。
  const re = /<div class="h3 char-2">\s*([\s\S]*?)<\/div>|<div class="row"><div class="col-no">\s*<a href="LawSingle\.aspx\?pcode=[A-Z0-9]+&(?:amp;)?flno=([0-9-]+)"[^>]*>([\s\S]*?)<\/a><\/div><div class="col-data"><div class="law-article">([\s\S]*?<\/div>)<\/div>\s*<\/div><\/div>/g;
  for (const m of body.matchAll(re)) {
    if (m[1] !== undefined) { chapter = decode(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim(); continue; }
    const label = decode(m[3]).replace(/\s+/g, ' ').trim();
    articles.push({ no: m[2], label, chapter, text: parseArticle(m[4], `${name}${label}`) });
  }
  if (articles.length === 0) throw new Error(`${pcode}: 解析不到任何條文（網站版面可能改了）`);
  // 條數也要和網頁一致
  const rowCount = (body.match(/<div class="row"><div class="col-no">\s*<a href="LawSingle/g) ?? []).length;
  if (rowCount !== articles.length) throw new Error(`${name}: 網頁有 ${rowCount} 條，只解析到 ${articles.length} 條`);
  return { pcode, name, url, articles };
}

const laws = [];
for (const p of pcodes) { const l = await fetchLaw(p); laws.push(l); console.log(`✓ ${l.name}（${p}）${l.articles.length} 條`); }
const out = { fetchedAt: new Date().toISOString().slice(0, 10), source: '全國法規資料庫 https://law.moj.gov.tw/（一律以官方網站為準）', laws };
writeFileSync('src/data/corpus.json', JSON.stringify(out, null, 1) + '\n', 'utf8');
