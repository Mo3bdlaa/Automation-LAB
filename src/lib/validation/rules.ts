/**
 * P0 rule set: vendor master, item master, purchase orders.
 * Rule IDs are part of the public contract with students' bots. Never rename
 * one; add a new ID and retire the old one.
 */
import { isValidCrNumber, isValidIban, isValidTaxId } from "../generator/checksums";
import { TAX_CODES, lineMoney, round2 } from "../generator/money";
import { CORPUS_TODAY } from "../generator/dates";
import type { Rule } from "./engine";

// --- Vendor -----------------------------------------------------------------

export interface VendorInput {
  code: string;
  name: string;
  crNumber: string;
  crExpiry: string;
  taxId: string;
  taxCertExpiry: string;
  iban: string;
  currency: string;
  paymentTermsDays: number;
  email: string;
  rating: number;
  blacklisted: boolean;
  status: string;
}

export interface VendorContext {
  vendor: VendorInput;
  /** Existing vendors visible to the tenant, excluding the one being edited. */
  existing: { code: string; name: string; taxId: string; iban: string; blacklisted: boolean }[];
  today?: string;
}

export const vendorRules: Rule<VendorContext>[] = [
  {
    id: "VEND-CODE-FMT",
    severity: "error",
    appliesTo: "vendor",
    description: "Vendor code must match V-NNNNN.",
    check: ({ vendor }) => (/^V-\d{5}$/.test(vendor.code) ? null : { field: "code", message: `Vendor code "${vendor.code}" must look like V-00042.` }),
  },
  {
    id: "VEND-NAME-REQ",
    severity: "error",
    appliesTo: "vendor",
    description: "Vendor name is required (min 3 characters).",
    check: ({ vendor }) => (vendor.name.trim().length >= 3 ? null : { field: "name", message: "Vendor name is required." }),
  },
  {
    id: "VEND-DUP-CODE",
    severity: "error",
    appliesTo: "vendor",
    description: "Vendor code must be unique across the shared corpus and your sandbox.",
    check: ({ vendor, existing }) => (existing.some((e) => e.code === vendor.code) ? { field: "code", message: `Vendor code ${vendor.code} already exists.` } : null),
  },
  {
    id: "VEND-DUP-NAME",
    severity: "warning",
    appliesTo: "vendor",
    description: "A vendor with the same name already exists (possible duplicate).",
    check: ({ vendor, existing }) => {
      const n = vendor.name.trim().toLowerCase();
      const dup = existing.find((e) => e.name.trim().toLowerCase() === n);
      return dup ? { field: "name", message: `Possible duplicate of ${dup.code} (${dup.name}).` } : null;
    },
  },
  {
    id: "VEND-DUP-TAXID",
    severity: "critical",
    appliesTo: "vendor",
    description: "Tax ID already registered to another vendor.",
    check: ({ vendor, existing }) => {
      const dup = existing.find((e) => e.taxId === vendor.taxId);
      return dup ? { field: "taxId", message: `Tax ID already belongs to ${dup.code} (${dup.name}).` } : null;
    },
  },
  {
    id: "VEND-CR-FMT",
    severity: "error",
    appliesTo: "vendor",
    description: "Commercial registration number must be 10 digits with a valid mod-11 check digit.",
    check: ({ vendor }) => (isValidCrNumber(vendor.crNumber) ? null : { field: "crNumber", message: "Commercial registration number fails the check digit." }),
  },
  {
    id: "VEND-TAXID-FMT",
    severity: "error",
    appliesTo: "vendor",
    description: "Tax ID must be 15 digits, start with 3, and pass the Luhn check.",
    check: ({ vendor }) => (isValidTaxId(vendor.taxId) ? null : { field: "taxId", message: "Tax ID fails the Luhn check or format." }),
  },
  {
    id: "VEND-IBAN",
    severity: "error",
    appliesTo: "vendor",
    description: "IBAN must pass ISO 7064 mod-97.",
    check: ({ vendor }) => (isValidIban(vendor.iban) ? null : { field: "iban", message: "IBAN is not valid (mod-97 check failed)." }),
  },
  {
    id: "VEND-IBAN-DUP",
    severity: "critical",
    appliesTo: "vendor",
    description: "IBAN already registered to another vendor (possible fraud).",
    check: ({ vendor, existing }) => {
      const iban = vendor.iban.replace(/\s+/g, "").toUpperCase();
      const dup = existing.find((e) => e.iban.replace(/\s+/g, "").toUpperCase() === iban);
      return dup ? { field: "iban", message: `IBAN already belongs to ${dup.code}.` } : null;
    },
  },
  {
    id: "VEND-TAX-CERT-EXP",
    severity: "warning",
    appliesTo: "vendor",
    description: "Tax certificate has expired.",
    check: ({ vendor, today }) => (vendor.taxCertExpiry < (today ?? CORPUS_TODAY) ? { field: "taxCertExpiry", message: `Tax certificate expired on ${vendor.taxCertExpiry}.` } : null),
  },
  {
    id: "VEND-CR-EXP",
    severity: "error",
    appliesTo: "vendor",
    description: "Commercial registration has expired.",
    check: ({ vendor, today }) => (vendor.crExpiry < (today ?? CORPUS_TODAY) ? { field: "crExpiry", message: `Commercial registration expired on ${vendor.crExpiry}.` } : null),
  },
  {
    id: "VEND-TERMS-RANGE",
    severity: "error",
    appliesTo: "vendor",
    description: "Payment terms must be between 0 and 120 days.",
    params: { min: 0, max: 120 },
    check: ({ vendor }, p) => (vendor.paymentTermsDays >= Number(p.min) && vendor.paymentTermsDays <= Number(p.max) ? null : { field: "paymentTermsDays", message: `Payment terms must be ${p.min}–${p.max} days.` }),
  },
  {
    id: "VEND-EMAIL-FMT",
    severity: "error",
    appliesTo: "vendor",
    description: "Contact email must be a valid address.",
    check: ({ vendor }) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vendor.email) ? null : { field: "email", message: "Email address is not valid." }),
  },
  {
    id: "VEND-BLACKLIST",
    severity: "critical",
    appliesTo: "vendor",
    description: "Vendor is blacklisted and must not be active.",
    check: ({ vendor }) => (vendor.blacklisted && vendor.status === "active" ? { field: "status", message: "A blacklisted vendor cannot be active." } : null),
  },
];

