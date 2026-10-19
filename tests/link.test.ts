// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeQuiz, encodeQuiz, escapeForScript, RECOMMENDED_LINK_CHARS } from '../src/share/link';
import { stableStringify } from '../src/core/hash';
import type { QuizPackage } from '../src/core/types';

const twelve = JSON.parse(readFileSync(join(__dirname, '..', 'content-src', 'constitution.quiz.json'), 'utf8')) as QuizPackage;
const items2 = twelve.items.slice(0, 2);
const used = new Set(items2.flatMap((i) => [...i.evidenceIds, ...i.readingIds]));
const one: QuizPackage = { ...twelve, items: items2, sources: twelve.sources.filter((s) => used.has(s.id)) };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe('分享連結編碼', () => {
  it('往返：內容完全相同', async () => {
    const payload = await encodeQuiz(one);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    const r = await decodeQuiz(payload);
    expect(r.ok).toBe(true);
    if (r.ok) expect(stableStringify(r.pkg)).toBe(stableStringify(one));
  });
  it('12 題整份能不能放進連結：量測長度（只是紀錄，不是要求）', async () => {
    const p = await encodeQuiz(twelve);
    console.log(`12 題：${p.length} 字元；2 題：${(await encodeQuiz(one)).length} 字元；建議上限 ${RECOMMENDED_LINK_CHARS}`);
    expect((await decodeQuiz(p)).ok).toBe(true);
  });
  it('損壞或被截斷的連結 → 說明原因，不拋錯', async () => {
    const p = await encodeQuiz(one);
    for (const bad of [p.slice(0, p.length / 2), '!!!', '', p + '$', 'A'.repeat(50)]) {
      const r = await decodeQuiz(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors[0].code).toMatch(/LINK_FORMAT|SCHEMA|JSON_SYNTAX|SEC00/);
    }
  });
  it('壓縮炸彈（解開超過 2 MiB）→ 在上限處中止並拒絕', async () => {
    const bomb = new Uint8Array(40 * 1024 * 1024).fill(32); // 40 MiB 的空白，壓縮後很小
    const s = new CompressionStream('deflate-raw');
    const w = s.writable.getWriter();
    void w.write(bomb).then(() => w.close());
    const chunks: Uint8Array[] = [];
    const rd = s.readable.getReader();
    for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); }
    const bytes = Buffer.concat(chunks);
    expect(bytes.length).toBeLessThan(200_000);
    const payload = bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const r = await decodeQuiz(payload);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe('LINK_TOO_LARGE');
  });
  it('連結裡的內容一樣要通過完整驗證：HTML、javascript 連結、未知版本、重複 key 都拒絕', async () => {
    const enc = async (obj: unknown) => encodeQuiz(obj as QuizPackage);
    const h = clone(one); h.items[0].explanation.short = '<script>alert(1)</script>';
    const j = clone(one); j.sources[0].url = 'javascript:alert(1)';
    const v = { ...clone(one), schemaVersion: '2.0.0' };
    for (const x of [h, j, v]) expect((await decodeQuiz(await enc(x))).ok).toBe(false);
    // 重複 key 需要手工組 JSON 文字
    const dupText = stableStringify(one, 0).replace('"quizId"', '"quizId":"a","quizId"');
    const s = new CompressionStream('deflate-raw');
    const w = s.writable.getWriter();
    void w.write(new TextEncoder().encode(dupText)).then(() => w.close());
    const chunks: Uint8Array[] = [];
    const rd = s.readable.getReader();
    for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); }
    const p = Buffer.concat(chunks).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const r = await decodeQuiz(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe('SEC002');
  });
  it('escapeForScript：</script> 與 <!-- 不會提早結束標籤，但還原後內容不變', () => {
    const json = JSON.stringify({ a: '</script><!--x', b: ' ' });
    const esc = escapeForScript(json);
    expect(esc).not.toContain('<');
    expect(JSON.parse(esc)).toEqual(JSON.parse(json));
  });
});
