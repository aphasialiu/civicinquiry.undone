// 一次性：作者工具與用語調整後，同步更新測試裡的畫面文字。
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const pairs = [
  ['下載題庫檔（.quiz.json）', '下載題庫檔'],
  ['選擇 .quiz.json', '選擇題庫檔'],
  ["'知識題題幹'", "'問題'"],
  ["'核心解釋（約 80～180 字）'", "'核心解釋（以「答案：」開頭）'"],
  ["'常見的直覺誤區'", "'為什麼直覺會出問題'"],
  ["'第一階段題幹'", "'聽起來很有道理的話'"],
  ["'2. 用一句話寫出：這條規則真正的意思是什麼？'", "'2. 用一句話寫出：憲政體制（或這條規定）真正的答案是什麼？'"],
  ['和判準不一致（1）', '和憲政規定不一樣（1）'],
  ['/和判準不一致（1）/', '/和憲政規定不一樣（1）/'],
  ['這份題庫依據的答案：', '憲政規定的答案：'],
  ["toBe('local.physics.physics.0.1.0.quiz.json')", "toBe('物理直覺（0.1.0）.題庫檔.json')"],
  ['/\\.draft\\.json$/', '/草稿\\.json$/'],
  ["await expect(mm).toContainText('當時很有把握，值得查證');\n", ''],
];

const dir = 'tests/e2e';
for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
  const p = join(dir, f);
  let t = readFileSync(p, 'utf8');
  for (const [a, b] of pairs) t = t.split(a).join(b);
  writeFileSync(p, t);
}
console.log('ok');
