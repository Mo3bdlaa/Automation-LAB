/**
 * Documents issued by a vendor: quotation, delivery note, tax invoice, payment
 * receipt, and the compliance certificates an authority issues about it.
 *
 * Layout and colours vary per vendor (vendor-brand.ts) and so does the script:
 * a vendor prints in English, Arabic-first or bilingual according to its own
 * `documentLanguage` (see i18n.ts). Elements carrying a value the grader checks
 * are marked with `data-gt-field`, which is what the renderer measures to
 * record where each field sits on the page.
 */
import { baseDocument, esc } from "./base";
import { vendorBrand, type VendorBrand } from "./vendor-brand";
import { docLocale, type DocLang, type DocLocale } from "./i18n";
import { COMPANY } from "../../generator/vocab";
import { fmtNumber } from "../../generator/money";
import { formatIban } from "../../generator/iban";

export interface VendorParty {
  code: string | null;
  name: string;
  nameAr: string | null;
  addressLine: string;
  city: string;
  country: string;
  taxId: string;
  crNumber: string;
  iban: string;
  bankName: string;
  swift?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  /** The script this vendor prints its own paperwork in. */
  documentLanguage?: DocLang;
}

export interface MoneyLine {
  lineNo: number;
  itemCode: string | null;
  description: string;
  descriptionAr?: string | null;
  quantity: string | number;
  uom: string;
  unitPrice: string | number;
  discountPct?: string | number;
  taxCode?: string;
  taxRate?: string | number;
  taxAmount: string | number;
  lineTotal: string | number;
}

function localeFor(v: VendorParty): DocLocale {
  return docLocale(v.documentLanguage ?? "bilingual", v.code ?? v.taxId);
}

/** A value the grader reads back: tagged with its field path and localised. */
function gt(field: string, value: string, loc: DocLocale, id?: string): string {
  return `<span data-gt-field="${esc(field)}"${id ? ` id="${id}"` : ""}>${loc.digits(value)}</span>`;
}

function brandCss(b: VendorBrand): string {
  return `
.vh { display: flex; justify-content: space-between; align-items: flex-start; gap: 12pt; padding-bottom: 8pt; border-bottom: ${b.layout === 1 ? "1px" : "3px"} solid ${b.accent}; ${b.layout === 2 ? `background:${b.accentSoft}; padding: 10pt; border-radius: 4pt; border-bottom: none;` : ""} }
.vh .vname { font-size: ${b.layout === 1 ? "17pt" : "15pt"}; font-weight: 700; color: ${b.accent}; ${b.serif ? 'font-family: "Noto Serif", Georgia, serif;' : ""} }
.vh .vname-ar { font-size: 12.5pt; color: ${b.accent}; }
.vh .vmeta { font-size: 8.5pt; color: #444; margin-top: 2pt; }
.vh .dtitle { text-align: right; }
[dir="rtl"] .vh .dtitle { text-align: left; }
.vh .dtitle h2 { margin: 0; font-size: 17pt; letter-spacing: 0.06em; color: ${b.accent}; }
.vh .dtitle .ar { font-size: 13pt; }
.meta { margin-top: 8pt; display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; font-size: 9.5pt; }
.box { border: 1px solid #cfd6de; border-radius: 3pt; padding: 6pt 8pt; }
.box h3 { margin: 0 0 3pt; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.08em; color: ${b.accent}; }
.box h3 .ar { text-transform: none; letter-spacing: 0; font-weight: 400; color: #444; }
.kv { display: grid; grid-template-columns: auto 1fr; column-gap: 8pt; row-gap: 1pt; }
.kv div:nth-child(odd) { color: #555; }
table.lines { width: 100%; border-collapse: collapse; margin-top: 10pt; font-size: 9.5pt; }
table.lines th { background: ${b.layout === 1 ? "#fff" : b.accent}; color: ${b.layout === 1 ? b.accent : "#fff"}; padding: 4pt 5pt; text-align: left; font-size: 8.5pt; ${b.layout === 1 ? `border-bottom: 2px solid ${b.accent};` : ""} }
table.lines th .ar, table.lines th .alt { display: block; font-weight: 400; }
table.lines td { padding: 4pt 5pt; border-bottom: 1px solid #e1e6ec; vertical-align: top; }
${b.layout === 0 ? "table.lines tr:nth-child(even) td { background: #f6f8fa; }" : ""}
.num { text-align: right; font-variant-numeric: tabular-nums; }
.desc-ar { display: block; font-size: 9pt; color: #333; }
.totals { margin-top: 8pt; margin-left: auto; width: 64mm; border-collapse: collapse; font-size: 10pt; }
[dir="rtl"] .totals { margin-left: 0; margin-right: auto; }
.totals td { padding: 3pt 5pt; }
.totals td:first-child { color: #444; }
.totals tr.grand td { font-weight: 700; font-size: 11.5pt; border-top: 2px solid ${b.accent}; color: ${b.accent}; }
.foot { margin-top: 14pt; display: flex; gap: 12pt; font-size: 9pt; }
.foot > div { flex: 1; }
.foot h4 { margin: 0 0 3pt; font-size: 9pt; color: ${b.accent}; }
.stamp { display: inline-block; margin-top: 8pt; border: 2px solid ${b.accent}; color: ${b.accent}; border-radius: 4pt; padding: 3pt 10pt; font-weight: 700; letter-spacing: 0.1em; transform: rotate(-4deg); opacity: 0.85; }
.sig { border-top: 1px solid #333; margin-top: 26pt; padding-top: 2pt; color: #444; }
.small { font-size: 8.5pt; color: #555; }
`;
}

