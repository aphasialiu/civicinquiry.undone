// 匯入／匯出（CONTENT_SCHEMA §5）。V0.4 只匯入單一 .quiz.json：
// 先讀大小 → 嚴格解析 → Schema → 語意 → 衝突檢查 → 預覽差異 → 由呼叫端確認後才取代草稿。
import { stableStringify } from '../core/hash';
import { validatePackage, validateText } from '../core/validator';
import type { QuizPackage, ValidationError } from '../core/types';
import { diffPackages, sameContent, type Change } from './diff';
import { safeName } from './readable';

export type ExportResult = { ok: true; text: string; filename: string } | { ok: false; errors: ValidationError[] };

/** 正式匯出：必須通過全部驗證。鍵排序、UTF-8、LF、兩格縮排。 */
export function exportFinal(pkg: QuizPackage): ExportResult {
  const v = validatePackage(JSON.parse(JSON.stringify(pkg)));
  if (!v.ok) return { ok: false, errors: v.errors };
  return { ok: true, text: stableStringify(pkg) + '\n', filename: `${safeName(pkg.title)}（${pkg.version}）.題庫檔.json` };
}

/** 草稿匯出：可以還沒通過驗證（只用來備份或換電腦），檔名標示 draft。 */
export function exportDraft(pkg: QuizPackage): { text: string; filename: string } {
  return { text: stableStringify(pkg) + '\n', filename: `${safeName(pkg.title)}（${pkg.version}）.草稿.json` };
}

export type ImportResult =
  | { ok: false; errors: ValidationError[] }
  | {
      ok: true;
      pkg: QuizPackage;
      /** none：沒有現有草稿可比；noop：內容完全相同；collision：同版本但內容不同 */
      relation: 'none' | 'noop' | 'collision' | 'other-quiz' | 'different-version';
      changes: Change[];
      warnings: string[];
    };

const sameKey = (a: QuizPackage, b: QuizPackage) => a.namespace === b.namespace && a.quizId === b.quizId && a.locale === b.locale;

export function importText(text: string, current: QuizPackage | null): ImportResult {
  const r = validateText(text);
  if (!r.ok || !r.pkg) return { ok: false, errors: r.errors };
  const pkg = r.pkg;
  const warnings: string[] = [];

  // 匯入檔裡的審查聲明只是作者聲明，不會因此變成「已審查」；信任只來自受信任的發布目錄。
  const claimed = pkg.items.filter((i) => i.governance.verification !== 'unreviewed' || i.governance.reviewers.length > 0).length;
  if (claimed > 0) warnings.push(`有 ${claimed} 題在檔案內自稱已審查或帶有審查紀錄。這些只是作者聲明，不會被採信；平台標章只能由受信任的發布目錄授予。`);
  const notDraft = pkg.items.filter((i) => i.governance.lifecycle !== 'draft').length;
  if (notDraft > 0) warnings.push(`有 ${notDraft} 題的狀態不是草稿；正式狀態只由發布目錄決定。`);

  if (!current) return { ok: true, pkg, relation: 'none', changes: [], warnings };
  if (!sameKey(current, pkg)) return { ok: true, pkg, relation: 'other-quiz', changes: [], warnings };
  if (current.version === pkg.version) {
    if (sameContent(current, pkg)) return { ok: true, pkg, relation: 'noop', changes: [], warnings };
    // 同一個版本、內容卻不同：不自動覆蓋，也不偷偷升版
    return { ok: true, pkg, relation: 'collision', changes: diffPackages(current, pkg), warnings };
  }
  return { ok: true, pkg, relation: 'different-version', changes: diffPackages(current, pkg), warnings };
}
