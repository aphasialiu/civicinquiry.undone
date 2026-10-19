// PR-01：測驗與搜尋在程式依賴上隔離。Explorer 不得（直接或間接）引用 session 或判分模組。
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = join(__dirname, '..', 'src');
const FORBIDDEN = [/session\//, /core\/assessment/, /Attempt/, /confidence/i, /runId/, /selectedOptionIds/, /AppContext/];

describe('Explorer 與測驗隔離', () => {
  const files = readdirSync(join(src, 'explorer')).filter((f) => /\.tsx?$/.test(f));
  it('explorer 目錄至少有一個檔案', () => expect(files.length).toBeGreaterThan(0));
  for (const f of files) {
    it(`${f} 不引用作答、信心、runId 或 session`, () => {
      const text = readFileSync(join(src, 'explorer', f), 'utf8');
      // 註解可以提到這些字（說明不變條件），所以只檢查 import 行與型別／識別字
      const code = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const re of FORBIDDEN) expect(code, `${f} 命中 ${re}`).not.toMatch(re);
    });
  }
  it('搜尋面板與用戶端同樣不碰作答資料', () => {
    for (const f of ['ui/LiveSearch.tsx', 'explorer/client.ts']) {
      const code = readFileSync(join(src, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(code, f).not.toMatch(/useApp|session\/|Attempt|runId|selectedOptionIds|confidence|snapshot/i);
    }
  });
  it('Explorer 元件只收 item 與 pkg，不收 attempt', () => {
    const text = readFileSync(join(src, 'ui', 'Explorer.tsx'), 'utf8');
    expect(text).toMatch(/export function Explorer\(\{ item, pkg \}/);
    expect(text).not.toMatch(/useApp|attempt|session/i);
  });
});
