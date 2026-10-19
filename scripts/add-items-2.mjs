// 新增三題：覆議（A1）、司法預算（A4）、違法的抗議（C3，沒有定論）。
// 條文引文逐字出自官方素材庫（tests/corpus.test.ts 會逐條驗證）。
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'content-src/constitution.quiz.json';
const pkg = JSON.parse(readFileSync(file, 'utf8'));
if (pkg.items.some((i) => i.id === 'tw-reconsideration-13')) throw new Error('已經新增過了');

pkg.sources.push({
  id: 'l15', title: '中華民國憲法第14條', url: 'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=A0000001&flno=14', type: 'law',
  publisher: '全國法規資料庫', publishedAt: null, accessedAt: '2026-10-18', locator: '第14條（集會結社自由）', rights: 'link_only',
});
// 憲法第23條的來源 l04 在刪題時被清掉（當時沒有題目用到），補回來
if (!pkg.sources.some((s) => s.id === 'l04')) {
  pkg.sources.push({
    id: 'l04', title: '中華民國憲法第23條', url: 'https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=A0000001&flno=23', type: 'law',
    publisher: '全國法規資料庫', publishedAt: null, accessedAt: '2026-10-17', locator: '第23條（限制基本權的必要性與法律要求）', rights: 'link_only',
  });
}

const base = (o) => ({
  version: '0.1.0', authorIds: ['spec-editor'], language: 'zh-Hant-TW', jurisdiction: 'TW',
  intuition: { kind: 'value', prompt: o.teaser, options: [{ id: 'v1', label: '較同意' }, { id: 'v2', label: '較不同意' }, { id: 'v3', label: '尚無主張' }] },
  readingIds: o.evidence, discussionPrompts: o.prompts,
  search: { profileId: o.profile, keywords: o.keywords, categories: ['news', 'argument', 'comparison', 'official', 'academic'], region: 'TW', language: 'zh-Hant' },
  validity: { asOf: '2026-10-18', validFrom: '2026-10-17T16:00:00Z', validUntil: null, reviewDueAt: '2026-11-16T16:00:00Z', knowledgeVersion: o.kv },
  governance: { lifecycle: 'draft', verification: 'unreviewed', lastReviewedAt: null, reviewers: [], notes: o.notes },
});

const L05 = 'l05';
const Q23 = '以上各條列舉之自由權利，除為防止妨礙他人自由、避免緊急危難、維持社會秩序，或增進公共利益所必要者外，不得以法律限制之。';

pkg.items.push({
  id: 'tw-reconsideration-13', ...base({
    teaser: '行政部門最清楚做不做得到，所以它說做不到，法律就不該硬要它執行。',
    evidence: [L05], profile: 'tw-reconsideration', keywords: ['覆議 窒礙難行 增修條文', 'legislative veto reconsideration premier'],
    prompts: ['行政部門表達困難的機會，和擁有最後的否決權，有什麼不同？', '如果行政院有最後的否決權，立法院通過的法律還有多少份量？', '其他國家的總統否決權，和這個設計有什麼不同？'],
    kv: '憲法增修條文第3條；2026-10-18 查閱官方條文', notes: '待審：條文引用範圍；不討論行政命令與條約的特殊程序。',
  }),
  authorIds: ['spec-editor'], concepts: ['civics.separation', 'civics.checks-and-balances'],
  topic: '行政院做不到的法律',
  context: '立法院通過了一項法律案。行政院仔細評估後，認為這項法律內容有嚴重的窒礙，實在很難執行，想要把它擋下來。',
  knowledge: {
    type: 'single', prompt: '依憲法的制度設計，行政院可以怎麼做？',
    options: [
      { id: 'a', label: '總統可以直接否決這個法律案，不讓它成為法律，因為總統要對整體國家運作負責。' },
      { id: 'b', label: '行政院可以拒絕執行，因為行政部門最清楚做不做得到，不能強迫它做不可能的事。' },
      { id: 'c', label: '經總統核可，行政院可以移請立法院重新審議；如果立法院過半數維持原案，行政院就必須接受。' },
      { id: 'd', label: '行政院只能照辦，如果有意見，要等到下一次選舉讓人民決定要不要換掉立法院。' },
    ],
    correctOptionIds: ['c'], rationale: '憲法增修條文第3條：覆議制度。',
  },
  explanation: {
    short: '答案：行政院經總統核可，可以移請立法院覆議；立法院全體過半數維持原案時，行政院長應即接受。就算認為窒礙難行，行政院也沒有最後的否決權。',
    mechanism: '憲法增修條文第3條規定：行政院對於立法院決議的法律案、預算案、條約案，如果認為有窒礙難行，得經總統之核可，在決議案送達十日內移請立法院覆議。覆議時，如果全體立法委員二分之一以上決議維持原案，行政院院長應即接受該決議；覆議案逾期未議決，原決議失效。',
    possibleReasons: '這個設計讓行政部門有一次把困難說清楚的機會，但最後仍由代表人民的立法院決定，避免行政部門用「做不到」擋下法律。這是常見的解釋，並非條文本身的說明。',
    alternatives: '有些國家（例如美國）的總統有否決權，立法部門要用更高的門檻才能推翻；台灣的設計不同。各國制度要另查各自的法規。',
    limitations: '本題只談法律案、預算案、條約案的覆議，不討論行政命令，也不判斷某一部法律是不是真的窒礙難行。',
    misconception: '「行政部門最了解能不能做，所以它說了算」聽起來很合理。但如果行政部門能用「做不到」擋下法律，民意機關通過的法律就可能被架空，人民選出立法院的意義也會打折；覆議制度讓困難被聽見，卻不讓任何一方有最後的否決權。',
  },
  epistemic: 'settled', disputeScope: 'none', evidenceIds: [L05],
  extensions: { 'civic.basis': [
    { sourceId: L05, locator: '憲法增修條文第3條', quote: '行政院對於立法院決議之法律案、預算案、條約案，如認為有窒礙難行時，得經總統之核可，於該決議案送達行政院十日內，移請立法院覆議。' },
    { sourceId: L05, locator: '憲法增修條文第3條', quote: '覆議時，如經全體立法委員二分之一以上決議維持原案，行政院院長應即接受該決議。' },
  ] },
});

