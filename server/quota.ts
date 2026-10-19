// 全站配額（單一程序內原子檢查）。分散式部署需改用共享原子計數器；這只是參考實作。
export interface QuotaLimits { perMinute: number; perDay: number; perMonth: number }

export const DEFAULT_LIMITS: QuotaLimits = { perMinute: 60, perDay: 1000, perMonth: 10000 };

export type Reservation = { ok: true } | { ok: false; retryAfterSeconds: number; reason: 'minute' | 'day' | 'month' };

export class Quota {
  private minute: number[] = [];
  private day = { key: '', n: 0 };
  private month = { key: '', n: 0 };
  /** 當月已用量達上限 80% 時為 true（供營運提示） */
  warned = false;

  constructor(private limits: QuotaLimits = DEFAULT_LIMITS, private now: () => number = Date.now) {}

  /** 檢查並保留一次外部請求額度。JS 單執行緒下，這個同步函式內不會被插隊。 */
  reserve(): Reservation {
    const t = this.now();
    const d = new Date(t);
    const dayKey = d.toISOString().slice(0, 10);
    const monthKey = dayKey.slice(0, 7);
    if (this.day.key !== dayKey) this.day = { key: dayKey, n: 0 };
    if (this.month.key !== monthKey) { this.month = { key: monthKey, n: 0 }; this.warned = false; }
    this.minute = this.minute.filter((x) => t - x < 60_000);

    if (this.month.n >= this.limits.perMonth) {
      const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
      return { ok: false, reason: 'month', retryAfterSeconds: Math.ceil((next - t) / 1000) };
    }
    if (this.day.n >= this.limits.perDay) {
      const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
      return { ok: false, reason: 'day', retryAfterSeconds: Math.ceil((next - t) / 1000) };
    }
    if (this.minute.length >= this.limits.perMinute) {
      return { ok: false, reason: 'minute', retryAfterSeconds: Math.max(1, Math.ceil((60_000 - (t - this.minute[0])) / 1000)) };
    }
    this.minute.push(t);
    this.day.n++;
    this.month.n++;
    if (this.month.n >= this.limits.perMonth * 0.8) this.warned = true;
    return { ok: true };
  }

  usage() { return { minute: this.minute.length, day: this.day.n, month: this.month.n }; }
}
