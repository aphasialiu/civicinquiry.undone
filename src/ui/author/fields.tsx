// 表單欄位：以 JSON 路徑綁定草稿，驗證錯誤的 path 直接對應到欄位。
import { createContext, useContext, useId, type ReactNode } from 'react';
import type { QuizPackage, ValidationError } from '../../core/types';
import { getIn, pointerOf, type Path } from '../../authoring/draft';

export interface DraftApi {
  pkg: QuizPackage;
  errors: ValidationError[];
  set: (path: Path, value: unknown) => void;
  update: (fn: (p: QuizPackage) => QuizPackage) => void;
}

export const DraftCtx = createContext<DraftApi | null>(null);
export function useDraft(): DraftApi {
  const v = useContext(DraftCtx);
  if (!v) throw new Error('useDraft 必須在草稿編輯器內使用');
  return v;
}

export function errorsAt(errors: ValidationError[], path: Path, deep = false): ValidationError[] {
  const p = pointerOf(path);
  return errors.filter((e) => e.path === p || (deep && e.path.startsWith(p + '/')));
}

function Errors({ id, list }: { id: string; list: ValidationError[] }) {
  if (list.length === 0) return null;
  return <p id={id} className="field-error" role="alert">{list.map((e) => e.message).join('；')}</p>;
}

interface BaseProps { path: Path; label: string; hint?: ReactNode }

export function TextField({ path, label, hint, multiline = false, type = 'text' }: BaseProps & { multiline?: boolean; type?: string }) {
  const d = useDraft();
  const id = useId();
  const errs = errorsAt(d.errors, path);
  const value = (getIn(d.pkg, path) as string | undefined) ?? '';
  const common = {
    id, value, 'aria-invalid': errs.length > 0 || undefined,
    'aria-describedby': [hint ? `${id}-h` : '', errs.length ? `${id}-e` : ''].filter(Boolean).join(' ') || undefined,
    onChange: (e: { target: { value: string } }) => d.set(path, e.target.value),
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && <p id={`${id}-h`} className="muted hint">{hint}</p>}
      {multiline ? <textarea rows={4} {...common} /> : <input type={type} {...common} />}
      <Errors id={`${id}-e`} list={errs} />
    </div>
  );
}

export function SelectField({ path, label, options, hint }: BaseProps & { options: Array<[string, string]> }) {
  const d = useDraft();
  const id = useId();
  const errs = errorsAt(d.errors, path);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && <p className="muted hint">{hint}</p>}
      <select id={id} value={(getIn(d.pkg, path) as string) ?? ''} onChange={(e) => d.set(path, e.target.value)} aria-invalid={errs.length > 0 || undefined}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <Errors id={`${id}-e`} list={errs} />
    </div>
  );
}

/** 日期欄位（臺灣時區）：資料是 ISO 時間戳，畫面只讓作者選日期。 */
export function DateField({ path, label, hint, mode, nullable = false }: BaseProps & { mode: 'date' | 'datetime'; nullable?: boolean }) {
  const d = useDraft();
  const id = useId();
  const errs = errorsAt(d.errors, path);
  const raw = getIn(d.pkg, path) as string | null | undefined;
  const shown = raw ? (mode === 'date' ? raw : toTaipeiDay(raw)) : '';
  const write = (v: string) => {
    if (!v) return d.set(path, nullable ? null : '');
    d.set(path, mode === 'date' ? v : new Date(`${v}T00:00:00+08:00`).toISOString());
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && <p className="muted hint">{hint}</p>}
      <input id={id} type="date" value={shown} onChange={(e) => write(e.target.value)} aria-invalid={errs.length > 0 || undefined} />
      {nullable && raw && <button type="button" className="linklike" onClick={() => d.set(path, null)}>清除這個日期</button>}
      <Errors id={`${id}-e`} list={errs} />
    </div>
  );
}

function toTaipeiDay(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
}

export function StringList({ path, label, hint, addLabel, min = 1, max = 10, placeholder }: BaseProps & { addLabel: string; min?: number; max?: number; placeholder?: string }) {
  const d = useDraft();
  const id = useId();
  const list = (getIn(d.pkg, path) as string[] | undefined) ?? [];
  const errs = errorsAt(d.errors, path, true);
  return (
    <fieldset className="field-group">
      <legend>{label}</legend>
      {hint && <p className="muted hint">{hint}</p>}
      {list.map((v, i) => (
        <div key={i} className="row">
          <label className="visually-hidden" htmlFor={`${id}-${i}`}>{label} 第 {i + 1} 項</label>
          <input id={`${id}-${i}`} type="text" value={v} placeholder={placeholder} onChange={(e) => d.set([...path, i], e.target.value)} />
          <button type="button" className="btn btn-ghost" disabled={list.length <= min} onClick={() => d.set(path, list.filter((_, k) => k !== i))}>
            移除<span className="visually-hidden">第 {i + 1} 項</span>
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary" disabled={list.length >= max} onClick={() => d.set(path, [...list, ''])}>{addLabel}</button>
      <Errors id={`${id}-e`} list={errs} />
    </fieldset>
  );
}

/** 從來源清單勾選（證據、延伸閱讀）。 */
export function SourceChecks({ path, label, hint }: BaseProps) {
  const d = useDraft();
  const chosen = (getIn(d.pkg, path) as string[] | undefined) ?? [];
  const errs = errorsAt(d.errors, path, true);
  return (
    <fieldset className="field-group">
      <legend>{label}</legend>
      {hint && <p className="muted hint">{hint}</p>}
      {d.pkg.sources.length === 0 && <p className="notice">還沒有來源。請先到「來源」步驟新增。</p>}
      {d.pkg.sources.map((s) => (
        <label key={s.id} className="inline-check">
          <input type="checkbox" checked={chosen.includes(s.id)} onChange={(e) => d.set(path, e.target.checked ? [...chosen, s.id] : chosen.filter((x) => x !== s.id))} />
          {s.title || s.id}
        </label>
      ))}
      <Errors id={`${label}-e`} list={errs} />
    </fieldset>
  );
}
