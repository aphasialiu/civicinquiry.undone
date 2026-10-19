/** 答案已經顯示在「憲政體制的答案」，解釋裡開頭那句「答案：…。」就不重複。 */
export function stripAnswerLead(short: string): string {
  if (!short.startsWith('答案：')) return short;
  const i = short.search(/[。！？]/);
  return i < 0 ? '' : short.slice(i + 1).trim();
}
