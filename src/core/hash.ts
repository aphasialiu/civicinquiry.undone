// 穩定序列化（鍵排序、兩格縮排、LF）與 SHA-256。瀏覽器與 Node 共用。

export function stableStringify(value: unknown, indent = 2): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      const o: Record<string, unknown> = {};
      for (const k of Object.keys(v as object).sort()) o[k] = sort((v as Record<string, unknown>)[k]);
      return o;
    }
    return v;
  };
  return JSON.stringify(sort(value), null, indent);
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 單題內容雜湊：審查與狀態都綁這個值，內容一改就變。 */
export function itemHash(item: unknown): Promise<string> {
  return sha256Hex(stableStringify(item, 0));
}
