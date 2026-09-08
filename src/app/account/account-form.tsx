"use client";

import { useActionState } from "react";
import { saveAccountAction, type AccountState } from "./actions";

export function AccountForm({
  labels,
  initial,
}: {
  labels: { displayName: string; displayNameHint: string; alias: string; aliasHint: string; location: string; locationHint: string; save: string; saved: string };
  initial: { displayName: string; alias: string; location: string };
}) {
  const [state, action, pending] = useActionState<AccountState, FormData>(saveAccountAction, { error: null, saved: false });
  const err = (f: string) => (state.error?.field === f ? state.error.message : null);
  const fields: [keyof typeof initial, string, string][] = [
    ["displayName", labels.displayName, labels.displayNameHint],
    ["alias", labels.alias, labels.aliasHint],
    ["location", labels.location, labels.locationHint],
  ];
  return (
    <form id="account-form" data-testid="account-form" action={action} className="al-card max-w-md" noValidate>
      {state.saved ? (
        <div id="account-saved" data-testid="account-saved" className="flash mb-3" data-status="success">
          {labels.saved}
        </div>
      ) : null}
      {fields.map(([name, label, hint]) => (
        <div key={name} className="mb-3">
          <label htmlFor={`account-field-${name}`} className="al-label">
            {label}
          </label>
          <input id={`account-field-${name}`} data-testid={`account-field-${name}`} name={name} defaultValue={initial[name]} className={`al-input ${err(name) ? "border-error" : ""}`} />
          <p className={`mt-1 text-xs ${err(name) ? "text-error" : "text-muted"}`} data-testid={err(name) ? `account-error-${name}` : undefined}>
            {err(name) ?? hint}
          </p>
        </div>
      ))}
      <button id="account-submit" data-testid="account-submit" type="submit" disabled={pending} className="al-btn">
        {labels.save}
      </button>
    </form>
  );
}
