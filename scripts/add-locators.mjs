// 一次性：在每筆「依據引文」加上精確的條號（顯示在答案頁的「依據」），取代來源裡較長的說明文字。
import { readFileSync, writeFileSync } from 'node:fs';
const file = 'content-src/constitution.quiz.json';
const pkg = JSON.parse(readFileSync(file, 'utf8'));
const LOC = {
  'tw-budget-01': ['憲法第70條'],
  'tw-majority-02': ['憲法第171條', '憲法第23條'],
  'tw-dissolution-03': ['憲法增修條文第2條'],
  'tw-president-report-04': ['憲法增修條文第4條'],
  'tw-parliament-court-05': ['憲法第80條'],
  'tw-due-process-06': ['憲法第8條', '憲法第23條'],
  'tw-judicial-independence-07': ['憲法第80條'],
  'tw-civic-participation-08': ['憲法第16條'],
  'tw-conflicting-duties-09': ['行政程序法第4條', '行政程序法第10條'],
  'tw-emergency-10': ['憲法增修條文第2條'],
  'tw-executive-responsibility-11': ['憲法增修條文第3條', '憲法第53條'],
  'tw-advertising-12': ['憲法第23條'],
};
for (const it of pkg.items) {
  const b = it.extensions['civic.basis'];
  const l = LOC[it.id];
  if (!l || l.length !== b.length) throw new Error(`${it.id}: 條號數量不符`);
  b.forEach((x, i) => { x.locator = l[i]; });
}
writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log('ok');
