// 單一檔案版：題庫放在 <script type="application/json" id="civic-data"> 裡。
// 內容一樣當成不可信資料，走完整驗證；驗證失敗整份不啟用。
import { validateText } from './core/validator';
import type { QuizPackage, ValidationError } from './core/types';

export type Embedded = { kind: 'none' } | { kind: 'ok'; pkg: QuizPackage } | { kind: 'error'; errors: ValidationError[] };

// 用字串相加組出來，避免完整的標記字串出現在打包後的 JS 裡（單一檔案版會把 JS 內嵌進 HTML）
export const EMBED_MARKER = '<script type="application/json" id="civic-' + 'data">null</' + 'script>';

export function readEmbedded(doc: Document = document): Embedded {
  const el = doc.getElementById('civic-data');
  const text = el?.textContent?.trim();
  if (!text || text === 'null') return { kind: 'none' };
  const r = validateText(text);
  return r.ok && r.pkg ? { kind: 'ok', pkg: r.pkg } : { kind: 'error', errors: r.errors };
}
