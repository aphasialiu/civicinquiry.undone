import { useEffect, useSyncExternalStore } from 'react';
import type { Item, QuizPackage } from '../../core/types';
import type { Attempt } from '../../session/attempt';
import { notebookStore } from '../../notebook/store';
import type { Notebook } from '../../notebook/types';

export function useNotebook(): Notebook {
  const nb = useSyncExternalStore(notebookStore.subscribe, notebookStore.getSnapshot);
  useEffect(() => { void notebookStore.load(); }, []);
  return nb;
}

export function download(text: string, filename: string, type = 'application/json;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface BlindSpot {
  n: number;
  item: Item;
  attempt: Attempt;
  kind: 'mismatch' | 'unknown';
  highConfidence: boolean;
  myChoices: string[];
  basis: string[];
}

/** 從這一輪作答整理出「盲點」：與判準不一致，或我不知道／略過。反思題與歷史閱讀不算。 */
export function collectBlindSpots(pkg: QuizPackage, attempts: Attempt[], runId: string): BlindSpot[] {
  const out: BlindSpot[] = [];
  pkg.items.forEach((item, i) => {
    const a = attempts.find((x) => x.runId === runId && x.itemId === item.id && x.itemVersion === item.version);
    if (!a || item.knowledge.type === 'reflection') return;
    if (a.eligibility === 'historical' || a.eligibility === 'withdrawn') return;
    const label = (id: string) => item.knowledge.options.find((o) => o.id === id)?.label ?? id;
    const base = { n: i + 1, item, attempt: a, myChoices: a.selectedOptionIds.map(label), basis: item.knowledge.correctOptionIds.map(label) };
    if (a.result === 'incorrect') out.push({ ...base, kind: 'mismatch', highConfidence: a.confidence === 'high' });
    else if (a.answerState === 'unknown' || (a.answerState === 'skipped' && !a.viewedExplanationBeforeAnswer)) out.push({ ...base, kind: 'unknown', highConfidence: false });
  });
  return out;
}
