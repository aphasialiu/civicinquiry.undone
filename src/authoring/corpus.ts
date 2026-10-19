// 內建素材庫：官方法條原文（建置時從全國法規資料庫抓下來，離線可查，不需要任何 AI）。
// 作者輸入條號或關鍵字，就能帶出條文、官方連結與定位；找不到的再自己貼。
import corpus from '../data/corpus.json';
import type { QuizPackage } from '../core/types';

export interface Article {
  law: string;
  pcode: string;
  no: string;
  label: string;
  chapter: string;
  text: string;
  url: string;
}

export interface Ruling {
  id: string;
  title: string;
  url: string;
  publisher: string;
  /** 一句話說明這個裁判在處理什麼（來自本專案已初步比對的資料） */
  note: string;
  /** 相關的條文（pcode, 條號） */
  articles: Array<[string, string]>;
}

export const CORPUS_FETCHED_AT: string = corpus.fetchedAt;
export const CORPUS_SOURCE: string = corpus.source;

export const articleUrl = (pcode: string, no: string) => `https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=${pcode}&flno=${no}`;

const ALL: Article[] = corpus.laws.flatMap((l) =>
  l.articles.map((a) => ({ law: l.name, pcode: l.pcode, no: a.no, label: a.label.replace(/\s+/g, ''), chapter: a.chapter, text: a.text, url: articleUrl(l.pcode, a.no) })),
);

export const LAWS: Array<{ pcode: string; name: string; count: number }> = corpus.laws.map((l) => ({ pcode: l.pcode, name: l.name, count: l.articles.length }));

/** 內建的重要裁判（只放連結與一句話說明；內容以憲法法庭網站為準）。 */
export const RULINGS: Ruling[] = [
  { id: 'j391', title: '司法院釋字第391號解釋', url: 'https://cons.judicial.gov.tw/docdata.aspx?fid=100&id=310572', publisher: '憲法法庭', note: '中央政府總預算案款項目節之間移動增減的限制', articles: [['A0000001', '70']] },
  { id: 'j585', title: '司法院釋字第585號解釋', url: 'https://cons.judicial.gov.tw/docdata.aspx?fid=100&id=310766', publisher: '憲法法庭', note: '國會調查權與其界限（包含不得干預審判）', articles: [['A0000001', '80']] },
  { id: 'j113-9', title: '憲法法庭113年憲判字第9號判決', url: 'https://cons.judicial.gov.tw/docdata.aspx?fid=97&id=352966', publisher: '憲法法庭', note: '聽取總統國情報告不等同可以強制總統答詢', articles: [['A0000002', '4']] },
  { id: 'j115-7', title: '憲法法庭115年憲判字第7號判決', url: 'https://cons.judicial.gov.tw/docdata.aspx?fid=38&id=352187', publisher: '憲法法庭', note: '移民業務廣告事前審查規定違憲失效（2026-10-08）', articles: [['A0000001', '23']] },
];

const LAW_ALIAS: Array<[RegExp, string]> = [[/增修/, 'A0000002'], [/程序法|行政程序/, 'A0030055'], [/公投|公民投票/, 'D0020050'], [/政治獻金|獻金/, 'D0020049'], [/選罷|選舉罷免|罷免法/, 'D0020010'], [/748|施行法/, 'B0000008'], [/憲法/, 'A0000001']];
const ORDER = ['A0000001', 'A0000002', 'D0020050', 'D0020049', 'D0020010', 'B0000008', 'A0030055'];
const sortLaw = (a: Article, b: Article) => ORDER.indexOf(a.pcode) - ORDER.indexOf(b.pcode);

/** 輸入條號（23、第23條、憲法23、增修2）或關鍵字（多個詞用空格分開，都要出現）。 */
export function searchCorpus(query: string, limit = 20): Article[] {
  const q = query.trim();
  if (!q) return [];
  const num = /(?:第\s*)?(\d+(?:-\d+)?)\s*條?/.exec(q);
  const onlyNumberish = /^[\s第條憲法增修行政程序\d-]*$/.test(q) && num;
  if (onlyNumberish && num) {
    const pcode = LAW_ALIAS.find(([re]) => re.test(q))?.[1];
    return ALL.filter((a) => a.no === num[1] && (!pcode || a.pcode === pcode)).sort(sortLaw).slice(0, limit);
  }
  const terms = q.split(/\s+/).filter(Boolean);
  const scored: Array<{ a: Article; s: number }> = [];
  for (const a of ALL) {
    if (!terms.every((t) => a.text.includes(t) || a.law.includes(t))) continue;
    const s = terms.reduce((n, t) => n + a.text.split(t).length - 1, 0);
    scored.push({ a, s });
  }
  return scored.sort((x, y) => y.s - x.s || sortLaw(x.a, y.a)).slice(0, limit).map((x) => x.a);
}

export function relatedRulings(a: Article): Ruling[] {
  return RULINGS.filter((r) => r.articles.some(([p, n]) => p === a.pcode && n === a.no));
}

/** 題庫裡有哪些題已經用到這一條（避免重複，也給作者參考）。 */
export function questionsUsing(pkg: QuizPackage, a: Article): Array<{ index: number; topic: string }> {
  const out: Array<{ index: number; topic: string }> = [];
  pkg.items.forEach((it, index) => {
    const basis = (it.extensions?.['civic.basis'] ?? []) as Array<{ quote?: string }>;
    const viaQuote = Array.isArray(basis) && basis.some((b) => typeof b.quote === 'string' && a.text.includes(b.quote));
    const viaSource = it.evidenceIds.some((id) => {
      const s = pkg.sources.find((x) => x.id === id);
      return !!s && s.url.includes(`pcode=${a.pcode}`) && (s.url.includes(`flno=${a.no}`) || new RegExp(`第\\s*${a.no}\\s*條`).test(s.locator));
    });
    if (viaQuote || viaSource) out.push({ index, topic: it.topic });
  });
  return out;
}

/** 驗證引文：是否逐字出自素材庫裡該法規的條文。沒有該法規時回傳 null（無法驗證）。 */
export function quoteIsOfficial(url: string, quote: string): boolean | null {
  const pcode = /pcode=([A-Z0-9]+)/.exec(url)?.[1];
  if (!pcode) return null;
  const law = corpus.laws.find((l) => l.pcode === pcode);
  if (!law) return null;
  return law.articles.some((a) => a.text.includes(quote.trim()));
}
