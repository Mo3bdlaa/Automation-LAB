/**
 * Small, selector-stable UI primitives. Every interactive element takes a
 * `testId` and renders it as both `id` and `data-testid` (docs/selectors.md).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { Violation } from "@/lib/validation/engine";

export function Page({ title, titleId = "page-title", actions, children }: { title: string; titleId?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 id={titleId} data-testid={titleId} className="text-2xl font-semibold text-primary">
          {title}
        </h1>
        {actions ? <div className="flex gap-2">{actions}</div> : null}
      </div>
      {children}
    </main>
  );
}

export function Button({ testId, children, variant = "primary", type = "submit", disabled, formAction, name, value }: { testId: string; children: ReactNode; variant?: "primary" | "secondary" | "danger"; type?: "submit" | "button"; disabled?: boolean; formAction?: (formData: FormData) => void | Promise<void>; name?: string; value?: string }) {
  return (
    <button id={testId} data-testid={testId} type={type} disabled={disabled} formAction={formAction} name={name} value={value} className={`al-btn ${variant === "primary" ? "" : variant}`}>
      {children}
    </button>
  );
}

export function LinkButton({ testId, href, children, variant = "primary" }: { testId: string; href: string; children: ReactNode; variant?: "primary" | "secondary" }) {
  return (
    <Link id={testId} data-testid={testId} href={href} className={`al-btn ${variant === "primary" ? "" : variant}`}>
      {children}
    </Link>
  );
}

export function Field({ testId, label, error, children, hint }: { testId: string; label: string; error?: string; children: ReactNode; hint?: string }) {
  return (
    <div id={`${testId}-group`} data-testid={`${testId}-group`} className="mb-3">
      <label htmlFor={testId} className="al-label">
        {label}
      </label>
      {children}
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
      {error ? (
        <div id={`${testId}-error`} data-testid={`${testId}-error`} className="mt-1 text-xs text-error">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export function Input({ testId, name, defaultValue, type = "text", required, readOnly, invalid, step, min, list, placeholder, autoComplete = "off" }: { testId: string; name: string; defaultValue?: string | number | null; type?: string; required?: boolean; readOnly?: boolean; invalid?: boolean; step?: string; min?: string; list?: string; placeholder?: string; autoComplete?: string }) {
  return <input id={testId} data-testid={testId} name={name} type={type} defaultValue={defaultValue ?? ""} required={required} readOnly={readOnly} aria-invalid={invalid ? "true" : undefined} step={step} min={min} list={list} placeholder={placeholder} autoComplete={autoComplete} className="al-input" />;
}

export function Select({ testId, name, defaultValue, options, invalid, allowBlank }: { testId: string; name: string; defaultValue?: string | null; options: { value: string; label: string }[]; invalid?: boolean; allowBlank?: boolean }) {
  return (
    <select id={testId} data-testid={testId} name={name} defaultValue={defaultValue ?? ""} aria-invalid={invalid ? "true" : undefined} className="al-input">
      {allowBlank ? <option value="">—</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({ testId, name, defaultChecked, label }: { testId: string; name: string; defaultChecked?: boolean; label: string }) {
  return (
    <label htmlFor={testId} className="mb-3 flex items-center gap-2 text-sm">
      <input id={testId} data-testid={testId} name={name} type="checkbox" value="1" defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}

/**
 * The fixed validation container. Always rendered, even when empty, so a
 * bot can wait for `#validation-errors` and read `data-count`.
 */
export function ValidationErrors({ violations, emptyText, title }: { violations: Violation[]; emptyText: string; title: string }) {
  return (
    <section id="validation-errors" data-testid="validation-errors" data-count={violations.length} aria-live="polite" className="mb-4">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</div>
      {violations.length === 0 ? (
        <div id="validation-empty" data-testid="validation-empty">{emptyText}</div>
      ) : (
        <ul>
          {violations.map((v, i) => (
            <li key={`${v.ruleId}-${i}`} id={`validation-error-${v.ruleId}${i ? `-${i}` : ""}`} data-testid={`validation-error-${v.ruleId}`} data-rule-id={v.ruleId} data-severity={v.severity} data-field={v.field ?? ""}>
              <code>{v.ruleId}</code> {v.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Flash({ status, message }: { status: "success" | "error" | "info"; message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div id="flash" data-testid="flash" data-status={status} className={`mb-4 rounded border px-3 py-2 text-sm ${status === "success" ? "border-success text-success" : status === "error" ? "border-error text-error" : "border-border text-muted"}`}>
      {message}
    </div>
  );
}

export function Pager({ entity, page, pageCount, total, baseQuery, labels }: { entity: string; page: number; pageCount: number; total: number; baseQuery: Record<string, string | undefined>; labels: { previous: string; next: string; page: string; of: string; rows: string } }) {
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(baseQuery)) if (v) q.set(k, v);
    q.set("page", String(p));
    return `?${q.toString()}`;
  };
  return (
    <nav id={`${entity}-pager`} data-testid={`${entity}-pager`} data-page={page} data-page-count={pageCount} data-total={total} className="mt-3 flex items-center gap-3 text-sm">
      {page > 1 ? (
        <Link id={`${entity}-pager-prev`} data-testid={`${entity}-pager-prev`} href={href(page - 1)} className="al-btn secondary">
          {labels.previous}
        </Link>
      ) : (
        <span className="al-btn secondary opacity-50">{labels.previous}</span>
      )}
      <span id={`${entity}-pager-page`} data-testid={`${entity}-pager-page`}>
        {labels.page} {page} {labels.of} {Math.max(pageCount, 1)} · {total} {labels.rows}
      </span>
      {page < pageCount ? (
        <Link id={`${entity}-pager-next`} data-testid={`${entity}-pager-next`} href={href(page + 1)} className="al-btn secondary">
          {labels.next}
        </Link>
      ) : (
        <span className="al-btn secondary opacity-50">{labels.next}</span>
      )}
    </nav>
  );
}

export function Pill({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <span className="pill" id={testId} data-testid={testId}>
      {children}
    </span>
  );
}

export function Dl({ rows, entity, code }: { rows: { key: string; label: string; value: ReactNode }[]; entity: string; code: string }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.key} className="flex gap-2 border-b border-border py-1">
          <dt className="w-44 shrink-0 text-muted">{r.label}</dt>
          <dd id={`${entity}-cell-${code}-${r.key}`} data-testid={`${entity}-cell-${code}-${r.key}`} data-field={r.key} className="break-all">
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export const PAGE_SIZE = 25;

export function parsePage(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}
