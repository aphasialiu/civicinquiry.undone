// 參考用 Node 部署：同源提供 POST /api/v1/search。沒有金鑰時使用測試替身。
import { createServer } from 'node:http';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateText } from '../src/core/validator';
import type { QuizPackage } from '../src/core/types';
import { handleSearch, type Deps } from './handler';
import { buildProfiles } from './profiles';
import { TestStubProvider, type StubMode } from './providers';
import { Quota } from './quota';
import { STUB_RIGHTS } from './rights';
import { MAX_BODY_BYTES } from '../src/search/contract';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgs: QuizPackage[] = [];
const files = readdirSync(join(root, 'content-src')).filter((x) => x.endsWith('.quiz.json'));
if (process.env.CIVIC_FIXTURES === '1') for (const f of readdirSync(join(root, 'content-src', 'fixtures'))) files.push(join('fixtures', f));
for (const f of files) {
  const r = validateText(readFileSync(join(root, 'content-src', f), 'utf8'));
  if (!r.ok || !r.pkg) throw new Error(`${f} 驗證失敗，代理不啟動`);
  pkgs.push(r.pkg);
}

const deps: Deps = {
  profiles: buildProfiles(pkgs),
  provider: new TestStubProvider((process.env.CIVIC_SEARCH_STUB_MODE as StubMode) || 'ok'),
  rights: STUB_RIGHTS,
  quota: new Quota({
    perMinute: Number(process.env.CIVIC_QUOTA_PER_MINUTE ?? 60),
    perDay: Number(process.env.CIVIC_QUOTA_PER_DAY ?? 1000),
    perMonth: Number(process.env.CIVIC_QUOTA_PER_MONTH ?? 10000),
  }),
  now: () => new Date(),
};

const port = Number(process.env.PORT ?? 8787);

createServer((req, res) => {
  // 不記錄請求 body、query 或來源 IP（PR-03）
  if (req.url !== '/api/v1/search') { res.writeHead(404).end(); return; }
  const chunks: Buffer[] = [];
  let size = 0;
  let tooBig = false;
  req.on('data', (c: Buffer) => {
    size += c.length;
    if (size > MAX_BODY_BYTES + 1) { tooBig = true; return; }
    chunks.push(c);
  });
  req.on('end', async () => {
    const out = await handleSearch(
      { method: req.method ?? '', contentType: req.headers['content-type'], body: tooBig ? 'x'.repeat(MAX_BODY_BYTES + 1) : Buffer.concat(chunks).toString('utf8') },
      deps,
    );
    res.writeHead(out.status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      ...(out.retryAfter ? { 'Retry-After': String(out.retryAfter) } : {}),
    });
    res.end(JSON.stringify(out.body));
  });
}).listen(port, () => console.log(`搜尋代理（測試替身）已啟動：http://localhost:${port}/api/v1/search`));
