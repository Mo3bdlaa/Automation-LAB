"use client";

import { useState } from "react";

/**
 * Download a document, and wait for it if it is still being printed.
 *
 * The master set is printed ahead of time, but a level above one, a vendor
 * compliance document and anything a participant created are printed on first
 * request: the route queues the job and answers 409 with Retry-After. A plain
 * `<a download>` against that saves the 409 body — the participant asks for a
 * purchase order and gets `file.json` on their desktop, with nothing on screen
 * to say why. So the click is handled here: ask, and if the answer is "being
 * printed", say so and ask again until it arrives.
 *
 * The anchor keeps its real href, so a bot driving the screens, a middle-click
 * and a right-click "save link as" all still reach the same endpoint — which is
 * the endpoint the process documents tell a bot to retry on 409.
 */
export function DocumentDownload({
  testId,
  href,
  filename,
  label,
  labels,
}: {
  testId: string;
  href: string;
  filename?: string;
  label: string;
  /** printing: shown while the job runs. failed: shown when it will not arrive. */
  labels: { printing: string; failed: string };
}) {
  const [state, setState] = useState<"idle" | "printing" | "failed">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function download(e: React.MouseEvent) {
    // Let the browser handle anything that is not a plain left click.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    setState("printing");
    setMessage(null);
    // Twelve tries at the server's own Retry-After: a cold Chromium on a
    // serverless host is a few seconds, and a queue behind one is a few more.
    for (let attempt = 0; attempt < 12; attempt++) {
      let res: Response;
      try {
        res = await fetch(href, { credentials: "include" });
      } catch {
        setState("failed");
        setMessage(null);
        return;
      }
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        // The route names the file in Content-Disposition, and for a document
        // printed just now that is the only place the name exists yet — the
        // page was rendered before there was a file row to read it from.
        const disposition = res.headers.get("Content-Disposition") ?? "";
        const named = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1];
        a.download = filename ?? (named ? decodeURIComponent(named) : "document.pdf");
        document.body.append(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setState("idle");
        return;
      }
      if (res.status !== 409) {
        // 404 when this lab does not print participant documents at all; the
        // route says so in a sentence written for a person.
        const body = await res.json().catch(() => null);
        setState("failed");
        setMessage(typeof body?.message === "string" ? body.message : null);
        return;
      }
      const wait = Number(res.headers.get("Retry-After") ?? "5");
      await new Promise((r) => setTimeout(r, Math.min(Math.max(wait, 1), 15) * 1000));
    }
    setState("failed");
    setMessage(null);
  }

  return (
    <>
      <a id={testId} data-testid={testId} href={href} download={filename ?? true} className="al-btn" onClick={download} aria-busy={state === "printing"}>
        {state === "printing" ? labels.printing : label}
      </a>
      {state === "idle" ? null : (
        <p id={`${testId}-status`} data-testid={`${testId}-status`} data-state={state} className="mt-2 text-sm text-muted">
          {state === "printing" ? labels.printing : (message ?? labels.failed)}
        </p>
      )}
    </>
  );
}
