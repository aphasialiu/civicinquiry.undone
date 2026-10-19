// 產生 AT-13 用的測試題庫（科學、歷史、英文譯本）。這些是「fixture」：只在 CIVIC_FIXTURES=1 時才會被發布，
// 一般建置不會把它們當正式內容。執行：npx tsx scripts/make-fixtures.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stableStringify } from '../src/core/hash';
import { validatePackage } from '../src/core/validator';
import { blankItem, newQuiz, setIn } from '../src/authoring/draft';
import type { Item, QuizPackage, Source } from '../src/core/types';

const NOW = new Date('2026-10-18T03:00:00Z');
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'content-src', 'fixtures');
mkdirSync(out, { recursive: true });

const src = (id: string, title: string, url: string, publisher: string, locator: string): Source => ({
  id, title, url, type: 'other', publisher, publishedAt: null, accessedAt: '2026-10-18', locator, rights: 'link_only',
});

function item(pkg: QuizPackage, n: number, o: {
  id: string; topic: string; context: string; intuition: string; q: string; opts: [string, string, string]; correct: 'a' | 'b' | 'c';
  rationale: string; short: string; mech: string; why: string; alt: string; lim: string; mis: string; ev: string[]; disc: string; kw: string; lang?: string; version?: string;
  intuitionLabels?: [string, string, string]; kind?: string;
}): Item {
  const base = blankItem(pkg, n, NOW);
  const lang = o.lang ?? pkg.locale;
  const labels = o.intuitionLabels ?? ['較同意', '較不同意', '尚無主張'];
  return {
    ...base, id: o.id, version: o.version ?? '0.1.0', topic: o.topic, language: lang, context: o.context, jurisdiction: 'global',
    intuition: { kind: 'value', prompt: o.intuition, options: labels.map((label, i) => ({ id: `v${i + 1}`, label })) },
    knowledge: { type: 'single', prompt: o.q, options: o.opts.map((label, i) => ({ id: 'abc'[i], label })), correctOptionIds: [o.correct], rationale: o.rationale },
    explanation: { short: o.short, mechanism: o.mech, possibleReasons: o.why, alternatives: o.alt, limitations: o.lim, misconception: o.mis },
    evidenceIds: o.ev, readingIds: o.ev, discussionPrompts: [o.disc],
    search: { profileId: `${pkg.quizId}-${o.id}-${lang}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'), keywords: [o.kw], categories: ['news', 'official'], region: 'global', language: lang === 'zh-Hant-TW' ? 'zh-Hant' : lang },
    validity: { ...base.validity, knowledgeVersion: 'fixture（測試用，未經審查）' },
    governance: { ...base.governance, notes: 'AT-13 測試題庫（fixture），不是正式教育內容。' },
  };
}

function finish(pkg: QuizPackage, file: string) {
  const v = validatePackage(JSON.parse(JSON.stringify(pkg)));
  if (!v.ok) { console.error(file, v.errors); process.exit(1); }
  writeFileSync(join(out, file), stableStringify(pkg) + '\n', 'utf8');
  console.log('✓', file);
}

// ── 科學：繁體中文原文 ──
let phys = newQuiz({ namespace: 'fixture.sci', quizId: 'physics', title: '【測試題庫】日常物理', locale: 'zh-Hant-TW', authorName: '測試作者', now: NOW });
phys = setIn(phys, ['description'], 'AT-13 測試用題庫（fixture），不是正式教育內容。');
phys.sources = [src('arch', '阿基米德原理', 'https://en.wikipedia.org/wiki/Archimedes%27_principle', '維基百科', '浮力與排開液體的重量'), src('fall', '自由落體', 'https://en.wikipedia.org/wiki/Free_fall', '維基百科', '真空中的自由落體')];
phys.items = [
  item(phys, 1, { id: 'phys-fall', version: '0.2.0', topic: '落下的快慢', context: '在真空中，同時放開一顆鐵球與一根羽毛。', intuition: '重的東西應該落得比較快。', q: '在真空中，兩者的落下速度？', opts: ['鐵球先到', '同時到', '羽毛先到'], correct: 'b', rationale: '真空中沒有空氣阻力，加速度相同。', short: '沒有空氣阻力時，所有物體的落下加速度相同。', mech: '重力加速度與質量無關。', why: '日常看到的差異來自空氣阻力。', alt: '在空氣中結果會不同。', lim: '本題只談真空。', mis: '把空氣阻力的效果當成重力本身的差異。', ev: ['fall'], disc: '哪些日常經驗讓你以為重的落得快？', kw: 'free fall vacuum' }),
  item(phys, 2, { id: 'phys-ice', topic: '冰塊融化後的水位', context: '杯子裡的水面上漂著一塊冰，冰完全融化。', intuition: '冰融化會讓水變多，所以水位會上升。', q: '冰完全融化後，杯中的水位？', opts: ['上升', '不變', '下降'], correct: 'b', rationale: '漂浮的冰排開的水重量等於自身重量。', short: '漂浮的冰塊排開的水，重量剛好等於冰自己的重量，融化後體積剛好補回去。', mech: '浮力等於排開液體的重量。', why: '冰融成水後的體積恰等於原先排開的水的體積。', alt: '若冰塊是壓在杯底、不是漂浮，結果不同。', lim: '本題假設冰完全漂浮、溫度與密度忽略不計。', mis: '以為「多出來的水」會讓水位上升。', ev: ['arch'], disc: '如果冰塊卡在杯底，答案會一樣嗎？', kw: 'ice melting water level' }),
];
finish(phys, 'physics.zh-Hant-TW.quiz.json');

// ── 科學：英文譯本。只翻譯第 1 題，且停在原文的舊版本 0.1.0（原文已升到 0.2.0 → 待更新）；第 2 題尚無譯文 ──
let en = newQuiz({ namespace: 'fixture.sci', quizId: 'physics', title: '[Test fixture] Everyday Physics', locale: 'en', authorName: 'Test Author', now: NOW });
en = setIn(en, ['description'], 'Fixture for AT-13. Not real educational content.');
en.sources = [src('fall', 'Free fall', 'https://en.wikipedia.org/wiki/Free_fall', 'Wikipedia', 'Free fall in a vacuum')];
en.items = [
  { ...item(en, 1, { id: 'phys-fall', topic: 'How fast things fall', context: 'In a vacuum, you release an iron ball and a feather at the same moment.', intuition: 'Heavier things should fall faster.', q: 'In a vacuum, which reaches the ground first?', opts: ['The iron ball', 'They arrive together', 'The feather'], correct: 'b', rationale: 'Without air resistance, all objects accelerate equally.', short: 'Without air resistance, every object falls with the same acceleration.', mech: 'Gravitational acceleration does not depend on mass.', why: 'Everyday differences come from air resistance.', alt: 'In air the result differs.', lim: 'This question covers a vacuum only.', mis: 'Mistaking the effect of air resistance for a difference in gravity.', ev: ['fall'], disc: 'Which everyday experiences make heavier things seem to fall faster?', kw: 'free fall vacuum', intuitionLabels: ['Agree more', 'Disagree more', 'No position yet'] }),
    translationOf: { id: 'phys-fall', version: '0.1.0', locale: 'zh-Hant-TW' } },
];
finish(en, 'physics.en.quiz.json');

// ── 歷史（第二個學科） ──
let hist = newQuiz({ namespace: 'fixture.hist', quizId: 'napoleon', title: '【測試題庫】歷史小常識', locale: 'zh-Hant-TW', authorName: '測試作者', now: NOW });
hist = setIn(hist, ['description'], 'AT-13 測試用題庫（fixture），不是正式教育內容。');
hist.sources = [src('nap', '拿破崙一世', 'https://en.wikipedia.org/wiki/Napoleon', '維基百科', '外貌與身高的段落')];
hist.items = [item(hist, 1, { id: 'hist-height', topic: '拿破崙的身高', context: '一般流行的說法是拿破崙個子很矮。', intuition: '拿破崙是個矮子。', q: '以現存紀錄換算成公制，他的身高大約？', opts: ['明顯低於當時一般法國男性', '與當時一般法國男性相近', '明顯高於當時一般法國男性'], correct: 'b', rationale: '法制英寸與英制英寸不同，換算後約 1.69 公尺。', short: '換算單位後，他的身高和當時一般法國男性相近，「矮子」的印象有不少來自單位混淆與宣傳。', mech: '法制與英制的英寸長度不同。', why: '英國漫畫的諷刺也強化了這個印象。', alt: '各來源的數字略有出入。', lim: '本題只談身高紀錄的換算。', mis: '把英制數字直接當成法制數字。', ev: ['nap'], disc: '你還聽過哪些「大家都知道」、但沒查過的說法？', kw: 'Napoleon height' })];
finish(hist, 'napoleon.zh-Hant-TW.quiz.json');
