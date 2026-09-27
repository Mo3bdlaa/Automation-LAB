"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button } from "./ui";

/**
 * Line tables that grow.
 *
 * Three screens take document lines by hand — the purchase order form, the
 * extraction form and the validation station — and all three used to render a
 * fixed number of rows. That is not a form so much as a ceiling with a row of
 * empty boxes under it: an order of eight lines could not be typed into five
 * rows, and a two-line one made you look at three blank ones.
 *
 * So a table opens with the rows it has something to say about (one, usually)
 * and grows on `{entity}-add-line`. Rows are numbered by position, and each
 * carries its own key so React keeps it on the same DOM node: delete the third
 * of five and the fourth becomes the third, carrying whatever was typed into it
 * up with it, the way a line table on any ERP behaves.
 */
export interface LineRows {
  /** One stable key per row, in display order. A row's number is its index + 1. */
  keys: number[];
  count: number;
  atMax: boolean;
  add: () => void;
  remove: (key: number) => void;
  /**
   * Hidden input carrying the row count. Render it inside the form: a rejected
   * submission remounts the form (it is keyed on the action's nonce), and
   * without the count the rows a participant added would collapse back to the
   * default along with their figures.
   */
  countField: ReactNode;
}

/**
 * Rows to open with: the caller's default, unless echoed values from a rejected
 * submission say there were more. The scan over the values is the fallback for
 * a bot that posted `line9ItemCode` without ever clicking "add line".
 */
function openRowCount(start: number, max: number, values: Record<string, string>, name: string): number {
  let rows = Number(values[name]) || 0;
  for (const [key, value] of Object.entries(values)) {
    const m = /^line(\d+)[A-Z]/.exec(key);
    if (m && value.trim()) rows = Math.max(rows, Number(m[1]));
  }
  return Math.min(max, Math.max(start, rows));
}

export function useLineRows({ start, max, values, name = "lineRows" }: { start: number; max: number; values: Record<string, string>; name?: string }): LineRows {
  const [keys, setKeys] = useState<number[]>(() => Array.from({ length: openRowCount(start, max, values, name) }, (_, i) => i));
  const nextKey = useRef(keys.length);
  const add = () => {
    if (keys.length >= max) return;
    const key = nextKey.current++;
    setKeys((k) => [...k, key]);
  };
  const remove = (key: number) => setKeys((k) => (k.length > 1 ? k.filter((x) => x !== key) : k));
  return { keys, count: keys.length, atMax: keys.length >= max, add, remove, countField: <input type="hidden" name={name} value={keys.length} /> };
}

/** The button under a line table. `entity` gives it `{entity}-add-line`. */
export function AddLineButton({ entity, label, rows }: { entity: string; label: string; rows: LineRows }) {
  return (
    <div className="mt-2">
      <Button testId={`${entity}-add-line`} type="button" variant="secondary" small onClick={rows.add} disabled={rows.atMax}>
        + {label}
      </Button>
    </div>
  );
}

/** The button at the end of a row. `n` is the row's position, not its key. */
export function RemoveLineButton({ entity, label, n, rowKey, rows }: { entity: string; label: string; n: number; rowKey: number; rows: LineRows }) {
  return (
    <Button testId={`${entity}-line-${n}-remove`} type="button" variant="secondary" small onClick={() => rows.remove(rowKey)} disabled={rows.count <= 1} ariaLabel={`${label} ${n}`} title={label}>
      &times;
    </Button>
  );
}

/** The empty header cell over the remove buttons. */
export function RemoveLineHeader({ label }: { label: string }) {
  return (
    <th>
      <span className="sr-only">{label}</span>
    </th>
  );
}
