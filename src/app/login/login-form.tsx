"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";
import type { LoginField } from "@/lib/identity";

export function LoginForm({ fields, labels }: { fields: LoginField[]; labels: { submit: string; failed: string; noAccess: string; tooMany: string } }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, { error: null });
  return (
    <form id="login-form" data-testid="login-form" action={action} className="al-card max-w-sm">
      {state.error ? (
        <div id="login-error" data-testid="login-error" data-error={state.error} className="mb-3 text-sm text-error">
          {state.error === "failed" ? labels.failed : state.error === "tooMany" ? labels.tooMany : labels.noAccess}
        </div>
      ) : null}
      {fields.map((f) => (
        <div key={f.name} className="mb-3">
          <label htmlFor={`login-field-${f.name}`} className="al-label">
            {f.label}
          </label>
          <input id={`login-field-${f.name}`} data-testid={`login-field-${f.name}`} name={f.name} type={f.type} required autoComplete={f.type === "password" ? "current-password" : "username"} className="al-input" />
        </div>
      ))}
      <button id="login-submit" data-testid="login-submit" type="submit" disabled={pending} className="al-btn">
        {labels.submit}
      </button>
    </form>
  );
}
