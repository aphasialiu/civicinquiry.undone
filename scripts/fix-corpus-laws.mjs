import { readFileSync, writeFileSync } from 'node:fs';
const f = 'src/authoring/corpus.ts';
let t = readFileSync(f, 'utf8');
t = t.replace("const LAW_ALIAS: Array<[RegExp, string]> = [[/增修/, 'A0000002'], [/程序法|行政程序/, 'A0030055'], [/憲法/, 'A0000001']];",
  "const LAW_ALIAS: Array<[RegExp, string]> = [[/增修/, 'A0000002'], [/程序法|行政程序/, 'A0030055'], [/公投|公民投票/, 'D0020050'], [/政治獻金|獻金/, 'D0020049'], [/憲法/, 'A0000001']];");
t = t.replace("const ORDER = ['A0000001', 'A0000002', 'A0030055'];", "const ORDER = ['A0000001', 'A0000002', 'D0020050', 'D0020049', 'A0030055'];");
t = t.replace("/^[\s第條憲法增修行政程序\d-]*$/", "/^[\s第條憲法增修行政程序公投公民投票政治獻金\d-]*$/");
writeFileSync(f, t);
console.log(t.includes('D0020050'), t.includes('公投公民投票政治獻金'));
