// SessionStore：記憶體 Attempt → 本機儲存或刪除。不含任何遠端同步。
import { emptySession, newRunId, type Attempt, type SessionData } from './attempt';
import { emptyPilotNote, type PilotNote } from '../pilot';
import { clearSaved, loadSaved, writeSaved, type SavedRecord } from './persistence';

export interface StoreSnapshot {
  data: SessionData;
  /** 是否已選擇「只儲存在這台裝置」 */
  persisted: boolean;
  savedAt: string | null;
  /** 儲存失敗時為 true：已回退到記憶體，作答不受影響 */
  persistFailed: boolean;
}

export class SessionStore {
  private snap: StoreSnapshot = { data: emptySession(), persisted: false, savedAt: null, persistFailed: false };
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };
  getSnapshot = (): StoreSnapshot => this.snap;

  private set(next: Partial<StoreSnapshot>) {
    this.snap = { ...this.snap, ...next };
    this.listeners.forEach((l) => l());
  }

  /** 啟動時還原（已過期的會在 loadSaved 裡刪除）。 */
  async restore(now: Date): Promise<void> {
    const rec = await loadSaved(now);
    if (rec) this.set({ data: rec.data, persisted: true, savedAt: rec.savedAt });
  }

  private async flush() {
    if (!this.snap.persisted || !this.snap.savedAt) return;
    const rec: SavedRecord = { schema: 1, savedAt: this.snap.savedAt, data: this.snap.data };
    const ok = await writeSaved(rec);
    if (!ok) this.set({ persisted: false, savedAt: null, persistFailed: true });
  }

  /** 揭曉時記錄一次 Attempt；同一 run 同一題只記第一次（雙擊提交冪等，揭曉後不得覆寫）。 */
  commitAttempt(a: Attempt): boolean {
    const d = this.snap.data;
    if (d.attempts.some((x) => x.runId === a.runId && x.itemId === a.itemId && x.itemVersion === a.itemVersion)) return false;
    this.set({ data: { ...d, attempts: [...d.attempts, a] } });
    void this.flush();
    return true;
  }

  /** 試答模式的回饋（只在記憶體；不會被儲存到裝置或送出）。 */
  private pilot: Record<string, PilotNote> = {};
  getPilot = (key: string): PilotNote => this.pilot[key] ?? emptyPilotNote();
  allPilot = (): Record<string, PilotNote> => this.pilot;
  setPilot(key: string, patch: Partial<PilotNote>) {
    this.pilot = { ...this.pilot, [key]: { ...this.getPilot(key), ...patch } };
    this.set({});
  }

  getAttempt(itemId: string, itemVersion: string): Attempt | undefined {
    const d = this.snap.data;
    return d.attempts.find((x) => x.runId === d.runId && x.itemId === itemId && x.itemVersion === itemVersion);
  }

  setNote(itemId: string, text: string) {
    const notes = { ...this.snap.data.notes };
    if (text) notes[itemId] = text;
    else delete notes[itemId];
    this.set({ data: { ...this.snap.data, notes } });
    void this.flush();
  }

  /** 「重新練習」另起一個 run，不和首次混算。 */
  startNewRun() {
    const d = this.snap.data;
    this.set({ data: { ...d, runId: newRunId(), runIndex: d.runIndex + 1 } });
    void this.flush();
  }

  async enablePersistence(now: Date): Promise<boolean> {
    const savedAt = now.toISOString();
    const ok = await writeSaved({ schema: 1, savedAt, data: this.snap.data });
    if (ok) this.set({ persisted: true, savedAt, persistFailed: false });
    else this.set({ persisted: false, savedAt: null, persistFailed: true });
    return ok;
  }

  /** 關閉儲存並刪除已存的資料；目前分頁記憶體中的內容保留。 */
  async disablePersistence(): Promise<void> {
    await clearSaved();
    this.set({ persisted: false, savedAt: null });
  }

  /** 一鍵清除進度及筆記：記憶體與本機儲存都清掉。 */
  async clearAll(): Promise<void> {
    await clearSaved();
    this.set({ data: emptySession(), persisted: false, savedAt: null, persistFailed: false });
  }
}
