// SEC-02/SEC-03：嚴格 JSON 解析。
// 標準 JSON.parse 會靜默吃掉重複 key（後者覆蓋前者），也不擋原型污染鍵，
// 所以自己寫一個小的遞迴下降解析器。

export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_DEPTH = 20;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export class StrictJsonError extends Error {
  constructor(
    public readonly code: 'TOO_LARGE' | 'SYNTAX' | 'DUPLICATE_KEY' | 'FORBIDDEN_KEY' | 'TOO_DEEP',
    message: string,
    public readonly path: string,
  ) {
    super(message);
    this.name = 'StrictJsonError';
  }
}

function pointer(parts: string[]): string {
  return parts.map((p) => '/' + p.replace(/~/g, '~0').replace(/\//g, '~1')).join('');
}

export function parseStrictJson(text: string): unknown {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_BYTES) {
    throw new StrictJsonError('TOO_LARGE', `檔案 ${bytes} 位元組，超過 2 MiB 上限`, '');
  }
  let i = 0;
  const path: string[] = [];

  const fail = (msg: string): never => {
    throw new StrictJsonError('SYNTAX', `JSON 格式錯誤（第 ${i} 字元）：${msg}`, pointer(path));
  };
  const ws = () => {
    while (i < text.length && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) i++;
  };

  function value(depth: number): unknown {
    if (depth > MAX_DEPTH) {
      throw new StrictJsonError('TOO_DEEP', `巢狀深度超過 ${MAX_DEPTH}`, pointer(path));
    }
    ws();
    const c = text[i];
    if (c === '{') return object(depth);
    if (c === '[') return array(depth);
    if (c === '"') return string();
    if (c === 't' && text.startsWith('true', i)) { i += 4; return true; }
    if (c === 'f' && text.startsWith('false', i)) { i += 5; return false; }
    if (c === 'n' && text.startsWith('null', i)) { i += 4; return null; }
    return number();
  }

  function number(): number {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i, i + 64));
    if (!m) return fail('預期是值');
    i += m[0].length;
    return Number(m[0]);
  }

  function string(): string {
    // text[i] === '"'
    let j = i + 1;
    let out = '';
    while (j < text.length) {
      const ch = text[j];
      if (ch === '"') {
        i = j + 1;
        return out;
      }
      if (ch === '\\') {
        const n = text[j + 1];
        const simple: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (n === 'u') {
          const hex = text.slice(j + 2, j + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) { i = j; return fail('無效的 \\u 逸出'); }
          out += String.fromCharCode(parseInt(hex, 16));
          j += 6;
          continue;
        }
        if (n !== undefined && n in simple) { out += simple[n]; j += 2; continue; }
        i = j;
        return fail('無效的逸出字元');
      }
      if (ch < ' ') { i = j; return fail('字串內不可有未跳脫的控制字元'); }
      out += ch;
      j++;
    }
    i = j;
    return fail('字串未結束');
  }

  function array(depth: number): unknown[] {
    i++; // [
    const out: unknown[] = [];
    ws();
    if (text[i] === ']') { i++; return out; }
    for (;;) {
      path.push(String(out.length));
      out.push(value(depth + 1));
      path.pop();
      ws();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === ']') { i++; return out; }
      return fail('預期 , 或 ]');
    }
  }

  function object(depth: number): Record<string, unknown> {
    i++; // {
    // 用無原型物件承接，即使漏掉檢查也不會污染 Object.prototype
    const out: Record<string, unknown> = Object.create(null);
    ws();
    if (text[i] === '}') { i++; return out; }
    for (;;) {
      ws();
      if (text[i] !== '"') return fail('預期屬性名稱');
      const key = string();
      if (FORBIDDEN_KEYS.has(key)) {
        throw new StrictJsonError('FORBIDDEN_KEY', `不允許的鍵：${key}`, pointer([...path, key]));
      }
      if (Object.prototype.hasOwnProperty.call(out, key)) {
        throw new StrictJsonError('DUPLICATE_KEY', `重複的鍵：${key}`, pointer([...path, key]));
      }
      ws();
      if (text[i] !== ':') return fail('預期 :');
      i++;
      path.push(key);
      out[key] = value(depth + 1);
      path.pop();
      ws();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === '}') { i++; return out; }
      return fail('預期 , 或 }');
    }
  }

  const result = value(0);
  ws();
  if (i < text.length) fail('結尾還有多餘內容');
  return result;
}
