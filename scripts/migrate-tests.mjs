// 一次性：把測試從「三階段（立場→作答→把握）」改成「一頁讀完」的新流程。
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'tests/e2e';
const dropLine = [
  /getByRole\('button', \{ name: '略過這一步' \}\)\.click\(\)/,
  /getByRole\('button', \{ name: '確認，看解釋' \}\)\.click\(\)/,
  /getByRole\('button', \{ name: \/略過，直接看解釋\/ \}\)\.click\(\)/,
  /getByRole\('button', \{ name: '略過，直接看解釋' \}\)\.click\(\)/,
  /getByLabel\('(很有把握|有些把握|沒把握)'\)\.check\(\)/,
  /getByLabel\(confidence\)\.check\(\)/,
  /getByLabel\('較同意'\)\.check\(\)/,
  /getByLabel\('Agree more', \{ exact: true \}\)\.check\(\)/,
  /getByRole\('button', \{ name: '下一步' \}\)\.click\(\)/,
];
const text = [
  ['與此版本的判準一致', '和憲政規定一致'],
  ['與此版本的判準不一致', '和憲政規定不一樣'],
  ['跳過作答，直接看解釋', '直接看解釋'],
  ['否，個別項目增加仍涉及憲法上的限制。', '不能只因為總額不變就說符合。增加個別項目的支出，仍然受到憲法的限制。'],
  ['是，總額沒增加就沒有增加支出的問題。', '符合。總金額沒變，沒有多花一毛錢，所以沒問題。'],
  ['不可以僅憑這些理由，解散須符合增修條文的條件。', '不可以只憑這些理由。解散要符合憲法增修條文規定的條件。'],
  ['教育與交通的預算', '調整預算項目'],
  ['多數通過就一定合憲？', '多數支持的法律'],
  ['總統與國會衝突', '總統與國會僵持'],
  ['{ name: /第一步/ }', "{ name: '情境' }"],
  ['此版本依據的答案', '憲政體制的答案'],
];

for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
  const p = join(dir, f);
  const lines = readFileSync(p, 'utf8').split('\n');
  const out = [];
  for (const l of lines) {
    if (dropLine.some((re) => re.test(l)) && /^\s*await /.test(l) && l.trim().split(';').filter(Boolean).length === 1) continue;
    let x = l;
    for (const [a, b] of text) x = x.split(a).join(b);
    out.push(x);
  }
  writeFileSync(p, out.join('\n'));
}
console.log('done');
