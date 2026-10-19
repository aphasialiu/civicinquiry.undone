// 內容發布：驗證 content-src/*.quiz.json → 寫入 public/content（不可變內容、catalog、status）。
// 驗證失敗就中止，不產生部分檔案。審查標章只能由 content-src/status-overrides.json 授予，
// 題目檔內的 governance 只是作者聲明。
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateText } from '../src/core/validator';
import { parseStrictJson } from '../src/core/strictJson';
import { itemHash, sha256Hex, stableStringify } from '../src/core/hash';
import { checkTranslations, translationErrors, OUTDATED_PREFIX } from '../src/core/translation';
import type { Catalog, QuizPackage, StatusCatalog, StatusEntry } from '../src/core/types';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'content-src');
const outDir = join(root, 'public', 'content');

// SPEC §7：有伺服器與撤回服務時，status 有效期最長 24 小時（預設）。
// 純靜態託管（GitHub Pages）沒有撤回服務，撤回＝改檔再重新發布；這時可用 STATUS_TTL_HOURS 拉長，避免網站沒人維護時題目全部變成「歷史閱讀」。
const STATUS_TTL_MS = Number(process.env.STATUS_TTL_HOURS ?? 24) * 60 * 60 * 1000;

type Override = Partial<Pick<StatusEntry, 'lifecycle' | 'verification' | 'reviewerOrg' | 'reason' | 'supersededBy'>>;

async function main() {
  const overridesPath = join(srcDir, 'status-overrides.json');
  const overrides: Record<string, Override> = existsSync(overridesPath)
    ? (parseStrictJson(readFileSync(overridesPath, 'utf8')) as Record<string, Override>)
    : {};

  // fixtures（測試題庫）只在 CIVIC_FIXTURES=1 時發布，一般建置不會把它們當正式內容。
  const files = readdirSync(srcDir).filter((f) => f.endsWith('.quiz.json'));
  if (process.env.CIVIC_FIXTURES === '1' && existsSync(join(srcDir, 'fixtures'))) {
    for (const f of readdirSync(join(srcDir, 'fixtures')).filter((x) => x.endsWith('.quiz.json'))) files.push(join('fixtures', f));
  }
  if (files.length === 0) throw new Error('content-src 內沒有 *.quiz.json');

  // 先全部驗證，任何一份失敗就整批中止
  const packages: Array<{ pkg: QuizPackage; text: string; file: string }> = [];
  let failed = false;
  for (const file of files) {
    const text = readFileSync(join(srcDir, file), 'utf8');
    const res = validateText(text);
    if (!res.ok || !res.pkg) {
      failed = true;
      console.error(`✗ ${file}`);
      for (const e of res.errors) console.error(`   ${e.code} ${e.path || '(root)'} ${e.message}`);
    } else {
      packages.push({ pkg: res.pkg, text, file });
    }
  }
  const terrs = translationErrors(packages.map((p) => p.pkg));
  for (const e of terrs) { failed = true; console.error(`   ${e.code} ${e.path} ${e.message}`); }
  if (failed) {
    console.error('內容驗證失敗，未寫入任何檔案。');
    process.exit(1);
  }

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const now = new Date();
  const catalog: Catalog = { generatedAt: now.toISOString(), quizzes: [] };
  const status: StatusCatalog = {
    generatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + STATUS_TTL_MS).toISOString(),
    entries: [],
  };

  const outdated = new Map(checkTranslations(packages.map((p) => p.pkg)).filter((i) => i.kind === 'outdated').map((i) => [`${i.itemId}@${i.locale}`, i]));
  packages.sort((a, b) => Number(a.file.startsWith('fixtures')) - Number(b.file.startsWith('fixtures')) || a.file.localeCompare(b.file));
  for (const { pkg } of packages) {
    // 正式輸出：鍵排序、UTF-8、LF、兩格縮排
    const body = stableStringify(pkg) + '\n';
    const rel = `${pkg.namespace}/${pkg.quizId}/${pkg.version}/${pkg.locale}.json`;
    const dest = join(outDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, body, 'utf8');
    const bytes = new TextEncoder().encode(body);
    catalog.quizzes.push({
      namespace: pkg.namespace, quizId: pkg.quizId, version: pkg.version, locale: pkg.locale,
      title: pkg.title, description: pkg.description, itemCount: pkg.items.length,
      path: `/content/${rel}`, sha256: await sha256Hex(bytes), bytes: bytes.length,
    });
    for (const item of pkg.items) {
      const ov = overrides[`${item.id}@${item.version}`] ?? {};
      status.entries.push({
        itemId: item.id, version: item.version, locale: item.language,
        sha256: await itemHash(item),
        lifecycle: ov.lifecycle ?? item.governance.lifecycle,
        // 作者自稱 reviewed 無效：未在 overrides 授予就一律 unreviewed
        verification: ov.verification ?? 'unreviewed',
        reviewerOrg: ov.reviewerOrg ?? null,
        // 原文升版後，譯本標示待更新；譯文的審查狀態永遠獨立，不沿用原文
        reason: ov.reason ?? (outdated.has(`${item.id}@${item.language}`) ? `${OUTDATED_PREFIX}${outdated.get(`${item.id}@${item.language}`)!.originalVersion}` : null), supersededBy: ov.supersededBy ?? null,
      });
    }
  }

  writeFileSync(join(outDir, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n', 'utf8');
  writeFileSync(join(outDir, 'status.json'), JSON.stringify(status, null, 2) + '\n', 'utf8');
  console.log(`✓ 已發布 ${packages.length} 份題庫、${status.entries.length} 題；status 有效至 ${status.expiresAt}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
