import type { Violation } from "./validation/engine";

/** State returned by form server actions. Values echo back so the form re-renders what the user typed. */
export interface FormState {
  violations: Violation[];
  values: Record<string, string>;
  flash?: string | null;
  /**
   * Changes on every action result. Forms use it as their React `key`, so the
   * form remounts with the echoed values: React 19 resets a form after its
   * action completes, and `<select defaultValue>` is only applied on mount.
   */
  nonce?: number;
}

export const emptyFormState: FormState = { violations: [], values: {}, nonce: 0 };

export function failedState(violations: Violation[], values: Record<string, string>): FormState {
  return { violations, values, nonce: Date.now() };
}

export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

export function str(values: Record<string, string>, key: string, fallback = ""): string {
  return (values[key] ?? fallback).trim();
}

export function num(values: Record<string, string>, key: string, fallback = NaN): number {
  const raw = (values[key] ?? "").trim();
  if (raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

export function bool(values: Record<string, string>, key: string): boolean {
  return values[key] === "1" || values[key] === "on" || values[key] === "true";
}

export function fieldError(state: FormState, field: string): string | undefined {
  return state.violations.find((v) => v.field === field)?.message;
}
