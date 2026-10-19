// Validator：JSON → errors[{path,code,message}]。Schema 檢查 + CONTENT_SCHEMA 第 4 節的語意檢查。
import schema from '../schema/quiz.schema.json';
import { checkSchema } from './schemaCheck';
import { parseStrictJson, StrictJsonError } from './strictJson';
import type { Item, QuizPackage, ValidationError } from './types';

const SUPPORTED_SCHEMA_MAJOR = 1;
const AUTHORITATIVE_TYPES = new Set(['law', 'judgment', 'research', 'official']);

function esc(seg: string | number): string {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

// 不當作 Markdown 檢查的欄位（識別碼、日期、網址等）
const SKIP_PATH = new RegExp('/(id|version|language|jurisdiction|profileId|region|asOf|validFrom|validUntil|reviewDueAt|lastReviewedAt|reviewedAt|url)$');

/** 僅允許 http/https；拒絕 javascript:、data: 等。 */
export function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Markdown 只允許段落、標題、清單、強調與安全連結；內文不得出現 HTML 標籤或圖片語法。
const HTML_LIKE = /<\s*\/?\s*[a-zA-Z!][^>]*>?/;
const MD_IMAGE = /!\[[^\]]*\]\(/;
const MD_LINK = /\[[^\]]*\]\(([^)\s]*)[^)]*\)/g;

export function checkMarkdownText(text: string): string | null {
  if (HTML_LIKE.test(text)) return '內文含有 HTML 標籤，Markdown 只允許段落、標題、清單、強調與安全連結';
  if (MD_IMAGE.test(text)) return '不允許圖片語法（禁止遠端圖片）';
  for (const m of text.matchAll(MD_LINK)) {
    if (!isSafeUrl(m[1])) return `連結不安全：${m[1]}（只允許 http/https）`;
  }
  return null;
}

function collectStrings(value: unknown, path: string, out: Array<{ path: string; text: string }>): void {
  if (typeof value === 'string') out.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((v, i) => collectStrings(v, `${path}/${i}`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) collectStrings(v, `${path}/${esc(k)}`, out);
  }
}

function dupes(ids: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) (seen.has(id) ? dup : seen).add(id);
  return [...dup];
}

