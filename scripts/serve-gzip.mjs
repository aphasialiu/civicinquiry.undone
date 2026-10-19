// 效能量測用：模擬正式託管（有壓縮）。不是部署用伺服器。
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { extname, join, normalize } from 'node:path';

const [dir = 'dist', port = '4182'] = process.argv.slice(2);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const cache = new Map();

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    let p = normalize(decodeURIComponent(url.pathname));
    while (p.startsWith('/') || p.startsWith(String.fromCharCode(92))) p = p.slice(1);
    if (p.includes('..')) { res.writeHead(400).end(); return; }
    let file = join(dir, p || 'index.html');
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    let body = cache.get(file);
    if (!body) { body = await readFile(file); cache.set(file, body); }
    const ext = extname(file);
    const headers = { 'Content-Type': types[ext] ?? 'application/octet-stream', 'Cache-Control': 'no-store' };
    if (types[ext] && /gzip/.test(req.headers['accept-encoding'] ?? '')) {
      const key = file + ':gz';
      let z = cache.get(key);
      if (!z) { z = gzipSync(body); cache.set(key, z); }
      res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': z.length });
      res.end(z);
    } else {
      res.writeHead(200, { ...headers, 'Content-Length': body.length });
      res.end(body);
    }
  } catch {
    res.writeHead(404).end();
  }
}).listen(Number(port), () => console.log(`gzip static server on ${port}`));
