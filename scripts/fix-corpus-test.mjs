import { readFileSync, writeFileSync } from 'node:fs';
const f = 'tests/corpus.test.ts';
let t = readFileSync(f, 'utf8');
t = t.replace(
  "    const a4 = corpus.laws.find((l) => l.pcode === 'A0000002')!.articles.find((a) => a.no === '4')!;",
  `    // 每一條的「最後一段」都要在（解析器曾經把最後一段吃掉；腳本現在也會逐條比對段落數）
    const add = corpus.laws.find((l) => l.pcode === 'A0000002')!;
    const at = (n: string) => add.articles.find((a) => a.no === n)!.text;
    expect(at('5')).toContain('司法院所提出之年度司法概算，行政院不得刪減');
    expect(at('2')).toContain('被彈劾人應即解職');
    expect(at('4')).toContain('非經立法院許可，不得逮捕或拘禁');
    expect(at('12')).toContain('有效同意票過選舉人總額之半數');
    expect(at('3')).toContain('覆議時，如經全體立法委員二分之一以上決議維持原案，行政院院長應即接受該決議');
    const a4 = corpus.laws.find((l) => l.pcode === 'A0000002')!.articles.find((a) => a.no === '4')!;`,
);
writeFileSync(f, t);
console.log('ok');
