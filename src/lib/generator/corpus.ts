/**
 * Shared corpus generator. Pure: takes a seed, returns plain row objects.
 * Persisting them is scripts/seed-corpus.ts' job. Deterministic by design.
 */
import { Rng } from "./rng";
import { makeCrNumber, makeTaxId } from "./checksums";
import { BANKS, makeIban } from "./iban";
import { TAX_CODES, lineMoney, totals, type TaxCode } from "./money";
import { addDays, businessNumber, CORPUS_TODAY, toWorkingDay } from "./dates";
import {
  CITIES, COMPANY, COST_CENTERS, CURRENCY_BY_COUNTRY, DELIVERY_LOCATIONS, FIRST_NAMES, GL_ACCOUNTS,
  GL_BY_CATEGORY, ITEM_CATEGORIES, ITEM_VARIANTS, LAST_NAMES, LEGAL_FORMS, PAYMENT_TERMS, STREETS,
  VENDOR_CATEGORIES, VENDOR_FIRST, VENDOR_SECOND,
} from "./vocab";

export interface GenVendor {
  code: string; name: string; nameAr: string; legalForm: string; category: string;
  /** The script this vendor prints its own documents in. */
  documentLanguage: "en" | "ar" | "bilingual";
  crNumber: string; crExpiry: string; taxId: string; taxCertExpiry: string;
  iban: string; bankName: string; swift: string; currency: string; paymentTermsDays: number;
  contactName: string; email: string; phone: string; addressLine: string; city: string; country: string;
  rating: number; blacklisted: boolean; status: "active" | "pending" | "blocked";
}

export interface GenItem {
  code: string; name: string; nameAr: string; category: string; uom: string; taxCode: TaxCode;
  unitPrice: number; currency: string; active: boolean;
  priceHistory: { effectiveFrom: string; unitPrice: number }[];
}

export interface GenEmployee {
  code: string; name: string; email: string;
  role: "requester" | "buyer" | "approver" | "warehouse" | "ap_clerk";
  approvalLimit: number | null; costCenterCode: string;
}

export interface GenPoLine {
  lineNo: number; itemCode: string; description: string; quantity: number; uom: string;
  unitPrice: number; discountPct: number; taxCode: TaxCode; taxAmount: number; lineTotal: number; glCode: string;
}

export interface GenPo {
  number: string; vendorCode: string; buyerCode: string; requesterCode: string; approverCode: string;
  costCenterCode: string; deliveryLocationCode: string; currency: string; orderDate: string;
  expectedDeliveryDate: string; paymentTermsDays: number;
  status: "draft" | "approved" | "sent" | "partially_received" | "received" | "closed" | "cancelled";
  subtotal: number; taxTotal: number; grandTotal: number; notes: string | null; historical: boolean;
  lines: GenPoLine[];
}

export interface Corpus {
  vendors: GenVendor[];
  items: GenItem[];
  employees: GenEmployee[];
  costCenters: { code: string; name: string; nameAr: string }[];
  glAccounts: { code: string; name: string; type: (typeof GL_ACCOUNTS)[number][2] }[];
  deliveryLocations: { code: string; name: string; addressLine: string; city: string }[];
  history: GenPo[];
}

export const CORPUS_SIZES = { vendors: 250, items: 1200, employees: 60, historyPos: 900 } as const;

function slugEmail(name: string, domain: string) {
  return `${name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "")}@${domain}`;
}

