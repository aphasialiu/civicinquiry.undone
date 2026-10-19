// 翻譯關係（LANG001、FR-13）：譯本綁定原版固定版本、獨立審查；原版更動時譯本標示「待更新」。
import type { Item, QuizPackage, ValidationError } from './types';

export interface TranslationIssue {
  itemId: string;
  locale: string;
  /** missing_source：找不到被翻譯的原題；outdated：原題已升版，譯文還停在舊版 */
  kind: 'missing_source' | 'outdated';
  originalVersion?: string;
  translatedFrom?: string;
}

const key = (id: string, locale: string) => `${id}@${locale}`;

/** 跨題庫檢查：回傳每個譯題的狀態。沒問題的譯題不會出現在結果中。 */
export function checkTranslations(packs: QuizPackage[]): TranslationIssue[] {
  const originals = new Map<string, Item>();
  for (const p of packs) for (const it of p.items) if (!it.translationOf) originals.set(key(it.id, it.language), it);
  const out: TranslationIssue[] = [];
  for (const p of packs) {
    for (const it of p.items) {
      const t = it.translationOf;
      if (!t) continue;
      const orig = originals.get(key(t.id, t.locale));
      if (!orig) { out.push({ itemId: it.id, locale: it.language, kind: 'missing_source' }); continue; }
      if (orig.version !== t.version) out.push({ itemId: it.id, locale: it.language, kind: 'outdated', originalVersion: orig.version, translatedFrom: t.version });
    }
  }
  return out;
}

export function translationErrors(packs: QuizPackage[]): ValidationError[] {
  const errs: ValidationError[] = [];
  for (const issue of checkTranslations(packs)) {
    if (issue.kind !== 'missing_source') continue;
    const pi = packs.findIndex((p) => p.items.some((i) => i.id === issue.itemId && i.language === issue.locale));
    const ii = packs[pi].items.findIndex((i) => i.id === issue.itemId && i.language === issue.locale);
    errs.push({ path: `/items/${ii}/translationOf`, code: 'LANG001', message: `${packs[pi].quizId}/${issue.itemId}：找不到被翻譯的原題` });
  }
  return errs;
}

export const OUTDATED_PREFIX = 'translation_outdated:';

/** 原文中「這個語系還沒有譯文」的題目。 */
export function untranslated(original: QuizPackage, translation: QuizPackage): Item[] {
  const done = new Set(translation.items.filter((i) => i.translationOf).map((i) => i.translationOf!.id));
  return original.items.filter((i) => !done.has(i.id));
}
