import type { Dictionary } from "@/i18n";

/**
 * That the data is fabricated, said once and quietly.
 *
 * This replaced a yellow bar across the top of every page reading SPECIMEN —
 * TRAINING ONLY. The disclosure is no weaker for being smaller: it is here, on
 * a watermark printed into every document, and in a paragraph in the footer.
 * What it no longer does is announce on every screen that the thing you are
 * looking at is not worth taking seriously.
 */
export function EnvChip({ t }: { t: Dictionary }) {
  return (
    <span className="env-chip" data-testid="specimen-banner" title={t.specimenLong}>
      <span className="dot" aria-hidden="true" />
      {t.specimen}
    </span>
  );
}
