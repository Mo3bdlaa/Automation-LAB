/**
 * Small, selector-stable UI primitives with an ERP look. Every interactive
 * element takes a `testId` and renders it as both `id` and `data-testid`
 * (docs/selectors.md).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { Violation } from "@/lib/validation/engine";

export function Page({ title, subtitle, titleId = "page-title", actions, children, status }: { title: string; subtitle?: ReactNode; titleId?: string; actions?: ReactNode; children: ReactNode; status?: ReactNode }) {
  return (
    <>
      <div className="page-header">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 id={titleId} data-testid={titleId} className="flex items-center gap-3">
              {title}
              {status}
            </h1>
            {subtitle ? <div className="object-subtitle">{subtitle}</div> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      </div>
      <main className="mx-auto max-w-7xl px-4 py-5">{children}</main>
    </>
  );
}

/** Key facts strip under an object header (Fiori object page style). */
export function Facts({ entity, code, facts }: { entity: string; code: string; facts: { key: string; label: string; value: ReactNode }[] }) {
  return (
    <dl className="facts al-card mb-4">
      {facts.map((f) => (
        <div key={f.key}>
          <dt>{f.label}</dt>
          <dd id={`${entity}-cell-${code}-${f.key}`} data-testid={`${entity}-cell-${code}-${f.key}`} data-field={f.key}>
            {f.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({ title, children, actions, testId }: { title: string; children: ReactNode; actions?: ReactNode; testId?: string }) {
  return (
    <section className="mb-5" id={testId} data-testid={testId}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="section-title">{title}</h2>
        {actions ? <div className="flex gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Toolbar({ title, children }: { title?: ReactNode; children?: ReactNode }) {
  return (
    <div className="toolbar">
      {title ? <div className="toolbar-title">{title}</div> : null}
      {children}
    </div>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="table-wrap">{children}</div>;
}

export function Tile({ testId, href, title, subtitle, count, unit }: { testId: string; href: string; title: string; subtitle?: string; count?: number | string; unit?: string }) {
  return (
    <Link id={testId} data-testid={testId} href={href} className="tile" data-count={count}>
      <div className="tile-title">{title}</div>
      {subtitle ? <div className="tile-sub">{subtitle}</div> : null}
      {count !== undefined ? (
        <div className="tile-count">
          {count}
          {unit ? <small>{unit}</small> : null}
        </div>
      ) : null}
    </Link>
  );
}

export function Button({ testId, children, variant = "primary", type = "submit", disabled, formAction, name, value }: { testId: string; children: ReactNode; variant?: "primary" | "secondary" | "danger" | "accept"; type?: "submit" | "button"; disabled?: boolean; formAction?: (formData: FormData) => void | Promise<void>; name?: string; value?: string }) {
  return (
    <button id={testId} data-testid={testId} type={type} disabled={disabled} formAction={formAction} name={name} value={value} className={`al-btn ${variant === "primary" ? "" : variant}`}>
      {children}
    </button>
  );
}

export function LinkButton({ testId, href, children, variant = "primary", download }: { testId: string; href: string; children: ReactNode; variant?: "primary" | "secondary"; download?: string }) {
  if (download) {
    return (
      <a id={testId} data-testid={testId} href={href} download={download} className={`al-btn ${variant === "primary" ? "" : variant}`}>
        {children}
      </a>
    );
  }
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
    <section id="validation-errors" data-testid="validation-errors" data-count={violations.length} data-blocking={violations.some((v) => v.severity !== "warning") ? "1" : "0"} aria-live="polite" className="mb-4">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</div>
      {violations.length === 0 ? (
        <div id="validation-empty" data-testid="validation-empty">
          {emptyText}
        </div>
      ) : (
        <ul>
          {violations.map((v, i) => (
            <li key={`${v.ruleId}-${i}`} id={`validation-error-${v.ruleId}${i ? `-${i}` : ""}`} data-testid={`validation-error-${v.ruleId}`} data-rule-id={v.ruleId} data-severity={v.severity} data-field={v.field ?? ""}>
              <code>{v.ruleId}</code> <span>{v.message}</span>
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
    <div id="flash" data-testid="flash" data-status={status} className="flash mb-4">
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

const TONES: Record<string, "success" | "warning" | "error" | "info" | "neutral"> = {
  active: "success", ready: "success", approved: "success", received: "success", closed: "neutral", posted: "success", paid: "success", matched: "success", awarded: "success", delivered: "success", done: "success",
  pending: "warning", pending_extraction: "warning", extracted: "info", provisioning: "info", draft: "neutral", sent: "info", partially_received: "info", in_transit: "info", open: "info", quoted: "info", queued: "info", running: "info",
  blocked: "error", rejected: "error", exception: "error", cancelled: "neutral", failed: "error", expired: "neutral",
};

/** Status badge. The visible text is the status itself so bots can read it; `data-status` carries the raw value. */
export function Status({ status, testId }: { status: string; testId?: string }) {
  return (
    <span className="pill" id={testId} data-testid={testId} data-status={status} data-tone={TONES[status] ?? "neutral"}>
      {status.replace(/_/g, " ")}
    </span>
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
    <dl className="kv-list sm:grid-cols-2 sm:gap-x-6" style={{ display: "grid" }}>
      {rows.map((r) => (
        <div key={r.key}>
          <dt>{r.label}</dt>
          <dd id={`${entity}-cell-${code}-${r.key}`} data-testid={`${entity}-cell-${code}-${r.key}`} data-field={r.key}>
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Download card for a document: link when rendered, waiting text otherwise.
 * `levels` renders the difficulty ladder, so a student can pick up the same
 * document as a clean scan, an office scan or a phone photo.
 */
export function DocumentCard({
  entity,
  documentId,
  file,
  labels,
  lazy,
  level = 1,
  levels,
  levelHref,
}: {
  entity: string;
  documentId: string | null;
  file: { filename: string; pages: number; sizeBytes: number } | null;
  labels: { title: string; download: string; rendering: string; notRendered: string; filename: string; levels?: string };
  lazy?: boolean;
  level?: number;
  levels?: { level: number; label: string }[];
  levelHref?: (level: number) => string;
}) {
  const href = documentId ? `/api/documents/${documentId}/file${level > 1 ? `?level=${level}` : ""}` : "#";
  return (
    <div className="al-card" id={`${entity}-document`} data-testid={`${entity}-document`} data-document-id={documentId ?? ""} data-rendered={file ? "1" : "0"} data-level={level}>
      <h2 className="mb-2">{labels.title}</h2>
      {documentId && levels && levelHref ? (
        <p id={`${entity}-levels`} data-testid={`${entity}-levels`} className="mb-2 text-sm">
          {labels.levels ? <span className="text-muted">{labels.levels}: </span> : null}
          {levels.map((l) => (
            <a
              key={l.level}
              id={`${entity}-level-${l.level}`}
              data-testid={`${entity}-level-${l.level}`}
              data-current={l.level === level ? "1" : "0"}
              href={levelHref(l.level)}
              className={l.level === level ? "mr-2 font-semibold" : "mr-2"}
            >
              L{l.level} {l.label}
            </a>
          ))}
        </p>
      ) : null}
      {!documentId ? (
        <p id={`${entity}-document-none`} data-testid={`${entity}-document-none`} className="text-sm text-muted">
          {labels.notRendered}
        </p>
      ) : file ? (
        <>
          <p id={`${entity}-document-filename`} data-testid={`${entity}-document-filename`} className="mb-2 text-sm">
            {labels.filename}: <code>{file.filename}</code> · {file.pages}p · {Math.round(file.sizeBytes / 1024)} KB
          </p>
          <a id={`${entity}-download`} data-testid={`${entity}-download`} href={href} className="al-btn" download={file.filename}>
            {labels.download}
          </a>
        </>
      ) : lazy || level > 1 ? (
        <a id={`${entity}-download`} data-testid={`${entity}-download`} href={href} className="al-btn" download>
          {labels.download}
        </a>
      ) : (
        <p id={`${entity}-document-rendering`} data-testid={`${entity}-document-rendering`} className="text-sm text-muted">
          {labels.rendering}
        </p>
      )}
    </div>
  );
}

export const PAGE_SIZE = 25;

export function parsePage(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function ListFilter({ entity, children, submitLabel }: { entity: string; children: ReactNode; submitLabel: string }) {
  return (
    <form id={`${entity}-filter`} data-testid={`${entity}-filter`} method="get" className="flex flex-wrap items-center gap-2">
      {children}
      <button id={`${entity}-filter-submit`} data-testid={`${entity}-filter-submit`} type="submit" className="al-btn secondary">
        {submitLabel}
      </button>
    </form>
  );
}
