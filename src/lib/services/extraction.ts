/**
 * Pure helpers shared by the extraction form, the invoice page and the REST
 * API, so a bot and a student produce exactly the same match input.
 */
import type { invoices } from "@/db/schema";
import type { MatchContext } from "@/lib/validation/matching";
import { num, str } from "@/lib/forms";
import { TAX_CODES, round2 } from "@/lib/generator/money";
import { INVOICE_FORM_LINES } from "@/app/invoices/constants";

type Inv = typeof invoices.$inferSelect;

export const EXTRACTION_HEADER_FIELDS = ["number", "invoiceDate", "dueDate", "poNumber", "currency", "vendorName", "vendorTaxId", "iban", "bankName", "subtotal", "taxTotal", "grandTotal"] as const;
export const EXTRACTION_LINE_FIELDS = ["PoLine", "ItemCode", "Description", "Quantity", "Uom", "UnitPrice", "TaxRate", "TaxAmount", "LineTotal"] as const;

/**
 * Turn submitted (or stored) extraction fields into the invoice shape the
 * match engine reads. Nothing falls back to the printed truth: a field the
 * student left blank is blank, so the match reflects their extraction only.
 */
export function extractionToInvoice(inv: Inv, fields: Record<string, string>): { asStored: Inv; lines: MatchContext["invoice"]["lines"] } {
  const lines: MatchContext["invoice"]["lines"] = [];
  for (let n = 1; n <= INVOICE_FORM_LINES; n++) {
    const qty = num(fields, `line${n}Quantity`, 0);
    const desc = str(fields, `line${n}Description`);
    const itemCode = str(fields, `line${n}ItemCode`).toUpperCase();
    if (!qty && !desc && !itemCode) continue;
    const unitPrice = num(fields, `line${n}UnitPrice`, 0);
    const taxRatePct = num(fields, `line${n}TaxRate`, 0);
    const lineTotal = num(fields, `line${n}LineTotal`, round2(qty * unitPrice));
    const taxAmount = num(fields, `line${n}TaxAmount`, round2(lineTotal * (taxRatePct / 100)));
    const taxCode = (Object.keys(TAX_CODES).find((c) => TAX_CODES[c as keyof typeof TAX_CODES].rate === taxRatePct / 100) ?? "S15") as string;
    lines.push({ lineNo: lines.length + 1, poLineNo: num(fields, `line${n}PoLine`, NaN) || null, itemCode: itemCode || null, quantity: qty, uom: str(fields, `line${n}Uom`).toUpperCase(), unitPrice, discountPct: 0, taxCode, taxRate: taxRatePct / 100, taxAmount, lineTotal });
  }
  const asStored: Inv = {
    ...inv,
    number: str(fields, "number"),
    printedPoNumber: str(fields, "poNumber") || null,
    printedVendorName: str(fields, "vendorName"),
    printedVendorTaxId: str(fields, "vendorTaxId").replace(/\s+/g, ""),
    printedIban: str(fields, "iban").replace(/\s+/g, "").toUpperCase(),
    printedBankName: str(fields, "bankName"),
    invoiceDate: str(fields, "invoiceDate") || inv.receivedDate,
    dueDate: str(fields, "dueDate") || inv.receivedDate,
    currency: str(fields, "currency").toUpperCase(),
    subtotal: String(num(fields, "subtotal", 0)),
    taxTotal: String(num(fields, "taxTotal", 0)),
    grandTotal: String(num(fields, "grandTotal", 0)),
  };
  return { asStored, lines };
}


/** Line as accepted by POST /api/extractions. */
export interface ApiExtractionLine {
  poLineNo?: number | null;
  itemCode?: string | null;
  description?: string | null;
  quantity: number;
  uom: string;
  unitPrice: number;
  taxRate: number;
  taxAmount?: number | null;
  lineTotal?: number | null;
}

export interface ApiExtractionBody {
  fields: Record<string, string | number | null | undefined>;
  lines: ApiExtractionLine[];
}

/**
 * Flattens an API submission into the same flat record the form produces, so
 * grading, matching and the stored extraction have one representation.
 */
export function flattenApiExtraction(body: ApiExtractionBody): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (k: string, v: unknown) => {
    if (v === null || v === undefined || v === "") return;
    out[k] = String(v);
  };
  for (const key of EXTRACTION_HEADER_FIELDS) put(key, body.fields[key]);
  body.lines.slice(0, INVOICE_FORM_LINES).forEach((l, i) => {
    const n = i + 1;
    put(`line${n}PoLine`, l.poLineNo);
    put(`line${n}ItemCode`, l.itemCode);
    put(`line${n}Description`, l.description);
    put(`line${n}Quantity`, l.quantity);
    put(`line${n}Uom`, l.uom);
    put(`line${n}UnitPrice`, l.unitPrice);
    put(`line${n}TaxRate`, l.taxRate);
    put(`line${n}TaxAmount`, l.taxAmount);
    put(`line${n}LineTotal`, l.lineTotal);
  });
  return out;
}