pkg.items.push({
  id: 'tw-judicial-budget-14', ...base({
    teaser: '預算都由行政院統籌編列，沒有哪個機關可以例外。',
    evidence: [L05], profile: 'tw-judicial-budget', keywords: ['司法概算 行政院 不得刪減', 'judicial budget independence'],
    prompts: ['審理案件的機關，預算卻由可能成為被告的機關決定，會有什麼問題？', '預算上的保護，和判決的獨立有什麼關係？', '立法院審議時，可以怎麼處理司法院的概算？'],
    kv: '憲法增修條文第5條；2026-10-18 查閱官方條文', notes: '待審：不討論立法院審議階段的增減；不討論各機關預算的實際編列。',
  }),
  concepts: ['civics.judicial-independence', 'civics.budget'],
  topic: '司法院的預算',
  context: '行政院正在編列明年度的中央政府總預算案。司法院提出的年度預算比去年高出不少，行政院的財政主管人員認為整體預算吃緊，想把司法院的部分項目刪減。',
  knowledge: {
    type: 'single', prompt: '行政院可以刪減司法院提出的年度預算嗎？',
    options: [
      { id: 'a', label: '可以。總預算由行政院統籌編列，各機關的需求都要經過行政院整體衡量。' },
      { id: 'b', label: '不可以刪減，但行政院可以加註意見，把司法院的概算編入總預算案，再送立法院審議。' },
      { id: 'c', label: '可以，但只能刪減和審判業務沒有直接關係的項目，審判業務的預算才不能動。' },
      { id: 'd', label: '不可以。司法院的預算由立法院直接審議，不併入行政院編列的總預算案。' },
    ],
    correctOptionIds: ['b'], rationale: '憲法增修條文第5條：司法概算。',
  },
  explanation: {
    short: '答案：行政院不能刪減司法院提出的年度司法概算，只能加註意見，編入中央政府總預算案，送立法院審議。預算雖然由行政院統籌，司法院的概算是明文的例外。',
    mechanism: '憲法增修條文第5條規定：司法院所提出之年度司法概算，行政院不得刪減，但得加註意見，編入中央政府總預算案，送立法院審議。',
    possibleReasons: '預算是行政機關最有力的工具之一。如果行政院能隨意刪減司法預算，審理案件（包括涉及行政機關的案件）的機關，就得看可能被審的對象的臉色。這是常見的解釋，並非條文本身的說明。',
    alternatives: '各國對司法預算的安排不同：有的由議會直接決定，有的由司法機關自己編列。要另查各國的規定。',
    limitations: '本題只談行政院能不能刪減；立法院審議時如何增減，是另一個問題。也不討論各機關預算的實際編列。',
    misconception: '「預算都歸行政院統籌，所以每個機關都一樣」聽起來很合理。但如果審判機關的預算可以被行政機關任意刪減，行政部門就有了一種不必經過審判、卻能影響審判機關的辦法；這個例外，就是讓司法不必看行政的臉色。',
  },
  epistemic: 'settled', disputeScope: 'none', evidenceIds: [L05],
  extensions: { 'civic.basis': [{ sourceId: L05, locator: '憲法增修條文第5條', quote: '司法院所提出之年度司法概算，行政院不得刪減，但得加註意見，編入中央政府總預算案，送立法院審議。' }] },
});

