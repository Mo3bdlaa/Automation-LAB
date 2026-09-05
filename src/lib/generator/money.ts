/** Fixed-point money helpers. All arithmetic is done in integer minor units. */

export const TAX_CODES = {
  S15: { rate: 0.15, label: "Standard 15%", labelAr: "قياسي ١٥٪" },
  S05: { rate: 0.05, label: "Reduced 5%", labelAr: "مخفض ٥٪" },
  Z00: { rate: 0, label: "Zero-rated", labelAr: "صفري" },
  EXM: { rate: 0, label: "Exempt", labelAr: "معفى" },
} as const;
export type TaxCode = keyof typeof TAX_CODES;
export const TAX_CODE_LIST = Object.keys(TAX_CODES) as TaxCode[];

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export interface LineInput {
  quantity: number;
  unitPrice: number;
  discountPct: number;
  taxCode: TaxCode;
}

export interface LineMoney {
  net: number;
  tax: number;
  gross: number;
}

/** line net = qty × price × (1 − discount); tax from tax code; both rounded to 2dp. */
export function lineMoney(l: LineInput): LineMoney {
  const net = round2(l.quantity * l.unitPrice * (1 - l.discountPct / 100));
  const tax = round2(net * TAX_CODES[l.taxCode].rate);
  return { net, tax, gross: round2(net + tax) };
}

export function totals(lines: LineInput[]) {
  let subtotal = 0;
  let taxTotal = 0;
  for (const l of lines) {
    const m = lineMoney(l);
    subtotal = round2(subtotal + m.net);
    taxTotal = round2(taxTotal + m.tax);
  }
  return { subtotal, taxTotal, grandTotal: round2(subtotal + taxTotal) };
}

export function fmtMoney(n: number | string, currency: string, locale = "en-US"): string {
  const v = typeof n === "string" ? Number(n) : n;
  return new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "code" }).format(v);
}

export function fmtNumber(n: number | string, locale = "en-US", fractionDigits = 2): string {
  const v = typeof n === "string" ? Number(n) : n;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(v);
}
