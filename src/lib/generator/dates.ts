/** Date helpers on ISO `YYYY-MM-DD` strings (what Postgres `date` columns carry). */

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

export function fiscalYear(iso: string): number {
  return Number(iso.slice(0, 4));
}

/** Business number like PO-2026-00017. */
export function businessNumber(prefix: string, iso: string, seq: number): string {
  return `${prefix}-${fiscalYear(iso)}-${String(seq).padStart(5, "0")}`;
}

/** Skip weekends (Fri/Sat, regional working week). */
export function toWorkingDay(iso: string): string {
  let d = iso;
  for (let i = 0; i < 3; i++) {
    const dow = new Date(d + "T00:00:00Z").getUTCDay();
    if (dow === 5) d = addDays(d, 2);
    else if (dow === 6) d = addDays(d, 1);
    else break;
  }
  return d;
}

/** Fixed "today" for corpus generation, so the shared corpus is stable across seed runs. */
export const CORPUS_TODAY = "2026-09-01";