pkg.items.push({
  id: 'tw-civil-disobedience-15', ...base({
    teaser: '為了正當的目的，和平的違法抗議在民主社會也是可以被接受的。',
    evidence: ['l15', 'l04'], profile: 'tw-civil-disobedience', keywords: ['公民不服從 民主 集會自由', 'civil disobedience democracy'],
    prompts: ['誰有資格判斷一個訴求「夠正當」？', '如果每個人都能用「我的目的比較正當」違反規則，會發生什麼事？', '如果合法管道真的都走不通，人們還能怎麼辦？'],
    kv: '憲法第14條、第23條；2026-10-18 查閱官方條文', notes: '沒有標準答案的題：每個選項都是真實的看法。待審：解釋文字要避免暗示該支持哪一種想法。',
  }),
  concepts: ['civics.legitimacy', 'civics.rule-of-law'],
  topic: '違法的抗議',
  context: '政府通過一項爭議很大的政策，許多人認為嚴重不公。一群民眾在合法的遊行之後，決定不離開，占用馬路和政府機關的出入口，造成交通與公務中斷。他們說這是為了喚起社會的注意；也有人說，這已經違法，民主社會不能容忍。（這是假設情境，不指向任何真實事件，也不涉及暴力。）',
  knowledge: {
    type: 'reflection', prompt: '只知道這些，你覺得下面哪一個說法最合理？',
    options: [
      { id: 'a', label: '民主社會必須守法。不滿就用選舉、訴願、訴訟或修法來表達，違法就不該被接受。' },
      { id: 'b', label: '只要訴求正當、手段和平，違法的抗議也可以接受，因為有些不公不會被合法管道聽見。' },
      { id: 'c', label: '可以違法，但必須公開進行，並且願意接受法律的處罰，這樣才算有擔當的抗議。' },
      { id: 'd', label: '要看政策有多嚴重、其他管道是不是真的走不通，以及抗議造成的傷害有多大，不能一概而論。' },
    ],
    correctOptionIds: [], rationale: '這題沒有標準答案。民主社會裡，守法與抗議的界線，連專家也有不同的看法。',
  },
  explanation: {
    short: '這題沒有標準答案。民主社會裡，守法與抗議的界線，連專家也有不同的看法。上面每一種想法都有它合理的地方，也都藏著沒說出口的前提。',
    mechanism: '憲法第14條：人民有集會及結社之自由。憲法第23條說明：自由權利除為防止妨礙他人自由、避免緊急危難、維持社會秩序，或增進公共利益所必要者外，不得以法律限制之。法律怎麼劃定集會自由的界線、哪些行為會被處罰，是另一個層次的問題，本題不判斷。',
    possibleReasons: '主張嚴格守法的人，重視規則的可預期與公平；主張可以有例外的人，重視法律本身可能不公，以及少數人被聽見的機會。兩邊的出發點都是想保護民主。',
    alternatives: '有些人主張，違法抗議要符合條件，例如公開、非暴力、願意承擔責任；這些條件本身也有爭論。',
    limitations: '本題不判斷任何真實的抗議是否合法，也不涉及暴力。每個人的選擇，不能用來推論他的政治立場。',
    misconception: '「守法就是民主」或「目的正當就可以違法」聽起來都很有道理。但前者可能讓不公平的法律永遠無法被挑戰，後者則讓每個人都能用「我的目的比較正當」來違反規則；這兩種直覺，都需要回答：誰來判斷、用什麼標準？',
  },
  epistemic: 'disputed', disputeScope: 'answer', evidenceIds: ['l15', 'l04'],
  extensions: {
    'civic.basis': [
      { sourceId: 'l15', locator: '憲法第14條', quote: '人民有集會及結社之自由。' },
      { sourceId: 'l04', locator: '憲法第23條', quote: Q23 },
    ],
    'civic.option-notes': {
      a: '這個想法假設合法管道都暢通有效，而且法律本身是正當的。但歷史上有些爭取權利的行動，在當時是違法的。',
      b: '這個想法假設「訴求正當」可以被客觀判斷。但不同的人對「正當」的看法不同，如果每個人都能這樣主張，社會的規則就很難維持。',
      c: '這個想法假設願意受罰就能彌補違法的代價。但受罰的意願，並不能讓被占用的道路、被中斷的公務恢復；它也假設法律的制裁本身是公平的。',
      d: '這個想法假設我們可以公平地衡量嚴重性、替代管道與傷害。但誰來衡量、用什麼標準，本身就有爭議。',
    },
  },
});

// 引用到的來源要在清單內（l04、l05、l15）；沒有題目用到的來源移除
const used = new Set(pkg.items.flatMap((i) => [...i.evidenceIds, ...i.readingIds]));
pkg.sources = pkg.sources.filter((s) => used.has(s.id));
writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log('items', pkg.items.length, 'sources', pkg.sources.map((s) => s.id).join(','));
