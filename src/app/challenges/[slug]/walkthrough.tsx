"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import type { Scenario } from "@/lib/challenge/scenarios";

/**
 * The walkthrough panel.
 *
 * Deliberately a panel and not a spotlight tour: this application is a target
 * for UI automation, and an overlay that sits above the page would intercept
 * the clicks a robot is trying to make and break selectors that are supposed to
 * be stable. So it never covers anything, never captures pointer events, never
 * changes an id, and `?tour=0` removes it entirely for an unattended run.
 *
 * It also lists the handles - the selectors and endpoints each step uses -
 * because the thing a participant most needs from a walkthrough is not
 * encouragement, it is the name of the button.
 */

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readProgress(slug: string): string {
  try {
    return window.localStorage.getItem(`al:walkthrough:${slug}`) ?? "[]";
  } catch {
    // A private window, or storage turned off: the walkthrough still works,
    // it just forgets which steps were ticked.
    return "[]";
  }
}

function writeProgress(slug: string, steps: number[]) {
  try {
    window.localStorage.setItem(`al:walkthrough:${slug}`, JSON.stringify(steps));
  } catch {
    /* nothing to do */
  }
  for (const l of listeners) l();
}

export function Walkthrough({ scenario, labels }: { scenario: Scenario; labels: { title: string; handles: string; hide: string; show: string } }) {
  const params = useSearchParams();
  // `?tour=0` is the unattended default; a click overrides it for this visit.
  const [override, setOverride] = useState<boolean | null>(null);
  const visible = override ?? params.get("tour") !== "0";

  const stored = useSyncExternalStore(
    subscribe,
    useCallback(() => readProgress(scenario.slug), [scenario.slug]),
    () => "[]",
  );
  const done = useMemo(() => {
    try {
      return new Set(JSON.parse(stored) as number[]);
    } catch {
      return new Set<number>();
    }
  }, [stored]);

  const toggleStep = (i: number) => {
    const next = new Set(done);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    writeProgress(scenario.slug, [...next]);
  };

  if (!visible) {
    return (
      <aside>
        <button id="walkthrough-show" data-testid="walkthrough-show" type="button" className="al-btn secondary" onClick={() => setOverride(true)}>
          {labels.show}
        </button>
      </aside>
    );
  }

  return (
    <aside className="al-card h-fit" id="walkthrough" data-testid="walkthrough" data-steps={scenario.steps.length} data-done={done.size}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2>{labels.title}</h2>
        <button id="walkthrough-hide" data-testid="walkthrough-hide" type="button" className="text-xs text-muted underline" onClick={() => setOverride(false)}>
          {labels.hide}
        </button>
      </div>
      <ol className="text-sm">
        {scenario.steps.map((step, i) => (
          <li key={step.title} id={`walkthrough-step-${i + 1}`} data-testid={`walkthrough-step-${i + 1}`} data-done={done.has(i) ? "1" : "0"} className="mb-3 border-b border-border pb-3 last:border-0">
            <label className="flex cursor-pointer items-start gap-2">
              <input type="checkbox" checked={done.has(i)} onChange={() => toggleStep(i)} data-testid={`walkthrough-check-${i + 1}`} className="mt-1" />
              <span>
                <span className={`font-semibold ${done.has(i) ? "line-through opacity-60" : ""}`}>
                  {i + 1}. {step.title}
                </span>
                <span className="mt-1 block text-muted">{step.detail}</span>
              </span>
            </label>
            <div className="mt-2 flex flex-wrap gap-1 ps-6">
              {step.handles.map((h) => (
                <code key={h} className="rounded bg-surface px-1 text-[11px]" title={labels.handles}>
                  {h}
                </code>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}