export function generateVendors(rng: Rng, n: number = CORPUS_SIZES.vendors): GenVendor[] {
  const out: GenVendor[] = [];
  const seen = new Set<string>();
  for (let i = 1; i <= n; i++) {
    const r = rng.fork(`vendor:${i}`);
    let first = r.pick(VENDOR_FIRST);
    let second = r.pick(VENDOR_SECOND);
    let tries = 0;
    while (seen.has(first[0] + second[0]) && tries++ < 20) {
      first = r.pick(VENDOR_FIRST);
      second = r.pick(VENDOR_SECOND);
    }
    seen.add(first[0] + second[0]);
    const legal = r.pick(LEGAL_FORMS);
    const city = r.pick(CITIES);
    const country = city[2];
    const bankPool = BANKS.filter((b) => b.country === country);
    const bank = bankPool.length && r.chance(0.85) ? r.pick(bankPool) : r.pick(BANKS);
    const contact = `${r.pick(FIRST_NAMES)} ${r.pick(LAST_NAMES)}`;
    const domain = `${first[0].toLowerCase().replace(/[^a-z]+/g, "")}-${second[0].toLowerCase().split(" ")[0]}.example`;
    const name = `${first[0]} ${second[0]} ${legal[0]}`;
    const dedupSuffix = tries >= 20 ? ` ${i}` : "";
    const taxCertExpiry = r.chance(0.08) ? addDays(CORPUS_TODAY, -r.int(1, 200)) : addDays(CORPUS_TODAY, r.int(30, 700));
    const blacklisted = r.chance(0.03);
    out.push({
      code: `V-${String(i).padStart(5, "0")}`,
      name: name + dedupSuffix,
      nameAr: `${first[1]} ${second[1]} ${legal[1]}${dedupSuffix}`,
      // A vendor in the region prints bilingual paperwork more often than not,
      // but a third print Arabic only and a fifth English only. The mix is what
      // makes extraction interesting: the same field arrives in three shapes.
      documentLanguage: r.weighted([["bilingual", 5] as const, ["ar", 3] as const, ["en", 2] as const]),
      legalForm: legal[0],
      category: r.pick(VENDOR_CATEGORIES),
      crNumber: makeCrNumber(String(r.int(1, 9)) + r.digits(8)),
      crExpiry: addDays(CORPUS_TODAY, r.int(60, 1400)),
      taxId: makeTaxId(r.digits(13)),
      taxCertExpiry,
      iban: makeIban(r, bank),
      bankName: bank.bankName,
      swift: bank.swift,
      currency: CURRENCY_BY_COUNTRY[country] ?? "USD",
      paymentTermsDays: r.pick(PAYMENT_TERMS),
      contactName: contact,
      email: slugEmail(contact, domain),
      phone: `+${country === "SA" ? "966 5" : country === "AE" ? "971 5" : country === "EG" ? "20 1" : "974 5"}${r.digits(8)}`,
      addressLine: `${r.int(1, 400)} ${r.pick(STREETS)}`,
      city: city[0],
      country,
      rating: r.weighted([[5, 2], [4, 5], [3, 4], [2, 1.5], [1, 0.5]]),
      blacklisted,
      status: blacklisted ? "blocked" : r.chance(0.05) ? "pending" : "active",
    });
  }
  return out;
}

export function generateItems(rng: Rng, n: number = CORPUS_SIZES.items): GenItem[] {
  const out: GenItem[] = [];
  const names = new Set<string>();
  for (let i = 1; i <= n; i++) {
    const r = rng.fork(`item:${i}`);
    const cat = r.pick(ITEM_CATEGORIES);
    const noun = r.pick(cat.nouns);
    let variant = r.pick(ITEM_VARIANTS);
    let name = variant ? `${noun[0]} - ${variant}` : noun[0];
    let guard = 0;
    while (names.has(name) && guard++ < 30) {
      variant = r.pick(ITEM_VARIANTS);
      name = `${noun[0]} - ${variant || "Std"} ${r.int(2, 99)}`;
    }
    names.add(name);
    const [lo, hi] = cat.price;
    const price = Math.round(r.float(lo, hi) * 100) / 100;
    const history = [] as { effectiveFrom: string; unitPrice: number }[];
    let p = price;
    for (let h = 0; h < r.int(1, 4); h++) {
      history.unshift({ effectiveFrom: addDays(CORPUS_TODAY, -(h * r.int(200, 400) + r.int(0, 90))), unitPrice: p });
      p = Math.round(p * r.float(0.9, 1.0) * 100) / 100;
    }
    out.push({
      code: `ITM-${String(i).padStart(6, "0")}`,
      name,
      nameAr: variant ? `${noun[1]} - ${variant}` : noun[1],
      category: cat.name,
      uom: r.pick(cat.uoms),
      taxCode: r.pick(cat.taxCodes) as TaxCode,
      unitPrice: price,
      currency: COMPANY.currency,
      active: r.chance(0.96),
      priceHistory: history,
    });
  }
  return out;
}

