// 讀者對「我的盲點」的筆記。只在本機，由讀者自己寫。
export interface BlindSpotNote {
  itemId: string;
  itemVersion: string;
  status: 'open' | 'clear';
  note: string;
  updatedAt: string;
}

export interface Notebook {
  schema: 1;
  notes: BlindSpotNote[];
}

export const emptyNotebook = (): Notebook => ({ schema: 1, notes: [] });