function vendorHeader(v: VendorParty, loc: DocLocale, title: string, titleAr: string, right: [string, string, string][]): string {
  const primaryName = loc.arabicFirst && v.nameAr ? v.nameAr : v.name;
  const secondaryName = loc.arabicFirst ? v.name : v.nameAr;
  return `<div class="vh">
  <div>
    <div class="vname"${loc.arabicFirst ? ' dir="rtl"' : ""}><span data-gt-field="vendor.name">${esc(primaryName)}</span></div>
    ${secondaryName && loc.lang !== "en" ? `<div class="vname-ar${loc.arabicFirst ? " alt" : " ar"}"${loc.arabicFirst ? "" : ' dir="rtl"'}>${esc(secondaryName)}</div>` : ""}
    <div class="vmeta">${loc.ltr(`${v.addressLine}, ${v.city}, ${v.country}`)}${v.phone ? ` · ${loc.digits(v.phone)}` : ""}${v.email ? ` · ${loc.ltr(v.email)}` : ""}</div>
    <div class="vmeta">${loc.plain("CR", "س.ت")} ${loc.digits(v.crNumber)} · ${loc.plain("Tax ID", "الرقم الضريبي")} ${gt("vendor.taxId", v.taxId, loc)}</div>
  </div>
  <div class="dtitle">
    <h2${loc.arabicFirst ? ' class="ar" dir="rtl"' : ""}>${esc(loc.arabicFirst ? titleAr : title)}</h2>
    ${loc.lang === "en" ? "" : `<div class="${loc.arabicFirst ? "alt" : "ar"}"${loc.arabicFirst ? "" : ' dir="rtl"'}>${esc(loc.arabicFirst ? title : titleAr)}</div>`}
    <table style="margin-inline-start:auto;margin-top:4pt;font-size:9.5pt;border-collapse:collapse">
      ${right.map(([l, la, val]) => `<tr><td style="color:#555;text-align:end;padding:1pt 4pt">${loc.label(l, la)}</td><td style="font-weight:700;padding:1pt 4pt">${val}</td></tr>`).join("")}
    </table>
  </div>
</div>`;
}

function billTo(loc: DocLocale, extra: string): string {
  return `<div class="box">
  <h3>${loc.label("Bill to", "فاتورة إلى")}</h3>
  <div><strong>${loc.name(COMPANY.name, COMPANY.nameAr)}</strong></div>
  <div>${loc.ltr(`${COMPANY.addressLine}, ${COMPANY.city}`)}</div>
  <div class="small">${loc.plain("Tax ID", "الرقم الضريبي")} ${loc.digits(COMPANY.taxId)} · ${loc.plain("CR", "س.ت")} ${loc.digits(COMPANY.crNumber)}</div>
  ${extra}
</div>`;
}

