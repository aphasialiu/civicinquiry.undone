// 一次性：為 12 題加上「依據條文原文」（extensions['civic.basis']），並用官方原文校正部分解釋。
// 引文必須逐字出自 src/data/corpus.json（官方條文）；tests/corpus.test.ts 會逐條驗證。
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'content-src/constitution.quiz.json';
const pkg = JSON.parse(readFileSync(file, 'utf8'));

const Q23 = '以上各條列舉之自由權利，除為防止妨礙他人自由、避免緊急危難、維持社會秩序，或增進公共利益所必要者外，不得以法律限制之。';
const Q80 = '法官須超出黨派以外，依據法律獨立審判，不受任何干涉。';

const BASIS = {
  'tw-budget-01': [{ sourceId: 'l01', quote: '立法院對於行政院所提預算案，不得為增加支出之提議。' }],
  'tw-majority-02': [{ sourceId: 'l03', quote: '法律與憲法牴觸者無效。' }, { sourceId: 'l04', quote: Q23 }],
  'tw-dissolution-03': [{ sourceId: 'l05', quote: '總統於立法院通過對行政院院長之不信任案後十日內，經諮詢立法院院長後，得宣告解散立法院。但總統於戒嚴或緊急命令生效期間，不得解散立法院。' }],
  'tw-president-report-04': [{ sourceId: 'l05', quote: '立法院於每年集會時，得聽取總統國情報告。' }],
  'tw-parliament-court-05': [{ sourceId: 'l09', quote: Q80 }],
  'tw-due-process-06': [{ sourceId: 'l08', quote: '人民身體之自由應予保障。除現行犯之逮捕由法律另定外，非經司法或警察機關依法定程序，不得逮捕拘禁。' }, { sourceId: 'l04', quote: Q23 }],
  'tw-judicial-independence-07': [{ sourceId: 'l09', quote: Q80 }],
  'tw-civic-participation-08': [{ sourceId: 'l10', quote: '人民有請願、訴願及訴訟之權。' }],
  'tw-conflicting-duties-09': [{ sourceId: 'l11', quote: '行政行為應受法律及一般法律原則之拘束。' }, { sourceId: 'l11', quote: '行政機關行使裁量權，不得逾越法定之裁量範圍，並應符合法規授權之目的。' }],
  'tw-emergency-10': [{ sourceId: 'l05', quote: '總統為避免國家或人民遭遇緊急危難或應付財政經濟上重大變故，得經行政院會議之決議發布緊急命令，為必要之處置，不受憲法第四十三條之限制。但須於發布命令後十日內提交立法院追認，如立法院不同意時，該緊急命令立即失效。' }],
  'tw-executive-responsibility-11': [{ sourceId: 'l05', quote: '行政院有向立法院提出施政方針及施政報告之責。立法委員在開會時，有向行政院院長及行政院各部會首長質詢之權。' }, { sourceId: 'l12', quote: '行政院為國家最高行政機關。' }],
  'tw-advertising-12': [{ sourceId: 'l04', quote: Q23 }],
};

const MECH = {
  'tw-budget-01': '憲法第70條規定：立法院對於行政院所提預算案，不得為增加支出之提議。釋字第391號對中央政府總預算案款項目節之間的移動增減也設有限制，並以政策責任歸屬與權力分立來說明。「總額不變」不能單獨排除個別項目增加支出的限制。',
  'tw-dissolution-03': '憲法增修條文第2條規定，總統是在立法院通過對行政院院長的不信任案後十日內，經諮詢立法院院長後，得宣告解散立法院；戒嚴或緊急命令生效期間，不得解散立法院。本題中立法院並沒有通過不信任案，而「得票比立委高」或「民調支持」都不是增修條文列出的條件。本題只問「單憑政治衝突或民意」夠不夠，不測驗法定天數。',
  'tw-president-report-04': '憲法增修條文第4條規定：立法院於每年集會時，得聽取總統國情報告。113年憲判字第9號對這項規定的判斷是：不能直接由「得聽取國情報告」推出可以強制總統答詢。判決的主文與理由才是有效的裁判結論；同案的不同意見書只代表個別意見。',
  'tw-emergency-10': '憲法增修條文第2條規定：緊急命令要先經行政院會議決議才能發布，發布後十日內要提交立法院追認；立法院不同意時，緊急命令立即失效。本題只問程序，不判斷某次事件是否符合發布要件。',
};

for (const item of pkg.items) {
  const b = BASIS[item.id];
  if (!b) throw new Error(`沒有 ${item.id} 的依據引文`);
  item.extensions = { ...(item.extensions ?? {}), 'civic.basis': b };
  if (MECH[item.id]) item.explanation.mechanism = MECH[item.id];
}
writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log('完成');
