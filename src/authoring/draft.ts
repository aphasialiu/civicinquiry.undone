// 作者草稿模型。草稿就是一份「可能還不合法」的 QuizPackage；
// 表單用 JSON 路徑讀寫欄位，驗證錯誤的 path 也是 JSON 路徑，所以能直接對應到欄位。
import type { Item, QuizPackage, Source } from '../core/types';

export type Path = ReadonlyArray<string | number>;

export interface DraftRecord {
  pkg: QuizPackage;
  /** 從已發布版本建立修訂時，保存當時的原版，用來算差異與版本號 */
  baseline: QuizPackage | null;
}

export function getIn(obj: unknown, path: Path): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur;
}

/** 不可變更新：只複製路徑上的節點。 */
export function setIn<T>(obj: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  const copy: unknown = Array.isArray(obj) ? [...obj] : { ...(obj as object) };
  (copy as Record<string | number, unknown>)[head] = setIn((obj as Record<string | number, unknown>)?.[head], rest, value);
  return copy as T;
}

export function pointerOf(path: Path): string {
  return path.map((p) => '/' + String(p).replace(/~/g, '~0').replace(/\//g, '~1')).join('');
}

export function dayString(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function slugify(s: string, fallback: string): string {
  const slug = s.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return /^[a-z0-9]/.test(slug) ? slug : fallback;
}

export function blankSource(n: number, now: Date): Source {
  return { id: `source-${n}`, title: '', url: 'https://', type: 'official', publisher: '', publishedAt: null, accessedAt: dayString(now), locator: '', rights: 'link_only' };
}

export function blankItem(pkg: QuizPackage, n: number, now: Date): Item {
  const from = new Date(now.getTime() - 60_000);
  const due = new Date(now.getTime() + 180 * 24 * 3600 * 1000);
  return {
    id: `item-${n}`, version: '0.1.0', authorIds: [pkg.authors[0]?.id ?? 'author-1'], concepts: [`${pkg.namespace}.concept-${n}`],
    topic: '', language: pkg.locale, jurisdiction: 'global', context: '',
    intuition: { kind: 'value', prompt: '', options: [{ id: 'v1', label: '較同意' }, { id: 'v2', label: '較不同意' }, { id: 'v3', label: '尚無主張' }] },
    knowledge: { type: 'single', prompt: '', options: [{ id: 'a', label: '' }, { id: 'b', label: '' }, { id: 'c', label: '' }], correctOptionIds: [], rationale: '' },
    explanation: { short: '', mechanism: '', possibleReasons: '', alternatives: '', limitations: '', misconception: '' },
    epistemic: 'settled', disputeScope: 'none', evidenceIds: [], readingIds: [], discussionPrompts: [''],
    search: { profileId: `${pkg.quizId}-${n}`, keywords: [''], categories: ['news', 'official'], region: 'global', language: pkg.locale },
    validity: { asOf: dayString(now), validFrom: from.toISOString(), validUntil: null, reviewDueAt: due.toISOString(), knowledgeVersion: '' },
    governance: { lifecycle: 'draft', verification: 'unreviewed', lastReviewedAt: null, reviewers: [], notes: '作者草稿，尚未審查。' },
  };
}

export function newQuiz(o: { namespace: string; quizId: string; title: string; locale: string; authorName: string; now: Date }): QuizPackage {
  const pkg: QuizPackage = {
    schemaVersion: '1.0.0', namespace: o.namespace, quizId: o.quizId, version: '0.1.0', title: o.title, description: '', locale: o.locale,
    direction: 'ltr', license: 'UNLICENSED',
    authors: [{ id: slugify(o.authorName, 'author-1'), displayName: o.authorName, credentialText: '' }],
    sources: [], items: [],
  };
  pkg.items.push(blankItem(pkg, 1, o.now));
  return pkg;
}

export function addItem(pkg: QuizPackage, now: Date): QuizPackage {
  const used = new Set(pkg.items.map((i) => i.id));
  let n = pkg.items.length + 1;
  while (used.has(`item-${n}`)) n++;
  return { ...pkg, items: [...pkg.items, blankItem(pkg, n, now)] };
}

export function addSource(pkg: QuizPackage, now: Date): QuizPackage {
  const used = new Set(pkg.sources.map((s) => s.id));
  let n = pkg.sources.length + 1;
  while (used.has(`source-${n}`)) n++;
  return { ...pkg, sources: [...pkg.sources, blankSource(n, now)] };
}

export function removeAt<T>(arr: readonly T[], i: number): T[] {
  return arr.filter((_, k) => k !== i);
}

export function moveAt<T>(arr: readonly T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return [...arr];
  const c = [...arr];
  [c[i], c[j]] = [c[j], c[i]];
  return c;
}

/** 刪除來源時，同步從各題的證據／延伸閱讀清單移除，避免留下懸空參照。 */
export function removeSource(pkg: QuizPackage, index: number): QuizPackage {
  const id = pkg.sources[index]?.id;
  return {
    ...pkg,
    sources: removeAt(pkg.sources, index),
    items: pkg.items.map((it) => ({ ...it, evidenceIds: it.evidenceIds.filter((x) => x !== id), readingIds: it.readingIds.filter((x) => x !== id) })),
  };
}