function linesTable(lines: MoneyLine[], loc: DocLocale, opts: { showTaxRate?: boolean; showDiscount?: boolean }): string {
  const rows = lines
    .map((l, i) => {
      const desc = loc.arabicFirst && l.descriptionAr ? l.descriptionAr : l.description;
      const descAlt = loc.arabicFirst ? l.description : l.descriptionAr;
      return `<tr>
  <td class="num">${loc.digits(l.lineNo)}</td>
  <td>${gt(`lines[${i}].itemCode`, l.itemCode ?? "", loc)}</td>
  <td><span data-gt-field="lines[${i}].description"${loc.arabicFirst ? ' dir="rtl"' : ""}>${esc(desc)}</span>${descAlt && loc.lang !== "en" ? `<span class="desc-ar ${loc.arabicFirst ? "alt" : "ar"}"${loc.arabicFirst ? "" : ' dir="rtl"'}>${esc(descAlt)}</span>` : ""}</td>
  <td class="num">${gt(`lines[${i}].quantity`, fmtNumber(l.quantity, "en-US", Number(l.quantity) % 1 === 0 ? 0 : 3), loc)}</td>
  <td>${gt(`lines[${i}].uom`, l.uom, loc)}</td>
  <td class="num">${gt(`lines[${i}].unitPrice`, fmtNumber(l.unitPrice), loc)}</td>
  ${opts.showDiscount ? `<td class="num">${Number(l.discountPct ?? 0) ? loc.digits(fmtNumber(l.discountPct!, "en-US", 1)) + "%" : "—"}</td>` : ""}
  ${opts.showTaxRate ? `<td class="num">${gt(`lines[${i}].taxRate`, (Number(l.taxRate ?? 0) * 100).toFixed((Number(l.taxRate ?? 0) * 100) % 1 ? 1 : 0), loc)}%</td>` : `<td>${esc(l.taxCode ?? "")}</td>`}
  <td class="num">${gt(`lines[${i}].taxAmount`, fmtNumber(l.taxAmount), loc)}</td>
  <td class="num">${gt(`lines[${i}].lineTotal`, fmtNumber(l.lineTotal), loc)}</td>
</tr>`;
    })
    .join("\n");
  return `<table class="lines"><thead><tr>
  <th class="num">#</th><th>${loc.labelBlock("Item", "الصنف")}</th><th>${loc.labelBlock("Description", "الوصف")}</th>
  <th class="num">${loc.labelBlock("Qty", "الكمية")}</th><th>${loc.labelBlock("UoM", "الوحدة")}</th><th class="num">${loc.labelBlock("Unit price", "سعر الوحدة")}</th>
  ${opts.showDiscount ? `<th class="num">${loc.labelBlock("Disc.", "خصم")}</th>` : ""}
  ${opts.showTaxRate ? `<th class="num">${loc.labelBlock("VAT %", "نسبة الضريبة")}</th>` : `<th>${loc.labelBlock("Tax", "الضريبة")}</th>`}
  <th class="num">${loc.labelBlock("Tax amt", "قيمة الضريبة")}</th><th class="num">${loc.labelBlock("Total", "الإجمالي")}</th>
</tr></thead><tbody>${rows}</tbody></table>`;
}

function totalsTable(loc: DocLocale, currency: string, subtotal: string | number, taxTotal: string | number, grandTotal: string | number, id = "grand-total"): string {
  return `<table class="totals">
  <tr><td>${loc.label("Subtotal", "المجموع الفرعي")}</td><td class="num">${gt("subtotal", fmtNumber(subtotal), loc)}</td></tr>
  <tr><td>${loc.label("VAT", "ضريبة القيمة المضافة")}</td><td class="num">${gt("taxTotal", fmtNumber(taxTotal), loc)}</td></tr>
  <tr class="grand"><td>${loc.label("Total", "الإجمالي")} ${esc(currency)}</td><td class="num">${gt("grandTotal", fmtNumber(grandTotal), loc, id)}</td></tr>
</table>`;
}

// --- Quotation -------------------------------------------------------------