// --- Item -------------------------------------------------------------------

export interface ItemInput {
  code: string;
  name: string;
  uom: string;
  taxCode: string;
  unitPrice: number;
  currency: string;
}

export interface ItemContext {
  item: ItemInput;
  existing: { code: string; name: string }[];
}

export const UOMS = ["EA", "BOX", "PK", "RM", "SET", "L", "KG", "TON", "M", "BAG", "ROLL", "PLT", "PR", "CTN", "HR", "DAY"] as const;

export const itemRules: Rule<ItemContext>[] = [
  {
    id: "ITEM-CODE-FMT",
    severity: "error",
    appliesTo: "item",
    description: "Item code must match ITM-NNNNNN.",
    check: ({ item }) => (/^ITM-\d{6}$/.test(item.code) ? null : { field: "code", message: `Item code "${item.code}" must look like ITM-000123.` }),
  },
  {
    id: "ITEM-DUP-CODE",
    severity: "error",
    appliesTo: "item",
    description: "Item code must be unique.",
    check: ({ item, existing }) => (existing.some((e) => e.code === item.code) ? { field: "code", message: `Item code ${item.code} already exists.` } : null),
  },
  {
    id: "ITEM-NAME-REQ",
    severity: "error",
    appliesTo: "item",
    description: "Item name is required.",
    check: ({ item }) => (item.name.trim().length >= 2 ? null : { field: "name", message: "Item name is required." }),
  },
  {
    id: "ITEM-UOM",
    severity: "error",
    appliesTo: "item",
    description: `Unit of measure must be one of: ${UOMS.join(", ")}.`,
    check: ({ item }) => ((UOMS as readonly string[]).includes(item.uom) ? null : { field: "uom", message: `Unknown unit of measure "${item.uom}".` }),
  },
  {
    id: "ITEM-TAX-CODE",
    severity: "error",
    appliesTo: "item",
    description: `Tax code must be one of: ${Object.keys(TAX_CODES).join(", ")}.`,
    check: ({ item }) => (item.taxCode in TAX_CODES ? null : { field: "taxCode", message: `Unknown tax code "${item.taxCode}".` }),
  },
  {
    id: "ITEM-PRICE-POS",
    severity: "error",
    appliesTo: "item",
    description: "Unit price must be greater than zero.",
    check: ({ item }) => (Number.isFinite(item.unitPrice) && item.unitPrice > 0 ? null : { field: "unitPrice", message: "Unit price must be a positive number." }),
  },
];

