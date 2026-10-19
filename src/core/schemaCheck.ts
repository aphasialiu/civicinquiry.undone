// 小型 JSON Schema（2020-12 子集）直譯器，只實作 quiz.schema.json 用到的關鍵字。
// 為什麼不用 Ajv：Ajv 會用 new Function 動態產生驗證程式，而 CSP（SPEC SEC-01）禁止 unsafe-eval。
// Ajv 仍留在 devDependencies，tests/schemaCheck.test.ts 用它做交叉比對，確保兩者判斷一致。

export interface SchemaIssue {
  instancePath: string;
  keyword: string;
  message: string;
}

type Json = unknown;
type Schema = { [k: string]: Json };

const isObj = (v: Json): v is Record<string, Json> => v !== null && typeof v === 'object' && !Array.isArray(v);

function esc(seg: string | number): string {
  return String(seg).replace(/~/g, '~0').replace(/\//g, '~1');
}

const regexCache = new Map<string, RegExp>();
function re(pattern: string): RegExp {
  let r = regexCache.get(pattern);
  if (!r) {
    r = new RegExp(pattern, 'u');
    regexCache.set(pattern, r);
  }
  return r;
}

function isDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function isDateTime(s: string): boolean {
  const m = /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/.exec(s);
  if (!m) return false;
  if (!isDate(m[1])) return false;
  return Number(m[2]) <= 23 && Number(m[3]) <= 59 && Number(m[4]) <= 60;
}

function isUri(s: string): boolean {
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s) || /\s/.test(s)) return false;
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

const FORMATS: Record<string, (s: string) => boolean> = { date: isDate, 'date-time': isDateTime, uri: isUri };

function typeOk(t: string, v: Json): boolean {
  switch (t) {
    case 'string': return typeof v === 'string';
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'integer': return typeof v === 'number' && Number.isInteger(v);
    case 'boolean': return typeof v === 'boolean';
    case 'null': return v === null;
    case 'array': return Array.isArray(v);
    case 'object': return isObj(v);
    default: return false;
  }
}

function deepEqual(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => k in b && deepEqual(a[k], b[k]));
  }
  return false;
}

const codePoints = (s: string) => [...s].length;

export function checkSchema(root: Schema, data: Json): SchemaIssue[] {
  const issues: SchemaIssue[] = [];

  function resolve(ref: string): Schema {
    if (!ref.startsWith('#/')) throw new Error(`不支援的 $ref：${ref}`);
    let cur: Json = root;
    for (const seg of ref.slice(2).split('/')) {
      cur = (cur as Record<string, Json>)[seg.replace(/~1/g, '/').replace(/~0/g, '~')];
    }
    if (!isObj(cur)) throw new Error(`找不到 $ref：${ref}`);
    return cur;
  }

  /** 回傳這個 schema 套到 value 後新增的 issue；呼叫端決定要不要採用（anyOf、if 會丟棄）。 */
  function collect(schema: Schema, value: Json, path: string): SchemaIssue[] {
    const out: SchemaIssue[] = [];
    const add = (keyword: string, message: string, p = path) => out.push({ instancePath: p, keyword, message });

    if (typeof schema.$ref === 'string') out.push(...collect(resolve(schema.$ref), value, path));

    if ('const' in schema && !deepEqual(schema.const, value)) add('const', `必須等於 ${JSON.stringify(schema.const)}`);
    if (Array.isArray(schema.enum) && !schema.enum.some((e) => deepEqual(e, value))) {
      add('enum', `必須是其中之一（可用值：${schema.enum.join('、')}）`);
    }
    if (schema.type !== undefined) {
      const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
      if (!types.some((t) => typeOk(t, value))) add('type', `型別必須是 ${types.join(' 或 ')}`);
    }

    if (typeof value === 'string') {
      const len = codePoints(value);
      if (typeof schema.minLength === 'number' && len < schema.minLength) add('minLength', schema.minLength === 1 ? '這一欄還沒有填。' : `長度不得少於 ${schema.minLength}`);
      if (typeof schema.maxLength === 'number' && len > schema.maxLength) add('maxLength', `長度不得超過 ${schema.maxLength}`);
      if (typeof schema.pattern === 'string' && !re(schema.pattern).test(value)) add('pattern', `格式不符：${schema.pattern}`);
      if (typeof schema.format === 'string') {
        const f = FORMATS[schema.format];
        if (f && !f(value)) add('format', `必須是有效的 ${schema.format}`);
      }
    }

    if (Array.isArray(value)) {
      if (typeof schema.minItems === 'number' && value.length < schema.minItems) add('minItems', `至少要有 ${schema.minItems} 項`);
      if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) add('maxItems', `最多只能有 ${schema.maxItems} 項`);
      if (schema.uniqueItems === true) {
        for (let i = 0; i < value.length; i++) {
          if (value.slice(0, i).some((x) => deepEqual(x, value[i]))) { add('uniqueItems', `第 ${i} 項重複`); break; }
        }
      }
      if (isObj(schema.items)) value.forEach((v, i) => out.push(...collect(schema.items as Schema, v, `${path}/${i}`)));
    }

    if (isObj(value)) {
      const props = isObj(schema.properties) ? (schema.properties as Record<string, Schema>) : {};
      if (Array.isArray(schema.required)) {
        for (const k of schema.required as string[]) if (!(k in value)) add('required', `缺少必要欄位：${k}`);
      }
      for (const [k, sub] of Object.entries(props)) {
        if (k in value) out.push(...collect(sub, value[k], `${path}/${esc(k)}`));
      }
      if (schema.additionalProperties === false) {
        for (const k of Object.keys(value)) if (!(k in props)) add('additionalProperties', `不允許的欄位：${k}`, `${path}/${esc(k)}`);
      }
      if (isObj(schema.propertyNames)) {
        for (const k of Object.keys(value)) {
          if (collect(schema.propertyNames as Schema, k, path).length) add('propertyNames', `欄位名稱不合規則：${k}`, `${path}/${esc(k)}`);
        }
      }
    }

    if (Array.isArray(schema.allOf)) for (const s of schema.allOf as Schema[]) out.push(...collect(s, value, path));
    if (Array.isArray(schema.anyOf)) {
      const branches = (schema.anyOf as Schema[]).map((s) => collect(s, value, path));
      if (!branches.some((b) => b.length === 0)) add('anyOf', '不符合任何一種允許的格式');
    }
    if (isObj(schema.if)) {
      if (collect(schema.if as Schema, value, path).length === 0 && isObj(schema.then)) {
        out.push(...collect(schema.then as Schema, value, path));
      } else if (collect(schema.if as Schema, value, path).length > 0 && isObj(schema.else)) {
        out.push(...collect(schema.else as Schema, value, path));
      }
    }
    return out;
  }

  issues.push(...collect(root, data, ''));
  return issues;
}