export interface QuoteTemplateData {
  number: string; rfqNumber: string; quoteDate: string; validUntil: string; currency: string; paymentTermsDays: number; leadTimeDays: number;
  subtotal: string | number; taxTotal: string | number; grandTotal: string | number; vendor: VendorParty; lines: MoneyLine[];
}

export function renderQuoteHtml(d: QuoteTemplateData): string {
  const b = vendorBrand(d.vendor.code ?? d.vendor.taxId);
  const loc = localeFor(d.vendor);
  const body = `
${vendorHeader(d.vendor, loc, "QUOTATION", "عرض سعر", [
  ["Quote No.", "رقم العرض", gt("number", d.number, loc)],
  ["Date", "التاريخ", loc.date(d.quoteDate)],
  ["Valid until", "صالح حتى", loc.date(d.validUntil)],
  ["Your RFQ", "طلب عرض السعر", loc.digits(d.rfqNumber)],
])}
<div class="meta">
  ${billTo(loc, "")}
  <div class="box"><h3>${loc.label("Terms", "الشروط")}</h3>
    <div class="kv">
      <div>${loc.label("Currency", "العملة")}</div><div>${esc(d.currency)}</div>
      <div>${loc.label("Payment", "الدفع")}</div><div>${d.paymentTermsDays === 0 ? loc.plain("Due on receipt", "الدفع عند الاستلام") : `${loc.plain("Net", "صافي")} ${loc.digits(d.paymentTermsDays)} ${loc.plain("days", "يوم")}`}</div>
      <div>${loc.label("Lead time", "مدة التوريد")}</div><div>${loc.digits(d.leadTimeDays)} ${loc.plain("days from PO", "يوم من أمر الشراء")}</div>
      <div>${loc.label("Delivery", "التسليم")}</div><div>DAP ${esc(COMPANY.city)}</div>
    </div>
  </div>
</div>
${linesTable(d.lines, loc, {})}
${totalsTable(loc, d.currency, d.subtotal, d.taxTotal, d.grandTotal)}
<div class="foot">
  <div><h4>${loc.label("Notes", "ملاحظات")}</h4><p class="small">${loc.plain(
    "Prices are firm for the validity period. Quantities below the quoted volume may be re-priced. This quotation is not a tax invoice.",
    "الأسعار ثابتة خلال مدة السريان. قد يعاد تسعير الكميات الأقل من الكمية المعروضة. هذا العرض ليس فاتورة ضريبية.",
  )}</p></div>
  <div><h4>${loc.plain("For", "عن")} ${loc.ltr(d.vendor.name)}</h4><div class="sig">${loc.ltr(d.vendor.contactName ?? "Sales Department")}</div></div>
</div>`;
  return baseDocument({ title: `Quotation ${d.number}`, body, extraCss: brandCss(b), lang: loc.arabicFirst ? "ar" : "en", dir: loc.dir });
}

// --- Delivery note -------------------------------------------------------------

export interface DeliveryNoteTemplateData {
  number: string; poNumber: string; deliveryDate: string; carrier: string | null; vehicle: string | null; packages: number | null;
  deliverTo: { name: string; addressLine: string; city: string } | null; vendor: VendorParty;
  lines: { lineNo: number; poLineNo: number | null; itemCode: string | null; description: string; descriptionAr?: string | null; quantity: string | number; uom: string }[];
}

