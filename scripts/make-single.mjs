// 單一檔案版：把整個網站（HTML、JS、CSS）和題庫塞進一個 .html，雙擊就能用、完全離線。
// 輸出：dist-single/template.html（沒有題庫，給作者工具用）、dist-single/civic-inquiry-constitution.html。
// 並把 template 複製成 dist/single-template.html，讓網站上的作者工具可以「下載成單一檔案」。
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = 'dist-single';
const r = spawnSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], {
  stdio: 'inherit', shell: true, env: { ...process.env, VITE_SEARCH_ENABLED: 'false', VITE_PWA: 'false' },
});
if (r.status !== 0) process.exit(r.status ?? 1);

let html = readFileSync(join(out, 'index.html'), 'utf8');
const assets = readdirSync(join(out, 'assets'));
const js = assets.find((f) => f.endsWith('.js'));
const css = assets.find((f) => f.endsWith('.css'));
if (!js || !css) throw new Error('找不到打包後的 JS／CSS');

// </script 出現在 JS 字串裡會提早結束標籤，改成等價的 <\/script
const jsText = readFileSync(join(out, 'assets', js), 'utf8').split('</script').join('<\/script');
const cssText = readFileSync(join(out, 'assets', css), 'utf8').split('</style').join('<\/style');

// 移除原本的外部引用、CSP meta、manifest 與圖示（單一檔案裡沒有這些檔案）
html = html
  .replace(/<script type="module"[^>]*src="[^"]*"[^>]*><\/script>/, '')
  .replace(/<link rel="stylesheet"[^>]*>/, '')
  .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
  .replace(/<link rel="manifest"[^>]*>/, '')
  .replace(/<link rel="icon"[^>]*>/, '');

const sha = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
// 單一檔案版完全不對外連線：connect-src 'none'
const csp = `default-src 'none'; script-src ${sha(jsText)}; style-src ${sha(cssText)}; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'`;

// 注意：一律用「函式」當取代內容。字串取代內容裡的 $& $' 等會被當成特殊符號，JS 裡很常有這些字元。
html = html.replace('<head>', () => `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
html = html.replace('</head>', () => `    <style>${cssText}</style>\n  </head>`);
html = html.replace('</body>', () => `    <script type="module">${jsText}</script>\n  </body>`);

const MARKER = '<script type="application/json" id="civic-data">null</script>';
if (!html.includes(MARKER)) throw new Error('範本裡找不到題庫資料區塊');

// 檢查：內嵌後只能有我們雜湊過的那一個可執行 script 與一個 style
const shell = html.split(jsText).join('').split(cssText).join('');
const execScripts = [...shell.matchAll(/<script(?![^>]*application\/json)[^>]*>/g)].length;
if (execScripts !== 1) throw new Error(`預期只有 1 個可執行 script，實際 ${execScripts}：` + [...shell.matchAll(/<script[^>]*>/g)].map((m) => m[0]).join(" "));

rmSync(join(out, 'assets'), { recursive: true, force: true });
for (const f of readdirSync(out)) if (f !== 'template.html') rmSync(join(out, f), { recursive: true, force: true });
writeFileSync(join(out, 'template.html'), html, 'utf8');

// 內建題庫版（憲政 12 題）
const esc = (json) => json.split('<').join(String.fromCharCode(92) + 'u003c');
const pkgPath = 'public/content/prototype.tw/constitution/0.1.0/zh-Hant-TW.json';
if (existsSync(pkgPath)) {
  const data = esc(JSON.stringify(JSON.parse(readFileSync(pkgPath, 'utf8'))));
  writeFileSync(join(out, 'civic-inquiry-constitution.html'), html.replace(MARKER, () => `<script type="application/json" id="civic-data">${data}</script>`), 'utf8');
}
// 試答版：內建 12 題，並開啟試答模式（作答後有選填回饋、可下載試答紀錄）
const CONFIG = '<script type="application/json" id="civic-config">{}</script>';
if (existsSync(join(out, 'civic-inquiry-constitution.html'))) {
  const base = readFileSync(join(out, 'civic-inquiry-constitution.html'), 'utf8');
  if (!base.includes(CONFIG)) throw new Error('找不到設定區塊');
  writeFileSync(join(out, 'civic-inquiry-pilot.html'), base.replace(CONFIG, () => '<script type="application/json" id="civic-config">{"pilot":true}</script>'), 'utf8');
}
if (existsSync('dist')) copyFileSync(join(out, 'template.html'), join('dist', 'single-template.html'));
console.log(`✓ 單一檔案版完成：${out}（範本 ${(html.length / 1024).toFixed(0)} KiB）`);