function validateItemSemantics(pkg: QuizPackage, item: Item, idx: number, err: (path: string, code: string, msg: string) => void) {
  const base = `/items/${idx}`;
  const sourceIds = new Set(pkg.sources.map((s) => s.id));
  const authorIds = new Set(pkg.authors.map((a) => a.id));
  const optionIds = new Set(item.knowledge.options.map((o) => o.id));

  // REF001：題內選項 ID 不得重複
  for (const d of dupes(item.knowledge.options.map((o) => o.id))) {
    err(`${base}/knowledge/options`, 'REF001', `知識題選項 ID 重複：${d}`);
  }
  for (const d of dupes(item.intuition.options.map((o) => o.id))) {
    err(`${base}/intuition/options`, 'REF001', `直覺題選項 ID 重複：${d}`);
  }

  // REF002：參照必須存在
  item.knowledge.correctOptionIds.forEach((id, i) => {
    if (!optionIds.has(id)) err(`${base}/knowledge/correctOptionIds/${i}`, 'REF002', `正解 ID「${id}」不在這一題的選項中`);
  });
  item.evidenceIds.forEach((id, i) => {
    if (!sourceIds.has(id)) err(`${base}/evidenceIds/${i}`, 'REF002', `證據來源「${id}」不存在於 sources`);
  });
  item.readingIds.forEach((id, i) => {
    if (!sourceIds.has(id)) err(`${base}/readingIds/${i}`, 'REF002', `延伸閱讀來源「${id}」不存在於 sources`);
  });
  item.authorIds.forEach((id, i) => {
    if (!authorIds.has(id)) err(`${base}/authorIds/${i}`, 'REF002', `作者「${id}」不存在於 authors`);
  });

  // EDU001：價值題不計分；反思題不得有答案
  // （schema 本來就不給 value 題正解欄位，這裡擋掉用 extensions 偷塞答案的情況）
  if (item.knowledge.type === 'reflection' && item.knowledge.correctOptionIds.length > 0) {
    err(`${base}/knowledge`, 'EDU001', '沒有標準答案的題目不能指定正解（可以有選項，但不能有正解）');
  }
  if (item.intuition.kind === 'value' && item.extensions) {
    const bad = Object.keys(item.extensions).find((k) => /score|correct/i.test(k));
    if (bad) err(`${base}/extensions/${esc(bad)}`, 'EDU001', '價值題不得附帶計分或正解資訊');
  }

  // EDU002
  if (item.disputeScope === 'answer' && item.knowledge.type !== 'reflection') {
    err(`${base}/disputeScope`, 'EDU002', '爭議觸及正解本身時，只能使用 reflection 題型');
  }
  if (item.epistemic === 'uncertain' && item.knowledge.type !== 'reflection') {
    err(`${base}/epistemic`, 'EDU002', 'epistemic=uncertain 的題目不能有標準正解，請退修或改為 reflection');
  }

  // TIME001
  const { validFrom, validUntil, reviewDueAt, asOf } = item.validity;
  const from = Date.parse(validFrom);
  const until = validUntil === null ? null : Date.parse(validUntil);
  const due = Date.parse(reviewDueAt);
  if (until !== null && !(from < until)) err(`${base}/validity/validUntil`, 'TIME001', 'validFrom 必須早於 validUntil');
  if (Date.parse(`${asOf}T23:59:59Z`) < from || (until !== null && Date.parse(`${asOf}T00:00:00Z`) >= until)) {
    err(`${base}/validity/asOf`, 'TIME001', 'asOf 必須落在有效區間內');
  }
  if (due < from) err(`${base}/validity/reviewDueAt`, 'TIME001', 'reviewDueAt 不得早於 validFrom');

  // TIME002 / GOV002（作者聲明層級；正式信任仍須發布目錄核實）
  const g = item.governance;
  if (g.verification === 'reviewed') {
    const hasDomain = g.reviewers.some((r) => r.scope === 'domain' && r.decision === 'approve');
    const hasEdu = g.reviewers.some((r) => r.scope === 'education' && r.decision === 'approve');
    if (!g.lastReviewedAt) err(`${base}/governance/lastReviewedAt`, 'TIME002', 'reviewed 必須有 lastReviewedAt');
    if (!hasDomain || !hasEdu) err(`${base}/governance/reviewers`, 'TIME002', 'reviewed 需要領域與教育兩種有效審查報告');
    if (g.lastReviewedAt && Date.parse(g.lastReviewedAt) > due) {
      err(`${base}/governance/lastReviewedAt`, 'TIME002', 'lastReviewedAt 不得晚於 reviewDueAt');
    }
  }
  g.reviewers.forEach((r, i) => {
    if (item.authorIds.includes(r.id)) err(`${base}/governance/reviewers/${i}/id`, 'GOV002', '作者不得審查自己的作品');
  });

  // GOV001：已發布且有正解者，至少一筆原始證據
  if (g.lifecycle === 'published' && item.knowledge.type !== 'reflection') {
    const ok = item.evidenceIds.some((id) => AUTHORITATIVE_TYPES.has(pkg.sources.find((s) => s.id === id)?.type ?? ''));
    if (!ok) err(`${base}/evidenceIds`, 'GOV001', '已發布且有正解的題目，至少要有一筆 law/judgment/research/official 證據');
  }

  // LANG001
  if (item.translationOf && item.translationOf.locale === item.language) {
    err(`${base}/translationOf/locale`, 'LANG001', '翻譯來源的語系不得與本題語系相同');
  }
  if (item.language !== pkg.locale && !item.translationOf) {
    err(`${base}/language`, 'LANG001', `題目語系 ${item.language} 與題庫語系 ${pkg.locale} 不同，且未標示 translationOf`);
  }
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
  /** 通過時才有值 */
  pkg?: QuizPackage;
}