export function renderDeliveryNoteHtml(d: DeliveryNoteTemplateData): string {
  const b = vendorBrand(d.vendor.code ?? d.vendor.taxId);
  const loc = localeFor(d.vendor);
  const rows = d.lines
    .map((l, i) => {
      const desc = loc.arabicFirst && l.descriptionAr ? l.descriptionAr : l.description;
      const alt = loc.arabicFirst ? l.description : l.descriptionAr;
      return `<tr><td class="num">${loc.digits(l.lineNo)}</td><td>${l.poLineNo ?? ""}</td><td>${gt(`lines[${i}].itemCode`, l.itemCode ?? "", loc)}</td><td><span data-gt-field="lines[${i}].description"${loc.arabicFirst ? ' dir="rtl"' : ""}>${esc(desc)}</span>${alt && loc.lang !== "en" ? `<span class="desc-ar ${loc.arabicFirst ? "alt" : "ar"}">${esc(alt)}</span>` : ""}</td><td class="num">${gt(`lines[${i}].quantity`, fmtNumber(l.quantity, "en-US", Number(l.quantity) % 1 === 0 ? 0 : 3), loc)}</td><td>${gt(`lines[${i}].uom`, l.uom, loc)}</td><td style="width:22mm"></td></tr>`;
    })
    .join("");
  const body = `
${vendorHeader(d.vendor, loc, "DELIVERY NOTE", "إشعار تسليم", [
  ["DN No.", "رقم الإشعار", gt("number", d.number, loc)],
  ["Date", "التاريخ", loc.date(d.deliveryDate)],
  ["Your PO", "أمر الشراء", gt("poNumber", d.poNumber, loc)],
])}
<div class="meta">
  <div class="box"><h3>${loc.label("Deliver to", "التسليم إلى")}</h3>
    <div><strong>${loc.name(COMPANY.name, COMPANY.nameAr)}</strong></div>
    ${d.deliverTo ? `<div>${loc.ltr(d.deliverTo.name)}</div><div>${loc.ltr(`${d.deliverTo.addressLine}, ${d.deliverTo.city}`)}</div>` : ""}
  </div>
  <div class="box"><h3>${loc.label("Shipment", "الشحنة")}</h3>
    <div class="kv">
      <div>${loc.label("Carrier", "الناقل")}</div><div>${loc.ltr(d.carrier ?? "—")}</div>
      <div>${loc.label("Vehicle", "المركبة")}</div><div>${loc.digits(d.vehicle ?? "—")}</div>
      <div>${loc.label("Packages", "الطرود")}</div><div>${d.packages === null ? "—" : loc.digits(d.packages)}</div>
    </div>
  </div>
</div>
<table class="lines"><thead><tr><th class="num">#</th><th>${loc.labelBlock("PO line", "بند الأمر")}</th><th>${loc.labelBlock("Item", "الصنف")}</th><th>${loc.labelBlock("Description", "الوصف")}</th><th class="num">${loc.labelBlock("Qty shipped", "الكمية المشحونة")}</th><th>${loc.labelBlock("UoM", "الوحدة")}</th><th>${loc.labelBlock("Received", "المستلم")}</th></tr></thead><tbody>${rows}</tbody></table>
<div class="foot">
  <div><h4>${loc.label("Dispatched by", "أرسلها")}</h4><div class="sig">${loc.ltr(d.vendor.name)}</div></div>
  <div><h4>${loc.label("Received by", "استلمها")}</h4><div class="sig">${loc.plain("Name / signature / date", "الاسم / التوقيع / التاريخ")}</div></div>
</div>`;
  return baseDocument({ title: `Delivery Note ${d.number}`, body, extraCss: brandCss(b), lang: loc.arabicFirst ? "ar" : "en", dir: loc.dir });
}

// --- Tax invoice -------------------------------------------------------------

export interface InvoiceTemplateData {
  number: string; invoiceDate: string; dueDate: string; poNumber: string | null; currency: string;
  subtotal: string | number; taxTotal: string | number; grandTotal: string | number;
  vendor: VendorParty; printedIban: string; printedBankName: string; lines: MoneyLine[];
}

