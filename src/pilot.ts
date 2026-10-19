// 試答模式：給「找幾個人試答、看題目寫得好不好」用。
// 開啟方式：網址加 ?pilot=1，或單一檔案版內嵌 {"pilot":true}。一般讀者完全看不到這些功能。
// 試答紀錄是純文字，由受試者自己按下載、自己決定要不要傳回；程式不會自動送出任何東西。
import type { Item, QuizPackage } from './core/types';
import type { Attempt } from './session/attempt';

export interface PilotNote {
  /** 受試者覺得「不太可能有人會選」的選項 ID */
  unlikely: string[];
  /** 受試者寫的一句話：哪裡看不懂、卡住 */
  comment: string;
  /** 從看到題目到按下確認的秒數 */
  seconds: number | null;
}

export const emptyPilotNote = (): PilotNote => ({ unlikely: [], comment: '', seconds: null });

// 用字串相加組出來，避免完整的標記字串出現在打包後的 JS 裡（單一檔案版會把 JS 內嵌進 HTML）
export const CONFIG_MARKER = '<script type="application/json" id="civic-' + 'config">{}</' + 'script>';

export function isPilot(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has('pilot')) return true;
    const t = document.getElementById('civic-config')?.textContent;
    return !!t && (JSON.parse(t) as { pilot?: boolean }).pilot === true;
  } catch {
    return false;
  }
}

const letter = (i: number) => String.fromCharCode(65 + i);
const clip = (s: string, n: number) => ([...s].length > n ? [...s].slice(0, n).join('') + '…' : s);

/** 產生純文字的試答紀錄（人讀得懂，也方便貼進表格彙整）。 */
export function buildPilotReport(pkg: QuizPackage, attempts: Attempt[], notes: Record<string, PilotNote>, nickname: string, now: Date): string {
  const lines: string[] = [];
  lines.push('【試答紀錄】');
  lines.push(`暱稱：${nickname.trim() || '（沒有填）'}`);
  lines.push(`日期：${now.toISOString().slice(0, 10)}`);
  lines.push(`題庫：${pkg.title}（版本 ${pkg.version}）`);
  lines.push('');
  const done = pkg.items.filter((it) => attempts.some((a) => a.itemId === it.id && a.itemVersion === it.version));
  lines.push(`作答 ${done.length} 題／共 ${pkg.items.length} 題`);
  lines.push('');
  pkg.items.forEach((it: Item, n) => {
    const a = attempts.find((x) => x.itemId === it.id && x.itemVersion === it.version);
    if (!a) return;
    const note = notes[`${it.id}@${it.version}`] ?? emptyPilotNote();
    const idx = (id: string) => it.knowledge.options.findIndex((o) => o.id === id);
    const mine =
      a.answerState === 'answered'
        ? a.selectedOptionIds.map((id) => `${letter(idx(id))}（${clip(it.knowledge.options[idx(id)]?.label ?? id, 24)}）`).join('、')
        : a.answerState === 'unknown' ? '我不知道' : '直接看了答案（沒作答）';
    const verdict = it.knowledge.type === 'reflection' ? '（沒有標準答案）' : a.result === 'correct' ? '（和憲政規定一致）' : a.result === 'incorrect' ? '（和憲政規定不一樣）' : '';
    lines.push(`第 ${n + 1} 題　${it.topic}`);
    lines.push(`  我選：${mine}${a.answerState === 'answered' ? verdict : ''}`);
    if (note.seconds !== null) lines.push(`  花了：${note.seconds} 秒`);
    lines.push(`  覺得不太可能有人會選的選項：${note.unlikely.length ? note.unlikely.map((id) => letter(idx(id))).join('、') : '沒有'}`);
    lines.push(`  卡住或看不懂的地方：${note.comment.trim() || '（沒寫）'}`);
    lines.push('');
  });
  lines.push('（這份紀錄只有你按下載或複製才會產生；要不要傳給誰，由你決定。）');
  return lines.join('\n');
}
