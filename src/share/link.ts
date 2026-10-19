// 把題庫放進網址：JSON → 壓縮 → base64url。網址的 # 後面不會送到任何伺服器，所以不需要後端。
// 解碼端把內容當成「不可信資料」：限制大小（防壓縮炸彈）、嚴格解析、完整驗證。
import { stableStringify } from '../core/hash';
import { MAX_BYTES } from '../core/strictJson';
import { validateText } from '../core/validator';
import type { QuizPackage, ValidationError } from '../core/types';

/** 超過這個長度，有些通訊軟體會截斷連結；介面會提醒改用檔案。 */
export const RECOMMENDED_LINK_CHARS = 8000;
/** 超過這個長度的 payload 直接拒絕，不嘗試解碼。 */
const MAX_PAYLOAD_CHARS = 1_000_000;

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, cap = Infinity): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(bytes as BufferSource).then(() => writer.close()).catch(() => undefined);
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) { await reader.cancel(); throw new Error('TOO_LARGE'); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

export async function encodeQuiz(pkg: QuizPackage): Promise<string> {
  const raw = new TextEncoder().encode(stableStringify(pkg, 0));
  return toBase64Url(await pipe(raw, new CompressionStream('deflate-raw')));
}

export type DecodeResult = { ok: true; pkg: QuizPackage } | { ok: false; errors: ValidationError[] };

export async function decodeQuiz(payload: string): Promise<DecodeResult> {
  const fail = (code: string, message: string): DecodeResult => ({ ok: false, errors: [{ path: '', code, message }] });
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || payload.length > MAX_PAYLOAD_CHARS) return fail('LINK_FORMAT', '這個連結不完整或已損壞（可能在傳送時被截斷了）。');
  let text: string;
  try {
    const bytes = await pipe(fromBase64Url(payload), new DecompressionStream('deflate-raw'), MAX_BYTES);
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (e) {
    return (e as Error).message === 'TOO_LARGE'
      ? fail('LINK_TOO_LARGE', '這個連結解開後超過 2 MiB 上限，已拒絕。')
      : fail('LINK_FORMAT', '這個連結不完整或已損壞（可能在傳送時被截斷了）。');
  }
  const r = validateText(text);
  return r.ok && r.pkg ? { ok: true, pkg: r.pkg } : { ok: false, errors: r.errors };
}

/** 單一檔案版會把題庫放在這個 <script type="application/json"> 裡；`<` 轉成 <，避免提早結束標籤。 */
export function escapeForScript(json: string): string {
  const ls = new RegExp(String.fromCharCode(0x2028), 'g');
  const ps = new RegExp(String.fromCharCode(0x2029), 'g');
  const bs = String.fromCharCode(92); // 反斜線
  return json.replace(/</g, bs + 'u003c').replace(ls, bs + 'u2028').replace(ps, bs + 'u2029');
}
