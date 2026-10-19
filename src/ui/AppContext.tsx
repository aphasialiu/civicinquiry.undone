import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { loadCatalog, loadQuiz, loadStatus, LoadError, type Fetcher } from '../core/loader';
import { evaluateEligibility, type Eligibility } from '../core/eligibility';
import { itemHash } from '../core/hash';
import type { Catalog, CatalogEntry, Item, QuizPackage, StatusCatalog, ValidationError } from '../core/types';
import { SessionStore, type StoreSnapshot } from '../session/store';

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string; errors: ValidationError[] }
  | { phase: 'ready'; entry: CatalogEntry; pkg: QuizPackage; hashes: Record<string, string> };

export interface AppApi {
  load: LoadState;
  status: StatusCatalog | null;
  store: SessionStore;
  snapshot: StoreSnapshot;
  online: boolean;
  now: () => Date;
  /** 重新確認狀態目錄（開始前與揭曉前呼叫）。回傳最新目錄，失敗為 null。 */
  refreshStatus: () => Promise<StatusCatalog | null>;
  eligibilityOf: (item: Item, catalogOverride?: StatusCatalog | null) => Eligibility;
  /** 作者預覽時為 true：資料來自草稿，不讀網路，也不寫入任何儲存 */
  preview: boolean;
  quizHref: (n: number) => string;
  homeHref: string;
  catalog: Catalog | null;
  entryIndex: number;
  /** 最後一題之後的去處 */
  endHref: string;
}

const Ctx = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp 必須在 AppProvider 內使用');
  return v;
}

export function itemKey(item: { id: string; version: string }): string {
  return `${item.id}@${item.version}`;
}

// 預設值要放在模組層級：放在參數預設值會每次渲染都產生新函式，導致依賴它們的 effect 反覆觸發。
const defaultFetcher: Fetcher = (i, init) => fetch(i, init);
const defaultNow = () => new Date();

export function AppProvider({
  children,
  fetcher = defaultFetcher,
  now = defaultNow,
  store: injectedStore,
  preview,
  linkBase = '#/quiz',
  endHref = '#/review',
  homeHref = '#/',
  entryIndex = 0,
}: {
  children: ReactNode;
  fetcher?: Fetcher;
  now?: () => Date;
  store?: SessionStore;
  /** 以作者草稿當題庫（與正式引擎同一套畫面），所有題目視為教育原型 */
  preview?: QuizPackage;
  linkBase?: string;
  endHref?: string;
  homeHref?: string;
  /** 目錄中的第幾份題庫（多題庫時；每份題庫的作答互相獨立） */
  entryIndex?: number;
}) {
  const store = useMemo(() => injectedStore ?? new SessionStore(), [injectedStore]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [load, setLoad] = useState<LoadState>({ phase: 'loading' });
  const [status, setStatus] = useState<StatusCatalog | null>(null);
  const [catalogState, setCatalogState] = useState<Catalog | null>(null);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const started = useRef(false);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    if (!preview) return;
    let dead = false;
    (async () => {
      const hashes: Record<string, string> = {};
      const entries: StatusCatalog['entries'] = [];
      for (const it of preview.items) {
        const h = await itemHash(it);
        hashes[itemKey(it)] = h;
        entries.push({ itemId: it.id, version: it.version, locale: it.language, sha256: h, lifecycle: 'draft', verification: 'unreviewed', reviewerOrg: null, reason: null, supersededBy: null });
      }
      const t = now().getTime();
      const st: StatusCatalog = { generatedAt: new Date(t - 60_000).toISOString(), expiresAt: new Date(t + 24 * 3600_000).toISOString(), entries };
      if (dead) return;
      setStatus(st);
      setLoad({ phase: 'ready', entry: { namespace: preview.namespace, quizId: preview.quizId, version: preview.version, locale: preview.locale, title: preview.title, description: preview.description, itemCount: preview.items.length, path: '', sha256: '', bytes: 0 }, pkg: preview, hashes });
    })();
    return () => { dead = true; };
  }, [preview, now]);

  useEffect(() => {
    if (preview) return;
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        await store.restore(now());
        const [catalog, st] = await Promise.all([loadCatalog(fetcher), loadStatus(fetcher)]);
        setCatalogState(catalog);
        const entry = catalog.quizzes[entryIndex];
        if (!entry) throw new LoadError('目前沒有可用的題庫');
        const pkg = await loadQuiz(fetcher, entry);
        const hashes: Record<string, string> = {};
        for (const it of pkg.items) hashes[itemKey(it)] = await itemHash(it);
        setStatus(st);
        setLoad({ phase: 'ready', entry, pkg, hashes });
      } catch (e) {
        const err = e instanceof LoadError ? e : new LoadError(e instanceof Error ? e.message : '載入失敗');
        setLoad({ phase: 'error', message: err.message, errors: err.errors });
      }
    })();
  }, [fetcher, now, store, entryIndex, preview]);

  const statusRef = useRef<StatusCatalog | null>(null);
  statusRef.current = status;
  const refreshStatus = useCallback(async () => {
    if (preview) return statusRef.current;
    const st = await loadStatus(fetcher);
    setStatus(st);
    return st;
  }, [fetcher, preview]);

  const eligibilityOf = useCallback(
    (item: Item, catalogOverride?: StatusCatalog | null): Eligibility => {
      const hash = load.phase === 'ready' ? load.hashes[itemKey(item)] ?? '' : '';
      return evaluateEligibility({
        item, hash, locale: item.language,
        catalog: catalogOverride === undefined ? status : catalogOverride,
        now: now(), online: preview || typeof navigator === 'undefined' ? true : navigator.onLine,
      });
    },
    [load, status, now, preview],
  );

  const api: AppApi = { load, status, store, snapshot, online, now, refreshStatus, eligibilityOf, preview: !!preview, quizHref: (n) => `${linkBase}/${n}`, endHref, homeHref, catalog: catalogState, entryIndex };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
