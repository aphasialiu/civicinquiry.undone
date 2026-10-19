// 作者草稿的本機儲存。這是作者自己的內容（不是讀者資料），獨立資料庫，
// 只有在作者真的開始編輯後才會建立；可一鍵刪除。
import type { DraftRecord } from './draft';

const DB_NAME = 'civic-inquiry-author';
const STORE = 'drafts';
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

export async function loadDraft(): Promise<DraftRecord | null> {
  try {
    if (!(await exists())) return null;
    return ((await run('readonly', (s) => s.get(KEY))) as DraftRecord | undefined) ?? null;
  } catch { return null; }
}

export async function saveDraft(rec: DraftRecord): Promise<boolean> {
  try { await run('readwrite', (s) => s.put(rec, KEY)); return true; } catch { return false; }
}

export async function deleteDraft(): Promise<boolean> {
  try {
    if (!(await exists())) return true;
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.deleteDatabase(DB_NAME);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error ?? new Error('刪除失敗'));
      r.onblocked = () => resolve();
    });
    return true;
  } catch { return false; }
}