export function renderInvoiceHtml(d: InvoiceTemplateData): string {
  const b = vendorBrand(d.vendor.code ?? d.vendor.taxId);
  const loc = localeFor(d.vendor);
  const body = `
${vendorHeader(d.vendor, loc, "TAX INVOICE", "فاتورة ضريبية", [
  ["Invoice No.", "رقم الفاتورة", gt("number", d.number, loc)],
  ["Date", "التاريخ", `<span data-gt-field="invoiceDate">${loc.date(d.invoiceDate)}</span>`],
  ["Due date", "تاريخ الاستحقاق", `<span data-gt-field="dueDate">${loc.date(d.dueDate)}</span>`],
  ["PO ref.", "أمر الشراء", d.poNumber ? gt("poNumber", d.poNumber, loc) : "—"],
])}
<div class="meta">
  ${billTo(loc, "")}
  <div class="box"><h3>${loc.label("Remit to", "الدفع إلى")}</h3>
    <div class="kv">
      <div>${loc.label("Bank", "البنك")}</div><div><span data-gt-field="vendor.bankName">${loc.ltr(d.printedBankName)}</span></div>
      <div>${loc.label("IBAN", "الآيبان")}</div><div><span data-gt-field="vendor.iban" id="invoice-iban" dir="ltr">${loc.digits(formatIban(d.printedIban))}</span></div>
      ${d.vendor.swift ? `<div>${loc.label("SWIFT", "سويفت")}</div><div>${loc.ltr(d.vendor.swift)}</div>` : ""}
      <div>${loc.label("Beneficiary", "المستفيد")}</div><div>${loc.ltr(d.vendor.name)}</div>
      <div>${loc.label("Currency", "العملة")}</div><div><span data-gt-field="currency">${loc.ltr(d.currency)}</span></div>
    </div>
  </div>
</div>
${linesTable(d.lines, loc, { showTaxRate: true, showDiscount: true })}
${totalsTable(loc, d.currency, d.subtotal, d.taxTotal, d.grandTotal, "invoice-grand-total")}
<div class="foot">
  <div><h4>${loc.label("Payment terms", "شروط الدفع")}</h4><p class="small">${loc.plain(
    `Please quote invoice number ${d.number} on your remittance. Late payments may incur charges as per contract.`,
    `يرجى ذكر رقم الفاتورة ${d.number} عند السداد. قد تترتب رسوم على التأخير وفق العقد.`,
  )}</p><div class="stamp">${loc.plain("TAX INVOICE", "فاتورة ضريبية")}</div></div>
  <div><h4>${loc.label("Authorised by", "اعتماد")}</h4><div class="sig">${loc.ltr(`${d.vendor.contactName ?? "Accounts Receivable"}, ${d.vendor.name}`)}</div></div>
</div>`;
  return baseDocument({ title: `Tax Invoice ${d.number}`, body, extraCss: brandCss(b), lang: loc.arabicFirst ? "ar" : "en", dir: loc.dir });
}

// --- Receipt -------------------------------------------------------------

export interface ReceiptTemplateData {
  number: string; receiptDate: string; amount: string | number; currency: string; invoiceNumber: string; paymentReference: string; method: string; vendor: VendorParty;
}

export function renderReceiptHtml(d: ReceiptTemplateData): string {
  const b = vendorBrand(d.vendor.code ?? d.vendor.taxId);
  const loc = localeFor(d.vendor);
  const body = `
${vendorHeader(d.vendor, loc, "PAYMENT RECEIPT", "سند قبض", [
  ["Receipt No.", "رقم السند", gt("number", d.number, loc)],
  ["Date", "التاريخ", `<span data-gt-field="receiptDate">${loc.date(d.receiptDate)}</span>`],
])}
<div class="meta" style="grid-template-columns:1fr">
  <div class="box">
    <h3>${loc.label("Received from", "استلمنا من")}</h3>
    <div><strong>${loc.name(COMPANY.name, COMPANY.nameAr)}</strong></div>
    <div class="kv" style="margin-top:6pt">
      <div>${loc.label("Amount", "المبلغ")}</div><div id="receipt-amount"><strong>${gt("amount", fmtNumber(d.amount), loc)} <span data-gt-field="currency">${esc(d.currency)}</span></strong></div>
      <div>${loc.label("In settlement of", "سداداً عن")}</div><div>${loc.plain("Invoice", "فاتورة")} ${gt("invoiceNumber", d.invoiceNumber, loc)}</div>
      <div>${loc.label("Method", "طريقة الدفع")}</div><div>${loc.ltr(d.method.replace(/_/g, " "))}</div>
      <div>${loc.label("Reference", "المرجع")}</div><div>${gt("paymentReference", d.paymentReference, loc)}</div>
    </div>
    <div class="stamp">${loc.plain("PAID", "مدفوع")} · ${loc.plain("مدفوع", "PAID")}</div>
  </div>
</div>
<div class="foot">
  <div></div>
  <div><h4>${loc.label("Received by", "المستلم")}</h4><div class="sig">${loc.ltr(`${d.vendor.contactName ?? "Accounts"}, ${d.vendor.name}`)}</div></div>
</div>`;
  return baseDocument({ title: `Receipt ${d.number}`, body, extraCss: brandCss(b), lang: loc.arabicFirst ? "ar" : "en", dir: loc.dir });
}

