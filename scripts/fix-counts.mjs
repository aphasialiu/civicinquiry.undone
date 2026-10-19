// 一次性：刪題之後，讓測試不再寫死「12 題」與題號。
import { readFileSync, writeFileSync } from 'node:fs';

const f = 'content-src/constitution.quiz.json';
const p = JSON.parse(readFileSync(f, 'utf8'));
p.title = '臺灣民主與憲政制度：反直覺題庫（教育原型）';
writeFileSync(f, JSON.stringify(p, null, 2) + '\n');

function sub(file, pairs) {
  let t = readFileSync(file, 'utf8');
  for (const [a, b] of pairs) {
    if (!t.includes(a)) { console.log('MISSING', file, JSON.stringify(a.slice(0, 50))); continue; }
    t = t.split(a).join(b);
  }
  writeFileSync(file, t);
}

sub('tests/author-corpus.test.ts', [
  ["'臺灣民主與憲政制度：12題教育原型-審查用文件.html'", "'臺灣民主與憲政制度：反直覺題庫（教育原型）-審查用文件.html'"],
  ['.length).toBe(12);\n  });\n  it(\'題目裡的 HTML', '.length).toBe(published.items.length);\n  });\n  it(\'題目裡的 HTML'],
]);
sub('tests/core.test.ts', [
  ["it('12 題原型通過驗證：11 題單選、1 題反思'", "it('原型題庫通過驗證：單選題加 1 題沒有定論的題'"],
  ['expect(pkg.items).toHaveLength(12);', 'expect(pkg.items.length).toBeGreaterThanOrEqual(8);'],
  ["toHaveLength(11);\n    expect(pkg.items.filter((i) => i.knowledge.type === 'reflection'))", "toHaveLength(pkg.items.length - 1);\n    expect(pkg.items.filter((i) => i.knowledge.type === 'reflection'))"],
]);
sub('tests/pilot.test.ts', [["expect(text).toContain('作答 3 題／共 12 題');", 'expect(text).toContain(`作答 3 題／共 ${pkg.items.length} 題`);']]);
sub('tests/e2e/pilot.spec.ts', [["toContainText('作答 0 題／共 12 題')", "toContainText('作答 0 題／共 8 題')"]]);
sub('tests/e2e/ideas.spec.ts', [['toHaveCount(12)', 'toHaveCount(8)']]);
sub('tests/e2e/singlefile.spec.ts', [['toHaveCount(12)', 'toHaveCount(8)']]);
sub('tests/e2e/corpus.spec.ts', [
  ['n <= 12; n++', 'n <= 8; n++'],
  ['const isReflection = n === 9;', 'const isReflection = n === 5;'],
  ["test('12 題：", "test('每題："],
]);
const fl = 'tests/e2e/flow.spec.ts';
writeFileSync(fl, readFileSync(fl, 'utf8').split('/#/quiz/9').join('/#/quiz/5'));
console.log('ok');
