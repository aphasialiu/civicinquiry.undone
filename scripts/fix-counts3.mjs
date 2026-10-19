import { readFileSync, writeFileSync } from 'node:fs';
function sub(file, pairs) {
  let t = readFileSync(file, 'utf8');
  for (const [a, b] of pairs) {
    if (!t.includes(a)) { console.log('MISSING', file, JSON.stringify(a.slice(0, 50))); continue; }
    t = t.split(a).join(b);
  }
  writeFileSync(file, t);
}
sub('tests/e2e/ideas.spec.ts', [['toHaveCount(8)', 'toHaveCount(11)']]);
sub('tests/e2e/singlefile.spec.ts', [['toHaveCount(8)', 'toHaveCount(11)']]);
sub('tests/e2e/pilot.spec.ts', [["作答 0 題／共 8 題", "作答 0 題／共 11 題"]]);
sub('tests/e2e/corpus.spec.ts', [['n <= 8; n++', 'n <= 11; n++'], ['const isReflection = n === 5;', 'const isReflection = n === 5 || n === 11;']]);
console.log('ok');
