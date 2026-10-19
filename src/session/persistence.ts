// PR-02：預設只放分頁記憶體；讀者明確選「只儲存在這台裝置」才寫入 IndexedDB。
// 儲存期限 30 天，到期於下次開啟時刪除；期限從「選擇儲存」那刻起算，之後改答案不會延長。
// 任何儲存失敗都回退到記憶體模式，不阻擋閱讀。
import type { SessionData } from './attempt';

const DB_NAME = 'civic-inquiry';
const STORE = 'session';
const KEY = 'local-progress';
export const RETENTION_DAYS = 30;

export interface SavedRecord {
  schema: 1;
  /** 讀者選擇儲存的時間（ISO）；到期以它為準，不隨編輯更新 */
  savedAt: string;
  data: SessionData;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB 不可用'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 開啟失敗'));
    req.onblocked = () => reject(new Error('IndexedDB 被封鎖'));
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => { db.close(); resolve(req.result); };
        t.onerror = () => { db.close(); reject(t.error ?? new Error('IndexedDB 交易失敗')); };
        t.onabort = () => { db.close(); reject(t.error ?? new Error('IndexedDB 交易中止')); };
      }),
  );
}

export function isExpired(savedAt: string, now: Date): boolean {
  const t = Date.parse(savedAt);
  if (!Number.isFinite(t)) return true;
  return now.getTime() >= t + RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

/** 沒儲存過就不要去建立資料庫：預設模式不該在裝置上留下任何東西（連空資料庫都不要）。 */
async function dbExists(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  if (typeof indexedDB.databases !== 'function') return true; // 無法預先判斷時才直接開啟
  try {
    return (await indexedDB.databases()).some((d) => d.name === DB_NAME);
  } catch {
    return true;
  }
}

export async function loadSaved(now: Date): Promise<SavedRecord | null> {
  try {
    if (!(await dbExists())) return null;
    const rec = (await tx('readonly', (s) => s.get(KEY))) as SavedRecord | undefined;
    if (!rec || rec.schema !== 1) return null;
    if (isExpired(rec.savedAt, now)) {
      await clearSaved();
      return null;
    }
    return rec;
  } catch {
    return null;
  }
}

export async function writeSaved(rec: SavedRecord): Promise<boolean> {
  try {
    await tx('readwrite', (s) => s.put(rec, KEY));
    return true;
  } catch {
    return false;
  }
}

export async function clearSaved(): Promise<boolean> {
  try {
    if (!(await dbExists())) return true;
    // 整個資料庫刪掉，不在裝置上留空殼
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error('刪除失敗'));
      req.onblocked = () => resolve();
    });
    return true;
  } catch {
    return false;
  }
}
