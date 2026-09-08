"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction, type RegisterState } from "./actions";

export interface RegisterLabels {
  email: string;
  password: string;
  passwordConfirm: string;
  passwordHint: string;
  displayName: string;
  displayNameHint: string;
  alias: string;
  aliasHint: string;
  location: string;
  locationHint: string;
  submit: string;
  haveAccount: string;
  signIn: string;
}

function Field({
  name,
  label,
  hint,
  error,
  defaultValue,
  type = "text",
  required = true,
  autoComplete,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string | null;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <div className="mb-3">
      <label htmlFor={`register-field-${name}`} className="al-label">
        {label}
        {required ? null : <span className="ml-1 text-xs font-normal text-muted">optional</span>}
      </label>
      <input
        id={`register-field-${name}`}
        data-testid={`register-field-${name}`}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        className={`al-input ${error ? "border-error" : ""}`}
      />
      {error ? (
        <p id={`register-error-${name}`} data-testid={`register-error-${name}`} className="mt-1 text-xs text-error">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function RegisterForm({ labels }: { labels: RegisterLabels }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerAction, { error: null, values: {} });
  const err = (field: string) => (state.error?.field === field ? state.error.message : null);
  const v = (field: string) => state.values[field] ?? "";

  return (
    <form id="register-form" data-testid="register-form" action={action} className="al-card max-w-md" noValidate>
      <Field name="email" label={labels.email} type="email" autoComplete="email" defaultValue={v("email")} error={err("email")} />
      <Field name="password" label={labels.password} hint={labels.passwordHint} type="password" autoComplete="new-password" error={err("password")} />
      <Field name="passwordConfirm" label={labels.passwordConfirm} type="password" autoComplete="new-password" error={err("passwordConfirm")} />
      <Field name="displayName" label={labels.displayName} hint={labels.displayNameHint} autoComplete="name" defaultValue={v("displayName")} error={err("displayName")} />
      <Field name="alias" label={labels.alias} hint={labels.aliasHint} required={false} defaultValue={v("alias")} error={err("alias")} />
      <Field name="location" label={labels.location} hint={labels.locationHint} required={false} defaultValue={v("location")} error={err("location")} />
      <button id="register-submit" data-testid="register-submit" type="submit" disabled={pending} className="al-btn">
        {labels.submit}
      </button>
      <p className="mt-3 text-xs text-muted">
        {labels.haveAccount} <Link href="/login">{labels.signIn}</Link>
      </p>
    </form>
  );
}
