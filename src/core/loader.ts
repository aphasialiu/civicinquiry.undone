// ContentLoader：manifest 與固定版本 → QuizPackage。
// 只讀同源的固定路徑；不抓任意 URL；整包驗證失敗就整包不啟用（不部分啟用）。
import { MAX_BYTES } from './strictJson';
import { sha256Hex } from './hash';
import { validateText } from './validator';
import type { Catalog, CatalogEntry, QuizPackage, StatusCatalog, ValidationError } from './types';

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export class LoadError extends Error {
  constructor(message: string, public readonly errors: ValidationError[] = []) {
    super(message);
    this.name = 'LoadError';
  }
}

// 網站可能放在子路徑（例如 GitHub Pages 的 /專案名/），所以內容路徑要接上 BASE_URL
const withBase = (p: string) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}${p}`;

async function getJson<T>(fetcher: Fetcher, url: string, noStore = false): Promise<T> {
  const res = await fetcher(url, noStore ? { cache: 'no-store' } : undefined);
  if (!res.ok) throw new LoadError(`讀取 ${url} 失敗（HTTP ${res.status}）`);
  return (await res.json()) as T;
}

export async function loadCatalog(fetcher: Fetcher): Promise<Catalog> {
  const cat = await getJson<Catalog>(fetcher, withBase('/content/catalog.json'));
  if (!cat || !Array.isArray(cat.quizzes)) throw new LoadError('題庫目錄格式不正確');
  return cat;
}

export async function loadQuiz(fetcher: Fetcher, entry: CatalogEntry): Promise<QuizPackage> {
  // 只接受目錄登記的同源內容路徑
  if (!/^\/content\/[a-z0-9./-]+\.json$/i.test(entry.path) || entry.path.includes('..')) {
    throw new LoadError('題庫路徑不合法');
  }
  const res = await fetcher(withBase(entry.path));
  if (!res.ok) throw new LoadError(`讀取題庫失敗（HTTP ${res.status}）`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new LoadError('題庫檔案超過 2 MiB 上限');
  const digest = await sha256Hex(buf);
  if (digest !== entry.sha256) throw new LoadError('題庫內容與目錄登記的雜湊不符，已拒絕載入');
  const result = validateText(new TextDecoder('utf-8', { fatal: true }).decode(buf));
  if (!result.ok || !result.pkg) throw new LoadError('題庫格式驗證失敗，已拒絕載入', result.errors);
  return result.pkg;
}

/** 讀不到或格式不對就回 null（呼叫端會因此降為歷史閱讀，不會默認有效）。 */
export async function loadStatus(fetcher: Fetcher): Promise<StatusCatalog | null> {
  try {
    const s = await getJson<StatusCatalog>(fetcher, withBase('/content/status.json'), true);
    if (!s || typeof s.generatedAt !== 'string' || typeof s.expiresAt !== 'string' || !Array.isArray(s.entries)) return null;
    if (!Number.isFinite(Date.parse(s.generatedAt)) || !Number.isFinite(Date.parse(s.expiresAt))) return null;
    return s;
  } catch {
    return null;
  }
}
