import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import corpus from '../src/data/corpus.json';
import type { QuizPackage } from '../src/core/types';
import { validatePackage } from '../src/core/validator';
import judgments from './fixtures/judgment-text.json';

const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'content-src', 'constitution.quiz.json'), 'utf8')) as QuizPackage;

/** 從來源網址取出法規代碼（pcode），以及這份來源引用了哪些條。 */
function lawOf(url: string) { return /pcode=([A-Z0-9]+)/.exec(url)?.[1] ?? null; }

describe('素材庫（官方條文）', () => {
  it('包含憲法、增修條文、行政程序法，條數合理', () => {
    const by = Object.fromEntries(corpus.laws.map((l) => [l.pcode, l]));
    expect(by.A0000001.articles.length).toBe(175);
    expect(by.A0000002.articles.length).toBe(12);
    expect(by.A0030055.articles.length).toBeGreaterThan(100);
    expect(corpus.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('每一條都有文字，沒有被截斷成空字串（解析器的 show-number 版面）', () => {
    for (const l of corpus.laws) for (const a of l.articles) if (!a.text.includes('刪除')) expect(a.text.length, `${l.name}${a.label}`).toBeGreaterThan(5);
    // 每一條的「最後一段」都要在（解析器曾經把最後一段吃掉；腳本現在也會逐條比對段落數）
    const add = corpus.laws.find((l) => l.pcode === 'A0000002')!;
    const at = (n: string) => add.articles.find((a) => a.no === n)!.text;
    expect(at('5')).toContain('司法院所提出之年度司法概算，行政院不得刪減');
    expect(at('2')).toContain('被彈劾人應即解職');
    expect(at('4')).toContain('非經立法院許可，不得逮捕或拘禁');
    expect(at('12')).toContain('有效同意票過選舉人總額之半數');
    expect(at('3')).toContain('覆議時，如經全體立法委員二分之一以上決議維持原案，行政院院長應即接受該決議');
    const a4 = corpus.laws.find((l) => l.pcode === 'A0000002')!.articles.find((a) => a.no === '4')!;
    expect(a4.text).toContain('立法院於每年集會時，得聽取總統國情報告。');
  });
});

describe('每一題的「依據條文原文」必須逐字出自官方條文', () => {
  const lawText = new Map<string, string>();
  for (const l of corpus.laws) lawText.set(l.pcode, l.articles.map((a) => a.text).join('\n'));

  it('全部引文都在官方條文裡；引文的來源是法規而且網址對得上', () => {
    let n = 0;
    for (const item of pkg.items) {
      const basis = (item.extensions?.['civic.basis'] ?? []) as Array<{ sourceId: string; quote: string }>;
      expect(basis.length, item.id).toBeGreaterThan(0);
      for (const b of basis) {
        const src = pkg.sources.find((s) => s.id === b.sourceId);
        expect(src, `${item.id} 的來源 ${b.sourceId}`).toBeTruthy();
        expect(item.evidenceIds, `${item.id} 的引文來源要在證據清單內`).toContain(b.sourceId);
        if (src!.type === 'judgment') {
          const full = (judgments.texts as Record<string, string>)[src!.url];
          expect(full, `${src!.id} 的裁判全文不在核對用的檔案裡`).toBeTruthy();
          expect(full.includes(b.quote.replace(/\s+/g, '')), `${item.id}：「${b.quote.slice(0, 20)}…」不是裁判的逐字內容`).toBe(true);
          n++;
          continue;
        }
        const code = lawOf(src!.url);
        expect(code, `${src!.id} 要是全國法規資料庫的連結`).toBeTruthy();
        expect(lawText.get(code!), `${code} 不在素材庫`).toBeTruthy();
        expect(lawText.get(code!)!.includes(b.quote), `${item.id}：「${b.quote.slice(0, 20)}…」不是官方條文的逐字內容`).toBe(true);
        n++;
      }
    }
    expect(n).toBeGreaterThanOrEqual(10);
  });
  it('加了引文之後題庫仍然通過完整驗證', () => {
    expect(validatePackage(JSON.parse(JSON.stringify(pkg))).errors).toEqual([]);
  });
  it('故意改一個字，驗證會抓到（確認這個測試真的有在比對）', () => {
    const b = (pkg.items[0].extensions!['civic.basis'] as Array<{ quote: string }>)[0].quote;
    const all = [...lawText.values()].join('\n');
    expect(all.includes(b.replace('增加', '減少'))).toBe(false);
  });
});