export function generateEmployees(rng: Rng, n: number = CORPUS_SIZES.employees): GenEmployee[] {
  const out: GenEmployee[] = [];
  const roles: GenEmployee["role"][] = [];
  // 6 approvers with limits, 8 buyers, 6 warehouse, 6 AP clerks, rest requesters
  for (let i = 0; i < 6; i++) roles.push("approver");
  for (let i = 0; i < 8; i++) roles.push("buyer");
  for (let i = 0; i < 6; i++) roles.push("warehouse");
  for (let i = 0; i < 6; i++) roles.push("ap_clerk");
  while (roles.length < n) roles.push("requester");
  const limits = [25000, 50000, 100000, 250000, 500000, 1000000];
  const seen = new Set<string>();
  for (let i = 1; i <= n; i++) {
    const r = rng.fork(`employee:${i}`);
    let name = `${r.pick(FIRST_NAMES)} ${r.pick(LAST_NAMES)}`;
    while (seen.has(name)) name = `${r.pick(FIRST_NAMES)} ${r.pick(LAST_NAMES)}`;
    seen.add(name);
    const role = roles[i - 1];
    out.push({
      code: `EMP-${String(i).padStart(4, "0")}`,
      name,
      email: slugEmail(name, "al-nahda.example"),
      role,
      approvalLimit: role === "approver" ? limits[(i - 1) % limits.length] : null,
      costCenterCode:
        role === "buyer" ? "CC-130" : role === "warehouse" ? "CC-210" : role === "ap_clerk" ? "CC-110" : r.pick(COST_CENTERS)[0],
    });
  }
  return out;
}

export interface PoGenContext {
  vendors: GenVendor[];
  items: GenItem[];
  employees: GenEmployee[];
}

