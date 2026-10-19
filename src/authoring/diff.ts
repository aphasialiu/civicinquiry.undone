// 版本差異與修訂：對正解、情境、法源適用範圍的變動要升版並重審；純文字修正只升 patch，但仍是新的不可變版本。
import { stableStringify } from '../core/hash';
import type { Item, QuizPackage } from '../core/types';

export type Severity = 'answer' | 'text';

export interface Change {
  /** 題目 ID；題庫層級的變動為 null */
  itemId: string | null;
  path: string;
  label: string;
  kind: 'added' | 'removed' | 'changed';
  before: string | null;
  after: string | null;
  severity: Severity;
}

const LABELS: Array<[RegExp, string]> = [
  [/^\/knowledge\/correctOptionIds/, '正解'],
  [/^\/knowledge\/options/, '知識題選項'],
  [/^\/knowledge\/type/, '題型'],
  [/^\/knowledge\/prompt/, '知識題題幹'],
  [/^\/knowledge\/rationale/, '依據說明'],
  [/^\/context/, '情境'],
  [/^\/validity\/knowledgeVersion/, '知識版本說明'],
  [/^\/validity/, '適用期間'],
  [/^\/jurisdiction/, '法域'],
  [/^\/evidenceIds/, '證據來源'],
  [/^\/readingIds/, '延伸閱讀'],
  [/^\/intuition/, '第一階段（直覺）'],
  [/^\/explanation\/short/, '核心解釋'],
  [/^\/explanation/, '深入說明'],
  [/^\/discussionPrompts/, '討論問題'],
  [/^\/search/, '探索設定'],
  [/^\/topic/, '主題'],
  [/^\/concepts/, '概念'],
  [/^\/epistemic|^\/disputeScope/, '爭議程度'],
  [/^\/governance/, '治理聲明'],
];
const labelOf = (p: string) => LABELS.find(([re]) => re.test(p))?.[1] ?? p;

// 這些欄位一變，舊的審查就不再適用
const ANSWER_LEVEL = /^\/(knowledge\/(correctOptionIds|options|type)|context|validity|jurisdiction|evidenceIds)/;
const NEUTRAL = /^\/(governance|version|extensions)/; // 版本號與治理聲明由修訂流程管理，不當作內容變動

function leaves(v: unknown, path = '', out: Map<string, string> = new Map()): Map<string, string> {
  if (Array.isArray(v)) {
    if (v.length === 0) out.set(path, '[]');
    v.forEach((x, i) => leaves(x, `${path}/${i}`, out));
  } else if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 0) out.set(path, '{}');
    for (const k of keys) leaves((v as Record<string, unknown>)[k], `${path}/${k}`, out);
  } else {
    out.set(path, JSON.stringify(v));
  }
  return out;
}

function diffLeaves(a: unknown, b: unknown, itemId: string | null, labelFn: (p: string) => string, sev: (p: string) => Severity | null): Change[] {
  const la = leaves(a), lb = leaves(b);
  const out: Change[] = [];
  for (const p of new Set([...la.keys(), ...lb.keys()])) {
    const x = la.get(p), y = lb.get(p);
    if (x === y) continue;
    const s = sev(p);
    if (s === null) continue;
    out.push({
      itemId, path: p, label: labelFn(p), kind: x === undefined ? 'added' : y === undefined ? 'removed' : 'changed',
      before: x === undefined ? null : x, after: y === undefined ? null : y, severity: s,
    });
  }
  return out;
}

export function diffPackages(a: QuizPackage, b: QuizPackage): Change[] {
  const out: Change[] = [];
  const meta = (p: QuizPackage) => ({ title: p.title, description: p.description, license: p.license, locale: p.locale, authors: p.authors, sources: p.sources });
  out.push(...diffLeaves(meta(a), meta(b), null, (p) => (p.startsWith('/sources') ? '來源' : p.startsWith('/authors') ? '作者' : p), () => 'text'));

  const ma = new Map(a.items.map((i) => [i.id, i])), mb = new Map(b.items.map((i) => [i.id, i]));
  for (const [id, it] of ma) if (!mb.has(id)) out.push({ itemId: id, path: '', label: '刪除整題', kind: 'removed', before: it.topic, after: null, severity: 'answer' });
  for (const [id, it] of mb) {
    const old = ma.get(id);
    if (!old) { out.push({ itemId: id, path: '', label: '新增整題', kind: 'added', before: null, after: it.topic, severity: 'answer' }); continue; }
    out.push(...diffLeaves(old, it, id, labelOf, (p) => (NEUTRAL.test(p) ? null : ANSWER_LEVEL.test(p) ? 'answer' : 'text')));
  }
  return out;
}

export type Bump = 'patch' | 'minor' | null;

export function suggestBump(changes: Change[]): Bump {
  if (changes.length === 0) return null;
  return changes.some((c) => c.severity === 'answer') ? 'minor' : 'patch';
}

export function bumpVersion(v: string, bump: Exclude<Bump, null>): string {
  const [maj, min, pat] = v.split('.').map(Number);
  return bump === 'minor' ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`;
}

const changedItem = (id: string, changes: Change[]) => changes.filter((c) => c.itemId === id);

/**
 * 完成修訂：只對有變動的題目升版（題目版本不可變，沒變的題保持原版本與原審查聲明），
 * 變動的題目重置為未審查，舊審查不沿用；記錄修訂原因與被取代的版本。題庫本身也升版。
 */
export function finalizeRevision(baseline: QuizPackage, draft: QuizPackage, reason: string): QuizPackage {
  const changes = diffPackages(baseline, draft);
  const bump = suggestBump(changes);
  if (!bump) return draft;
  const oldById = new Map(baseline.items.map((i) => [i.id, i]));
  const items: Item[] = draft.items.map((it) => {
    const old = oldById.get(it.id);
    const mine = changedItem(it.id, changes);
    if (old && mine.length === 0) return it;
    const itemBump: Exclude<Bump, null> = old ? (mine.some((c) => c.severity === 'answer') ? 'minor' : 'patch') : 'minor';
    return {
      ...it,
      version: old ? bumpVersion(old.version, itemBump) : it.version,
      governance: { ...it.governance, lifecycle: 'draft', verification: 'unreviewed', lastReviewedAt: null, reviewers: [] },
      extensions: { ...(it.extensions ?? {}), 'civic.revision': { reason, supersedes: old?.version ?? null } },
    };
  });
  return { ...draft, version: bumpVersion(baseline.version, bump), items };
}

export const sameContent = (a: unknown, b: unknown) => stableStringify(a, 0) === stableStringify(b, 0);
