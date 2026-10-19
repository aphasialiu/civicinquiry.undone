// 「素材 → 題目靈感」：學者或利害關係人拿一條法條、判決或民主觀念來，系統用「常見的誤區型態」幫忙起一個題目的骨架。
// 這不是 AI 自動出題：骨架裡所有需要判斷的地方都留成【待改】，正解也不會替作者猜，必須由作者決定。
import { addSource, blankItem, dayString, setIn } from './draft';
import type { QuizPackage, Source } from '../core/types';

export const PLACEHOLDER = '【待改】';

export interface MisconceptionPattern {
  id: string;
  name: string;
  /** 一句話說明這種誤區 */
  gist: string;
  contextHint: string;
  question: string;
  wrongOption: string;
  rightOption: string;
  otherWrongOption: string;
  misconception: string;
  prompts: string[];
}

export const PATTERNS: MisconceptionPattern[] = [
  { id: 'purpose-means', name: '目的好，手段就一定可以？', gist: '把「目的正當」當成「手段合規」。',
    contextHint: '政府為了一個看起來很好的目的，採取了某個手段。', question: '這個目的，是否足以讓這個手段符合規則？',
    wrongOption: `足夠，只要目的是為了保護大家。`, rightOption: `不夠，${PLACEHOLDER}目的不能代替對手段本身的檢查。`, otherWrongOption: `足夠，只要多數人贊成這個目的。`,
    misconception: '把良好的目的當成手段的通行證。', prompts: ['目的和手段，各需要什麼證據？', '有沒有侵害更小、也能達到目的的作法？', '你支持的目的，和你反對的手段有衝突嗎？'] },
  { id: 'majority-content', name: '多數支持，內容就一定合規？', gist: '把「多數決的程序」當成「內容合規」或「最後決定權」。',
    contextHint: '一個決定經多數表決或民調支持通過。', question: '只憑「有多數支持」，能確定這個決定的內容符合規則嗎？',
    wrongOption: '能，多數支持就能排除所有問題。', rightOption: `不能，${PLACEHOLDER}還要檢查內容是否牴觸更高的規範。`, otherWrongOption: '能，只要投票過程沒有舞弊。',
    misconception: '把程序合法直接當成內容合規。', prompts: ['表決程序和內容，各要查什麼？', '少數人的權利靠什麼保障？', '要判斷這個決定是否合規，還缺哪些資訊？'] },
  { id: 'total-part', name: '整體沒變，個別就沒事？', gist: '把「總量不變」當成「每個項目都沒變」。',
    contextHint: '總額（或總量）不變，但其中個別項目被增減。', question: '「總額不變」，是否就足以讓個別項目的增減符合規則？',
    wrongOption: '是，總額沒增加就沒有問題。', rightOption: `否，${PLACEHOLDER}個別項目的變動仍然受到限制。`, otherWrongOption: '只要這個項目比較重要，就可以。',
    misconception: '把「總額不變」等同每項都沒增加。', prompts: ['總額和單項有什麼不同？', '誰要為重新分配後的結果負責？', '報導講的是哪一個層次？'] },
  { id: 'election-power', name: '直接民選，權力就沒有條件？', gist: '把「民意基礎」當成「權力沒有條件限制」。',
    contextHint: '某個機關或職位是直接民選的，現在想做一件事。', question: '只因為它是直接民選的，就能做這件事嗎？',
    wrongOption: '可以，民選的正當性比任何條件都高。', rightOption: `不可以僅憑民選，${PLACEHOLDER}要符合規範明列的條件。`, otherWrongOption: '可以，只要民調支持。',
    misconception: '把民主授權的來源，當成現成的法律授權。', prompts: ['民調和法律授權要怎麼區分？', '要改變制度，需要改哪些規範？', '其他機關也有民意基礎時怎麼比較？']},
  { id: 'oversight-command', name: '有權監督，就能指揮？', gist: '把「監督」當成「指揮」或「強制」。',
    contextHint: '一個機關有權監督另一個機關，現在想要求對方做某件事。', question: '有監督的權力，是否就包含可以強制要求對方這樣做？',
    wrongOption: '包含，有監督權就能強制。', rightOption: `不包含，${PLACEHOLDER}監督和指揮是不同的關係。`, otherWrongOption: '只要對方曾經配合過一次，就一直要配合。',
    misconception: '用「都應該被監督」推出「都適用同一套強制手段」。', prompts: ['監督和指揮有什麼不同？', '哪個是改革主張，哪個是現行權限？', '你需要哪個法源才能支持另一種制度？']},
  { id: 'crisis-division', name: '危機時，分工就不用管了？', gist: '把「情況緊急」當成「制度上的分工與制衡自動消失」。',
    contextHint: '出現危機，需要快速決定。', question: '在這種危機下，下列哪一種作法符合規則？',
    wrongOption: '一個人（或一個機關）直接決定，不需要其他機關參與。', rightOption: `${PLACEHOLDER}要經過規定的程序，事後還要接受檢查。`, otherWrongOption: '經過一次決議後，就永遠不需要再被檢查。',
    misconception: '把緊急狀態想成「分工會自動消失」。', prompts: ['事前和事後的檢查，各解決什麼問題？', '如果事後不被接受會怎樣？', '一般措施和緊急措施要怎麼區分？']},
  { id: 'loser-rights', name: '選輸（或少數），權利就沒了？', gist: '把「落選／屬於少數」當成「失去依法行使權利的資格」。',
    contextHint: '某人支持的一方落選，或屬於少數。', question: '僅因為這件事，他是否就失去依法行使某項權利？',
    wrongOption: '會，多數已經決定了，不能再用其他程序反對。', rightOption: `不會，${PLACEHOLDER}落選本身不會消滅這些權利。`, otherWrongOption: '會，除非他改為支持對方。',
    misconception: '把選舉結果當成「對之後每件事都不可再爭議」的授權。', prompts: ['反對一項政策和否認選舉結果相同嗎？', '有權尋求救濟，是否等於一定會勝訴？', '還需要查哪些要件？']},
  { id: 'procedure-substance', name: '程序都對，結果就一定對？', gist: '把「程序合法」當成「結果正確／內容合規」。',
    contextHint: '某個決定完全依照規定的程序作成。', question: '只因為程序合法，這個決定的內容就一定符合規則嗎？',
    wrongOption: '一定符合，程序合法就代表內容合法。', rightOption: `不一定，${PLACEHOLDER}程序和內容要分開檢查。`, otherWrongOption: '只要有人事後同意就符合。',
    misconception: '把「怎麼做決定」和「決定的內容」混在一起。', prompts: ['程序和內容，各要檢查什麼？', '哪些情況下程序對、內容卻有問題？', '誰有權檢查內容？']},
  { id: 'custom', name: '其他（我自己寫）', gist: '沒有套用常見型態，所有欄位都由你自己寫。',
    contextHint: '', question: '', wrongOption: '', rightOption: '', otherWrongOption: '', misconception: '', prompts: [''] },
];