// --- Vendor compliance documents (issued by authorities / bank) ----------------

export interface VendorComplianceTemplateData {
  kind: "vendor_licence" | "vendor_tax_card" | "vendor_bank_letter" | "vendor_trade_licence";
  number: string; issuedDate: string; expiryDate: string; issuer: string; attributes: Record<string, string>; vendor: VendorParty;
}

const KIND_TITLES: Record<VendorComplianceTemplateData["kind"], [string, string, string]> = {
  vendor_licence: ["COMMERCIAL REGISTRATION CERTIFICATE", "شهادة السجل التجاري", "#0f5132"],
  vendor_tax_card: ["TAX REGISTRATION CERTIFICATE", "شهادة التسجيل الضريبي", "#5a189a"],
  vendor_bank_letter: ["BANK ACCOUNT CONFIRMATION LETTER", "خطاب تعريف بالحساب البنكي", "#1d3557"],
  vendor_trade_licence: ["MUNICIPAL TRADE LICENCE", "رخصة بلدية", "#7f4f24"],
};

const ATTRIBUTE_LABELS: Record<string, [string, string]> = {
  legalForm: ["Legal form", "الشكل القانوني"], capital: ["Capital", "رأس المال"], activities: ["Activities", "الأنشطة"], manager: ["Manager", "المدير"], city: ["City", "المدينة"],
  vatGroup: ["VAT group", "فئة التسجيل"], taxOffice: ["Tax office", "المكتب الضريبي"], iban: ["IBAN", "الآيبان"], swift: ["SWIFT", "سويفت"], accountName: ["Account name", "اسم الحساب"], branch: ["Branch", "الفرع"],
  premises: ["Premises", "المقر"], category: ["Category", "الفئة"],
};

