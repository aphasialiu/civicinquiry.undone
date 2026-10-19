// 把「/items/0/knowledge/correctOptionIds/0」這種程式用的欄位位置，翻成作者看得懂的話。
const NAMES: Record<string, string> = {
  title: '標題', description: '題庫介紹', locale: '語言', license: '授權', authors: '作者', sources: '來源', items: '題目',
  displayName: '名稱', credentialText: '資歷說明', url: '網址', type: '性質', publisher: '發布單位', locator: '定位', publishedAt: '發布日期',
  accessedAt: '查閱日期', rights: '使用權利', topic: '主題', jurisdiction: '適用範圍', context: '情境', intuition: '聽起來有道理的話',
  prompt: '問題', knowledge: '問題與選項', options: '選項', label: '文字', correctOptionIds: '正解', rationale: '依據說明', explanation: '解釋',
  short: '核心解釋', mechanism: '機制', possibleReasons: '制度理由', alternatives: '其他作法', limitations: '這題沒有回答什麼', misconception: '為什麼直覺會出問題',
  epistemic: '確定程度', disputeScope: '爭議範圍', evidenceIds: '證據', readingIds: '延伸閱讀', discussionPrompts: '討論問題', search: '探索設定',
  keywords: '關鍵詞', validity: '有效期間', asOf: '依據的時間點', validFrom: '開始適用', validUntil: '結束適用', reviewDueAt: '下次覆核日期',
  knowledgeVersion: '知識版本說明', governance: '審查狀態', notes: '備註', concepts: '概念', id: '代號', version: '版本', namespace: '命名空間', quizId: '題庫代號',
};

export function friendlyPath(path: string): string {
  if (!path) return '整份題庫';
  const segs = path.split('/').slice(1).map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  const out: string[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (/^\d+$/.test(s)) continue;
    const n = /^\d+$/.test(segs[i + 1] ?? '') ? Number(segs[i + 1]) + 1 : null;
    if (s === 'items' && n !== null) out.push(`第 ${n} 題`);
    else if (s === 'sources' && n !== null) out.push(`來源 ${n}`);
    else if (s === 'options' && n !== null) out.push(`選項 ${n}`);
    else if (s === 'authors' && n !== null) out.push('作者');
    else if (s === 'label' && segs[i - 2] === 'options') continue;
    else out.push(NAMES[s] ?? s);
  }
  return out.join(' › ');
}

/** 把驗證器的訊息改成一般人看得懂的說法。 */
export function friendlyMessage(code: string, message: string): string {
  if (code === 'SCHEMA' && /長度不得少於 1$/.test(message)) return '這一欄還沒有填。';
  if (code === 'SCHEMA' && /缺少必要欄位/.test(message)) return '這一欄還沒有填。';
  if (code === 'SCHEMA' && /至少要有 1 項/.test(message)) return '至少要有一項。';
  return message;
}