/** 驗證已解析的物件（Schema + 語意 + 安全）。 */
export function validatePackage(data: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const err = (path: string, code: string, message: string) => errors.push({ path, code, message });

  // 未知 major 一律拒絕，不猜
  const sv = (data as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof sv === 'string') {
    const major = Number(sv.split('.')[0]);
    if (Number.isFinite(major) && major !== SUPPORTED_SCHEMA_MAJOR) {
      return { ok: false, errors: [{ path: '/schemaVersion', code: 'SCHEMA_UNSUPPORTED', message: `不支援的格式主版本 ${sv}，請升級引擎` }] };
    }
  }

  const issues = checkSchema(schema as Record<string, unknown>, data);
  if (issues.length) {
    for (const e of issues) err(e.instancePath, 'SCHEMA', e.message);
    // 即使格式還沒補齊，也先指出不安全的文字（讓作者一次看到，不必修完格式才發現）
    const raw: Array<{ path: string; text: string }> = [];
    collectStrings(data, '', raw);
    for (const { path, text } of raw) {
      if (SKIP_PATH.test(path)) continue;
      const msg = checkMarkdownText(text);
      if (msg) err(path, 'SEC001', msg);
    }
    return { ok: false, errors };
  }

  const pkg = data as unknown as QuizPackage;

  // REF001：跨題庫範圍的 ID 重複
  for (const d of dupes(pkg.sources.map((s) => s.id))) err('/sources', 'REF001', `來源 ID 重複：${d}`);
  for (const d of dupes(pkg.authors.map((a) => a.id))) err('/authors', 'REF001', `作者 ID 重複：${d}`);
  for (const d of dupes(pkg.items.map((i) => `${i.id}@${i.version}@${i.language}`))) err('/items', 'REF001', `題目（id/version/language）重複：${d}`);

  pkg.sources.forEach((s, i) => {
    if (!isSafeUrl(s.url)) err(`/sources/${i}/url`, 'SEC001', `來源網址不安全：${s.url}`);
    if (s.type === 'law' || s.type === 'judgment') {
      if (!s.locator || s.locator.trim().length < 4) err(`/sources/${i}/locator`, 'GOV002', '支援正解的來源需有定位（條號／段落），不能只寫網站首頁');
    }
  });

  pkg.items.forEach((item, idx) => validateItemSemantics(pkg, item, idx, err));

  // SEC001：全部文字欄位的 Markdown 安全（來源網址已另外檢查）
  const strings: Array<{ path: string; text: string }> = [];
  pkg.items.forEach((it, i) => collectStrings(it, `/items/${i}`, strings));
  collectStrings({ title: pkg.title, description: pkg.description }, '', strings);
  for (const { path, text } of strings) {
    if (/\/(id|version|language|jurisdiction|profileId|region|asOf|validFrom|validUntil|reviewDueAt|lastReviewedAt|reviewedAt)$/.test(path)) continue;
    const msg = checkMarkdownText(text);
    if (msg) err(path, 'SEC001', msg);
  }

  return errors.length ? { ok: false, errors } : { ok: true, errors, pkg };
}

/** 從原始文字驗證：先嚴格解析（重複鍵、原型污染鍵、大小、深度），再驗 Schema 與語意。 */
export function validateText(text: string): ValidationResult {
  let data: unknown;
  try {
    data = parseStrictJson(text);
  } catch (e) {
    if (e instanceof StrictJsonError) {
      const code = e.code === 'SYNTAX' ? 'JSON_SYNTAX' : e.code === 'TOO_LARGE' ? 'SEC001' : e.code === 'TOO_DEEP' ? 'SEC001' : 'SEC002';
      return { ok: false, errors: [{ path: e.path, code, message: e.message }] };
    }
    throw e;
  }
  return validatePackage(data);
}
