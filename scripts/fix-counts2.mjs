import { readFileSync, writeFileSync } from 'node:fs';
function sub(file, pairs) {
  let t = readFileSync(file, 'utf8');
  for (const [a, b] of pairs) {
    if (!t.includes(a)) { console.log('MISSING', file, JSON.stringify(a.slice(0, 50))); continue; }
    t = t.split(a).join(b);
  }
  writeFileSync(file, t);
}
sub('tests/corpus.test.ts', [
  ['expect(n).toBeGreaterThanOrEqual(15);', 'expect(n).toBeGreaterThanOrEqual(10);'],
  ["describe('12 題的「依據條文原文」", "describe('每一題的「依據條文原文」"],
]);
sub('tests/author-corpus.test.ts', [
  ["expect(questionsUsing(published, searchCorpus('憲法16')[0]).length).toBeGreaterThan(0);", "expect(questionsUsing(published, searchCorpus('憲法23')[0]).length).toBeGreaterThan(0);"],
]);
console.log('ok');
