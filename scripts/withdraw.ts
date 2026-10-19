// 撤回操作：在 status-overrides.json 標記某題（版本）已撤回並附理由，然後重新產生狀態目錄。
// 用法：npm run withdraw -- tw-budget-01@0.1.0 "來源判決已更新" [取代版本]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Overrides = Record<string, Record<string, unknown>>;

export function applyWithdrawal(overrides: Overrides, key: string, reason: string, supersededBy: string | null = null): Overrides {
  if (!/^[a-z0-9][a-z0-9.-]*@\d+\.\d+\.\d+$/.test(key)) throw new Error('第一個參數必須是「題目代號@版本」，例如 tw-budget-01@0.1.0');
  if (!reason.trim()) throw new Error('必須寫撤回理由（讀者會看到）');
  return { ...overrides, [key]: { ...(overrides[key] ?? {}), lifecycle: 'withdrawn', reason: reason.trim(), supersededBy } };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [key, reason, sup] = process.argv.slice(2);
  const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'content-src', 'status-overrides.json');
  const cur: Overrides = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  try {
    writeFileSync(file, JSON.stringify(applyWithdrawal(cur, key ?? '', reason ?? '', sup ?? null), null, 2) + '\n');
    console.log(`已標記撤回 ${key}。接著執行 npm run content，並只把 public/content/status.json 部署出去（目標 15 分鐘內生效）。`);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