export const MATERIAL_KINDS: Array<{ id: string; label: string; sourceType: Source['type'] }> = [
  { id: 'statute', label: '憲法或法律條文', sourceType: 'law' },
  { id: 'judgment', label: '判決、解釋或裁定', sourceType: 'judgment' },
  { id: 'jurisprudence', label: '法理學觀念', sourceType: 'research' },
  { id: 'democracy', label: '民主政治的核心觀念', sourceType: 'research' },
  { id: 'other', label: '其他', sourceType: 'other' },
];

export interface ExtraSource { title: string; url: string; locator: string; publisher: string; type: Source['type'] }

export interface IdeaInput {
  kind: string;
  /** 貼上的法條原文或觀念重點（只放在草稿備註，方便作者回頭對照） */
  material: string;
  sourceTitle: string;
  sourceUrl: string;
  sourceLocator: string;
  jurisdiction: string;
  /** 用一句話寫出規則真正的意思 */
  rule: string;
  /** 大多數人第一反應會怎麼想（會變成第一階段那句「聽起來很有道理的話」） */
  firstReaction: string;
  patternId: string;
  /** 一併帶入的其他來源（例如相關的憲法法庭裁判） */
  extra?: ExtraSource[];
}

/** 依素材建立題目骨架並加進草稿。回傳新題的索引。 */
export function seedItemFromIdea(pkg: QuizPackage, idea: IdeaInput, now: Date, reuseBlank = false): { pkg: QuizPackage; index: number } {
  const pattern = PATTERNS.find((p) => p.id === idea.patternId) ?? PATTERNS[PATTERNS.length - 1];
  const kind = MATERIAL_KINDS.find((k) => k.id === idea.kind) ?? MATERIAL_KINDS[MATERIAL_KINDS.length - 1];

  let p = addSource(pkg, now);
  const si = p.sources.length - 1;
  const source: Source = {
    ...p.sources[si], title: idea.sourceTitle.trim() || `${PLACEHOLDER}來源名稱`, url: idea.sourceUrl.trim() || 'https://', type: kind.sourceType,
    publisher: PLACEHOLDER, locator: idea.sourceLocator.trim() || `${PLACEHOLDER}條號或段落`, accessedAt: dayString(now),
  };
  p = setIn(p, ['sources', si], source);

  let index: number;
  if (reuseBlank && p.items.length === 1 && !p.items[0].topic) {
    index = 0;
  } else {
    const used = new Set(p.items.map((i) => i.id));
    let n = p.items.length + 1;
    while (used.has(`item-${n}`)) n++;
    p = { ...p, items: [...p.items, blankItem(p, n, now)] };
    index = p.items.length - 1;
  }

  const tpl = (s: string) => s;
  const ph = (s: string) => (s ? s : PLACEHOLDER);
  const base = ['items', index] as const;
  p = setIn(p, [...base, 'topic'], PLACEHOLDER + '題目標題（不要洩漏結論）');
  p = setIn(p, [...base, 'jurisdiction'], idea.jurisdiction.trim() || 'global');
  p = setIn(p, [...base, 'context'], `${PLACEHOLDER}${tpl(ph(pattern.contextHint))}（請寫成具體情境，把決定性條件都放在這裡）`);
  p = setIn(p, [...base, 'intuition', 'prompt'], idea.firstReaction.trim() || `${PLACEHOLDER}寫下大多數人第一眼會覺得有道理的那句話`);
  p = setIn(p, [...base, 'knowledge'], {
    type: 'single',
    prompt: `${PLACEHOLDER}${pattern.question || '依指定時間與法域，目前的規則是什麼？'}`,
    options: [
      { id: 'a', label: pattern.wrongOption ? `${PLACEHOLDER}${pattern.wrongOption}` : PLACEHOLDER },
      { id: 'b', label: pattern.rightOption || PLACEHOLDER },
      { id: 'c', label: pattern.otherWrongOption ? `${PLACEHOLDER}${pattern.otherWrongOption}` : PLACEHOLDER },
    ],
    correctOptionIds: [], // 正解由作者自己決定，不替他猜
    rationale: `${source.title}：${source.locator}`,
  });
  p = setIn(p, [...base, 'explanation'], {
    short: idea.rule.trim() ? `答案：${idea.rule.trim()}${PLACEHOLDER}（再用一兩句補上核心差異）` : `答案：${PLACEHOLDER}用一兩句話講出憲政體制的答案與核心差異`,
    mechanism: `${PLACEHOLDER}為什麼規則是這樣？`, possibleReasons: `${PLACEHOLDER}可能的制度理由`, alternatives: `${PLACEHOLDER}其他制度會怎麼做（須另查法源）`,
    limitations: `${PLACEHOLDER}這題沒有回答什麼、不能推論到哪裡`, misconception: `「${idea.firstReaction.trim() || '這個直覺'}」聽起來合理。${PLACEHOLDER}但如果照這個想法做，會傷害民主制度的什麼？（例如：出問題時找不到人負責、少數人的權利被拿走、規則變得不可預期）${pattern.misconception ? `（常見的錯誤想法：${pattern.misconception}）` : ''}`,
  });
  // 其他來源（裁判等）：加進來源清單，列為證據與延伸閱讀
  const extraIds: string[] = [];
  for (const ex of idea.extra ?? []) {
    p = addSource(p, now);
    const j = p.sources.length - 1;
    p = setIn(p, ['sources', j], { ...p.sources[j], title: ex.title, url: ex.url, type: ex.type, publisher: ex.publisher, locator: ex.locator || `${PLACEHOLDER}段落`, accessedAt: dayString(now) });
    extraIds.push(p.sources[j].id);
  }
  p = setIn(p, [...base, 'evidenceIds'], [source.id, ...extraIds]);
  p = setIn(p, [...base, 'readingIds'], [source.id, ...extraIds]);
  const quote = idea.material.trim().slice(0, 600);
  if (quote) p = setIn(p, [...base, 'extensions'], { 'civic.basis': [{ sourceId: source.id, quote, locator: source.title }] });
  p = setIn(p, [...base, 'discussionPrompts'], pattern.prompts.slice(0, 5));
  p = setIn(p, [...base, 'validity', 'knowledgeVersion'], `${source.title}；${dayString(now)} 查閱`);
  p = setIn(p, [...base, 'governance', 'notes'], idea.material.trim() ? `素材摘要：${idea.material.trim().slice(0, 1500)}` : '作者草稿，尚未審查。');
  p = setIn(p, [...base, 'search', 'keywords'], [idea.sourceTitle.trim() || PLACEHOLDER]);
  return { pkg: p, index };
}
