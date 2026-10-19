// 筆記本的儲存：記憶體 store + 本機 IndexedDB 自動儲存（這是讀者自己寫的內容，不是作答紀錄）。
// 只有在讀者真的寫下第一筆內容後才會建立資料庫；一鍵可整個刪除。
import { emptyNotebook, type BlindSpotNote, type Notebook } from './types';

const DB_NAME = 'civic-inquiry-notebook';
const STORE = 'notebook';
const KEY = 'current';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB 不可用'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('開啟失敗'));
  });
}
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req.result); };
    t.onerror = t.onabort = () => { db.close(); reject(t.error ?? new Error('交易失敗')); };
  });
}
async function exists(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  if (typeof indexedDB.databases !== 'function') return true;
  try { return (await indexedDB.databases()).some((d) => d.name === DB_NAME); } catch { return true; }
}

export class NotebookStore {
  private nb: Notebook = emptyNotebook();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private loaded = false;
  saveFailed = false;

  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getSnapshot = (): Notebook => this.nb;

  private emit() { this.listeners.forEach((l) => l()); }

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      if (!(await exists())) return;
      const rec = (await run('readonly', (s) => s.get(KEY))) as Notebook | undefined;
      if (rec && rec.schema === 1 && this.nb.notes.length === 0) { this.nb = rec; this.emit(); }
    } catch { /* 讀不到就從空白開始 */ }
  }

  private set(nb: Notebook) {
    this.nb = nb;
    this.emit();
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      try { await run('readwrite', (s) => s.put(this.nb, KEY)); this.saveFailed = false; } catch { this.saveFailed = true; }
      this.emit();
    }, 300);
  }

  noteFor(itemId: string, itemVersion: string): BlindSpotNote | undefined {
    return this.nb.notes.find((n) => n.itemId === itemId && n.itemVersion === itemVersion);
  }
  setNote(itemId: string, itemVersion: string, patch: Partial<Pick<BlindSpotNote, 'status' | 'note'>>, now: Date) {
    const cur = this.noteFor(itemId, itemVersion);
    const next: BlindSpotNote = { itemId, itemVersion, status: 'open', note: '', ...cur, ...patch, updatedAt: now.toISOString() };
    const rest = this.nb.notes.filter((n) => !(n.itemId === itemId && n.itemVersion === itemVersion));
    this.set({ ...this.nb, notes: next.note === '' && next.status === 'open' ? rest : [next, ...rest] });
  }

  /** 刪除全部（含本機儲存的資料庫） */
  async wipe(): Promise<void> {
    clearTimeout(this.timer);
    this.nb = emptyNotebook();
    this.emit();
    try {
      if (!(await exists())) return;
      await new Promise<void>((resolve, reject) => {
        const r = indexedDB.deleteDatabase(DB_NAME);
        r.onsuccess = () => resolve(); r.onerror = () => reject(r.error ?? new Error('刪除失敗')); r.onblocked = () => resolve();
      });
    } catch { /* 刪不掉時，記憶體已清空 */ }
  }
}

export const notebookStore = new NotebookStore();