/** Generate one coherent PO. Lines tie arithmetically; dates are ordered; currency matches vendor. */
export function generatePo(
  r: Rng,
  ctx: PoGenContext,
  opts: { number: string; orderDate: string; status: GenPo["status"]; historical: boolean },
): GenPo {
  const active = ctx.vendors.filter((v) => v.status === "active");
  const vendor = r.pick(active);
  const buyers = ctx.employees.filter((e) => e.role === "buyer");
  const requesters = ctx.employees.filter((e) => e.role === "requester");
  const approvers = ctx.employees.filter((e) => e.role === "approver");
  const buyer = r.pick(buyers);
  const requester = r.pick(requesters);
  const pool = ctx.items.filter((i) => i.active && i.category === vendor.category);
  const itemPool = pool.length >= 3 ? pool : ctx.items.filter((i) => i.active);
  const nLines = r.weighted([[1, 3], [2, 4], [3, 4], [4, 2], [5, 1.5], [6, 1], [8, 0.5]]);
  const chosen = r.sample(itemPool, nLines);
  const lines: GenPoLine[] = chosen.map((it, idx) => {
    const quantity = it.uom === "TON" ? r.int(1, 20) : it.uom === "PLT" ? r.int(1, 12) : r.weighted([[r.int(1, 10), 4], [r.int(10, 100), 3], [r.int(100, 1000), 1]]);
    const discountPct = r.chance(0.2) ? r.pick([2.5, 5, 7.5, 10]) : 0;
    const m = lineMoney({ quantity, unitPrice: it.unitPrice, discountPct, taxCode: it.taxCode });
    return {
      lineNo: idx + 1,
      itemCode: it.code,
      description: it.name,
      quantity,
      uom: it.uom,
      unitPrice: it.unitPrice,
      discountPct,
      taxCode: it.taxCode,
      taxAmount: m.tax,
      lineTotal: m.net,
      glCode: GL_BY_CATEGORY[it.category] ?? "7900",
    };
  });
  const t = totals(lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct, taxCode: l.taxCode })));
  const approver = approvers.find((a) => (a.approvalLimit ?? 0) >= t.grandTotal) ?? approvers[approvers.length - 1];
  const orderDate = toWorkingDay(opts.orderDate);
  return {
    number: opts.number,
    vendorCode: vendor.code,
    buyerCode: buyer.code,
    requesterCode: requester.code,
    approverCode: approver.code,
    costCenterCode: requester.costCenterCode,
    deliveryLocationCode: r.pick(DELIVERY_LOCATIONS)[0],
    currency: COMPANY.currency,
    orderDate,
    expectedDeliveryDate: toWorkingDay(addDays(orderDate, r.int(3, 45))),
    paymentTermsDays: vendor.paymentTermsDays,
    status: opts.status,
    subtotal: t.subtotal,
    taxTotal: t.taxTotal,
    grandTotal: t.grandTotal,
    notes: r.chance(0.3) ? r.pick(["Deliver to receiving dock B.", "Partial deliveries accepted.", "Quote ref attached.", "Urgent - project deadline.", "Call ahead before delivery."]) : null,
    historical: opts.historical,
    lines,
  };
}

/** Three years of closed history, no PDFs. */
export function generateHistory(rng: Rng, ctx: PoGenContext, n: number = CORPUS_SIZES.historyPos): GenPo[] {
  const start = addDays(CORPUS_TODAY, -3 * 365);
  const span = 3 * 365 - 30;
  const dates: string[] = [];
  const r0 = rng.fork("history:dates");
  for (let i = 0; i < n; i++) dates.push(addDays(start, r0.int(0, span)));
  dates.sort();
  const seqByYear = new Map<number, number>();
  return dates.map((d, i) => {
    const y = Number(d.slice(0, 4));
    const seq = (seqByYear.get(y) ?? 0) + 1;
    seqByYear.set(y, seq);
    const r = rng.fork(`history:po:${i}`);
    return generatePo(r, ctx, {
      number: businessNumber("PO", d, seq),
      orderDate: d,
      status: r.weighted([["closed", 20], ["cancelled", 1]]),
      historical: true,
    });
  });
}

export function generateCorpus(seed: number): Corpus {
  const rng = new Rng(seed);
  const vendors = generateVendors(rng.fork("vendors"));
  const items = generateItems(rng.fork("items"));
  const employees = generateEmployees(rng.fork("employees"));
  const ctx = { vendors, items, employees };
  return {
    vendors,
    items,
    employees,
    costCenters: COST_CENTERS.map(([code, name, nameAr]) => ({ code, name, nameAr })),
    glAccounts: GL_ACCOUNTS.map(([code, name, type]) => ({ code, name, type })),
    deliveryLocations: DELIVERY_LOCATIONS.map(([code, name, addressLine, city]) => ({ code, name, addressLine, city })),
    history: generateHistory(rng.fork("history"), ctx),
  };
}

/** Sanity: every tax code referenced exists. Kept here so tests can assert on it. */
export function assertCorpusCoherent(c: Corpus) {
  for (const it of c.items) if (!(it.taxCode in TAX_CODES)) throw new Error(`bad tax code ${it.taxCode}`);
  for (const po of c.history) {
    const t = totals(po.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct, taxCode: l.taxCode })));
    if (t.grandTotal !== po.grandTotal) throw new Error(`PO ${po.number} does not tie`);
  }
}