export function renderVendorComplianceHtml(d: VendorComplianceTemplateData): string {
  const [title, titleAr, colour] = KIND_TITLES[d.kind];
  // An authority issues these in the language of the vendor's own paperwork.
  const loc = localeFor(d.vendor);
  const css = `
.cert { border: 6px double ${colour}; padding: 16pt 20pt; margin-top: 6pt; min-height: 160mm; position: relative; }
.cert .issuer { text-align: center; color: ${colour}; }
.cert .issuer .en { font-size: 12pt; letter-spacing: 0.15em; text-transform: uppercase; }
.cert .issuer .ar { font-size: 14pt; }
.cert h2 { text-align: center; margin: 12pt 0 2pt; font-size: 16pt; color: ${colour}; letter-spacing: 0.05em; }
.cert .h2ar { text-align: center; font-size: 13pt; color: ${colour}; }
.cert .no { text-align: center; margin: 8pt 0 14pt; font-size: 11pt; }
.cert .no strong { font-size: 14pt; letter-spacing: 0.1em; }
.grid { display: grid; grid-template-columns: 34mm 1fr 34mm; column-gap: 8pt; row-gap: 4pt; font-size: 10pt; }
.grid .l { color: #444; } .grid .la { text-align: end; color: #444; }
.grid .v { font-weight: 600; }
.seal { position: absolute; inset-inline-end: 22pt; bottom: 22pt; width: 34mm; height: 34mm; border: 2px solid ${colour}; border-radius: 50%; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 7.5pt; color: ${colour}; opacity: 0.75; transform: rotate(-12deg); line-height: 1.2; }
.validity { margin-top: 14pt; font-size: 10pt; }
.qr { position: absolute; inset-inline-start: 22pt; bottom: 22pt; width: 22mm; height: 22mm; background: repeating-linear-gradient(90deg, #222 0 2pt, #fff 2pt 4pt), repeating-linear-gradient(0deg, #222 0 2pt, #fff 2pt 4pt); background-blend-mode: multiply; opacity: 0.8; }
`;
  // On an Arabic-first certificate the Arabic label leads and the English one
  // follows in the third column; on the others it is the other way round.
  const row = (en: string, ar: string, value: string) =>
    loc.arabicFirst
      ? `<div class="l ar" dir="rtl">${esc(ar)}</div><div class="v">${value}</div><div class="la alt">${esc(en)}</div>`
      : `<div class="l">${esc(en)}</div><div class="v">${value}</div><div class="la ar" dir="rtl">${esc(ar)}</div>`;
  const rows = Object.entries(d.attributes)
    .map(([k, v]) => {
      const [l, la] = ATTRIBUTE_LABELS[k] ?? [k, ""];
      return row(l, la, loc.digits(v));
    })
    .join("");
  const issuerLabel = issuerAr(d.kind, d.vendor.city);
  const body = `
<div class="cert">
  <div class="issuer">${
    loc.arabicFirst
      ? `<div class="ar" dir="rtl">${esc(issuerLabel)}</div><div class="alt">${esc(d.issuer)}</div>`
      : `<div class="en">${esc(d.issuer)}</div><div class="ar" dir="rtl">${esc(issuerLabel)}</div>`
  }</div>
  <h2${loc.arabicFirst ? ' class="ar" dir="rtl"' : ""}>${esc(loc.arabicFirst ? titleAr : title)}</h2>
  <div class="h2ar ${loc.arabicFirst ? "alt" : "ar"}"${loc.arabicFirst ? "" : ' dir="rtl"'}>${esc(loc.arabicFirst ? title : titleAr)}</div>
  <div class="no">${loc.plain("No.", "رقم")} <strong id="doc-number" data-gt-field="number">${loc.digits(d.number)}</strong></div>
  <div class="grid">
    ${row("Name", "الاسم", `<span data-gt-field="vendor.name">${esc(loc.arabicFirst && d.vendor.nameAr ? d.vendor.nameAr : d.vendor.name)}</span>`)}
    ${row(loc.arabicFirst ? "Name (English)" : "Arabic name", loc.arabicFirst ? "الاسم بالإنجليزية" : "الاسم العربي", `<span${loc.arabicFirst ? "" : ' class="ar" dir="rtl" style="text-align:left"'}>${esc(loc.arabicFirst ? d.vendor.name : d.vendor.nameAr ?? "")}</span>`)}
    ${row("Address", "العنوان", loc.ltr(`${d.vendor.addressLine}, ${d.vendor.city}, ${d.vendor.country}`))}
    ${d.kind !== "vendor_licence" ? row("CR No.", "السجل التجاري", `<span data-gt-field="vendor.crNumber">${loc.digits(d.vendor.crNumber)}</span>`) : ""}
    ${d.kind !== "vendor_tax_card" ? row("Tax ID", "الرقم الضريبي", `<span data-gt-field="vendor.taxId">${loc.digits(d.vendor.taxId)}</span>`) : ""}
    ${rows}
  </div>
  <div class="validity grid">
    ${row("Issued", "تاريخ الإصدار", `<span id="doc-issued" data-gt-field="issuedDate">${loc.date(d.issuedDate)}</span>`)}
    ${row("Valid until", "صالح حتى", `<span id="doc-expiry" data-gt-field="expiryDate">${loc.date(d.expiryDate)}</span>`)}
  </div>
  <div class="qr" aria-hidden="true"></div>
  <div class="seal">${esc(loc.arabicFirst ? issuerLabel : d.issuer)}<br>${loc.plain("OFFICIAL SEAL", "ختم رسمي")}</div>
</div>`;
  return baseDocument({ title: `${title} ${d.number}`, body, extraCss: css, lang: loc.arabicFirst ? "ar" : "en", dir: loc.dir });
}

function issuerAr(kind: VendorComplianceTemplateData["kind"], city: string): string {
  switch (kind) {
    case "vendor_licence": return "وزارة التجارة";
    case "vendor_tax_card": return "هيئة الضرائب والجمارك";
    case "vendor_bank_letter": return "إدارة الحسابات المؤسسية";
    case "vendor_trade_licence": return `بلدية ${city}`;
  }
}
