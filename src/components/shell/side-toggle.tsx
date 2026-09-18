"use client";

import { useState } from "react";

/**
 * The button that opens the module list on a phone.
 *
 * The only client component in the shell, and it does one thing: flips a
 * `data-open` attribute the stylesheet reads. Everything stays in the DOM —
 * the collapse is visual, so a bot reading the page still finds every link,
 * and a person with the CSS not yet applied sees the whole list rather than
 * nothing at all.
 */
export function SideToggle({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      id="nav-toggle"
      data-testid="nav-toggle"
      className="side-burger"
      aria-expanded={open}
      aria-controls="nav-modules"
      aria-label={label}
      onClick={() => {
        setOpen((v) => !v);
        // The attribute lives on the sidebar, so the stylesheet can show the
        // list without the button needing to be its parent.
        const side = document.getElementById("nav-main");
        if (side) side.dataset.open = String(!open);
      }}
    >
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        {open ? <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /> : <path d="M2 4h12M2 8h12M2 12h12" />}
      </svg>
    </button>
  );
}