// --- Purchase order ---------------------------------------------------------

export interface PoLineInput {
  lineNo: number;
  itemCode: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  taxCode: string;
  uom: string;
}

export interface PoInput {
  vendorCode: string;
  currency: string;
  orderDate: string;
  expectedDeliveryDate: string;
  lines: PoLineInput[];
  subtotal?: number;
  taxTotal?: number;
  grandTotal?: number;
}

export interface PoContext {
  po: PoInput;
  vendor: { code: string; status: string; blacklisted: boolean; taxCertExpiry: string } | null;
  items: Map<string, { code: string; unitPrice: number; uom: string; taxCode: string; active: boolean }>;
  approver?: { approvalLimit: number | null } | null;
  today?: string;
}

export const poRules: Rule<PoContext>[] = [
  {
    id: "PO-VENDOR-EXISTS",
    severity: "error",
    appliesTo: "purchase_order",
    description: "Vendor must exist in the vendor master.",
    check: ({ po, vendor }) => (vendor ? null : { field: "vendorCode", message: `Vendor ${po.vendorCode || "(blank)"} is not in the vendor master.` }),
  },
  {
    id: "PO-VENDOR-ACTIVE",
    severity: "critical",
    appliesTo: "purchase_order",
    description: "Vendor must be active and not blacklisted.",
    check: ({ vendor }) => (vendor && (vendor.status !== "active" || vendor.blacklisted) ? { field: "vendorCode", message: `Vendor ${vendor.code} is ${vendor.blacklisted ? "blacklisted" : vendor.status}.` } : null),
  },
  {
    id: "PO-VENDOR-TAX-CERT",
    severity: "warning",
    appliesTo: "purchase_order",
    description: "Vendor tax certificate has expired.",
    check: ({ vendor, today }) => (vendor && vendor.taxCertExpiry < (today ?? CORPUS_TODAY) ? { field: "vendorCode", message: `Vendor tax certificate expired on ${vendor.taxCertExpiry}.` } : null),
  },
  {
    id: "PO-LINE-MIN",
    severity: "error",
    appliesTo: "purchase_order",
    description: "A purchase order needs at least one line.",
    check: ({ po }) => (po.lines.length > 0 ? null : { field: "lines", message: "Add at least one line." }),
  },
  {
    id: "PO-DATES",
    severity: "error",
    appliesTo: "purchase_order",
    description: "Expected delivery date must be on or after the order date.",
    check: ({ po }) => (po.expectedDeliveryDate >= po.orderDate ? null : { field: "expectedDeliveryDate", message: "Expected delivery is before the order date." }),
  },
  {
    id: "PO-ITEM-EXISTS",
    severity: "error",
    appliesTo: "purchase_order_line",
    description: "Every line must reference an item in the catalogue.",
    check: ({ po, items }) => po.lines.filter((l) => !items.has(l.itemCode)).map((l) => ({ field: `lines[${l.lineNo}].itemCode`, message: `Line ${l.lineNo}: item ${l.itemCode || "(blank)"} not in catalogue.` })),
  },
  {
    id: "PO-ITEM-ACTIVE",
    severity: "error",
    appliesTo: "purchase_order_line",
    description: "Items on a purchase order must be active.",
    check: ({ po, items }) => po.lines.filter((l) => items.get(l.itemCode)?.active === false).map((l) => ({ field: `lines[${l.lineNo}].itemCode`, message: `Line ${l.lineNo}: item ${l.itemCode} is inactive.` })),
  },
  {
    id: "PO-QTY-POS",
    severity: "error",
    appliesTo: "purchase_order_line",
    description: "Quantity must be greater than zero.",
    check: ({ po }) => po.lines.filter((l) => !(l.quantity > 0)).map((l) => ({ field: `lines[${l.lineNo}].quantity`, message: `Line ${l.lineNo}: quantity must be positive.` })),
  },
  {
    id: "PO-PRICE-VARIANCE",
    severity: "error",
    appliesTo: "purchase_order_line",
    description: "Unit price must be within tolerance of the catalogue price.",
    params: { tolerance: 0.02 },
    check: ({ po, items }, p) =>
      po.lines
        .filter((l) => {
          const it = items.get(l.itemCode);
          if (!it) return false;
          return Math.abs(l.unitPrice - it.unitPrice) > it.unitPrice * Number(p.tolerance) + 0.005;
        })
        .map((l) => ({ field: `lines[${l.lineNo}].unitPrice`, message: `Line ${l.lineNo}: price ${l.unitPrice.toFixed(2)} differs from catalogue ${items.get(l.itemCode)!.unitPrice.toFixed(2)} by more than ${Number(p.tolerance) * 100}%.` })),
  },
  {
    id: "PO-UOM-MATCH",
    severity: "error",
    appliesTo: "purchase_order_line",
    description: "Line unit of measure must match the catalogue item.",
    check: ({ po, items }) =>
      po.lines
        .filter((l) => items.has(l.itemCode) && items.get(l.itemCode)!.uom !== l.uom)
        .map((l) => ({ field: `lines[${l.lineNo}].uom`, message: `Line ${l.lineNo}: UoM ${l.uom} does not match catalogue ${items.get(l.itemCode)!.uom}.` })),
  },
  {
    id: "PO-TAX-CODE",
    severity: "error",
    appliesTo: "purchase_order_line",
    description: "Line tax code must match the catalogue item's tax code.",
    check: ({ po, items }) =>
      po.lines
        .filter((l) => items.has(l.itemCode) && items.get(l.itemCode)!.taxCode !== l.taxCode)
        .map((l) => ({ field: `lines[${l.lineNo}].taxCode`, message: `Line ${l.lineNo}: tax code ${l.taxCode} does not match catalogue ${items.get(l.itemCode)!.taxCode}.` })),
  },
  {
    id: "PO-TOTAL-TIE",
    severity: "error",
    appliesTo: "purchase_order",
    description: "Header totals must equal the sum of the lines (subtotal, tax, grand total).",
    check: ({ po }) => {
      if (po.subtotal === undefined || po.taxTotal === undefined || po.grandTotal === undefined) return null;
      let sub = 0;
      let tax = 0;
      for (const l of po.lines) {
        if (!(l.taxCode in TAX_CODES)) continue;
        const m = lineMoney({ quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct, taxCode: l.taxCode as keyof typeof TAX_CODES });
        sub = round2(sub + m.net);
        tax = round2(tax + m.tax);
      }
      const out: { field: string; message: string }[] = [];
      if (round2(po.subtotal) !== sub) out.push({ field: "subtotal", message: `Subtotal ${po.subtotal.toFixed(2)} does not equal line sum ${sub.toFixed(2)}.` });
      if (round2(po.taxTotal) !== tax) out.push({ field: "taxTotal", message: `Tax total ${po.taxTotal.toFixed(2)} does not equal computed ${tax.toFixed(2)}.` });
      if (round2(po.grandTotal) !== round2(sub + tax)) out.push({ field: "grandTotal", message: `Grand total ${po.grandTotal.toFixed(2)} does not equal ${round2(sub + tax).toFixed(2)}.` });
      return out;
    },
  },
  {
    id: "PO-APPROVAL-LIMIT",
    severity: "error",
    appliesTo: "purchase_order",
    description: "Grand total must not exceed the approver's limit.",
    check: ({ po, approver }) => {
      if (!approver || approver.approvalLimit == null || po.grandTotal === undefined) return null;
      return po.grandTotal > approver.approvalLimit ? { field: "approverCode", message: `Grand total ${po.grandTotal.toFixed(2)} exceeds approver limit ${approver.approvalLimit.toFixed(2)}.` } : null;
    },
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ALL_RULES: Rule<any>[] = [...vendorRules, ...itemRules, ...poRules];
