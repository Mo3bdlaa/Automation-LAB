/**
 * Documents issued by a vendor: quotation, delivery note, tax invoice, payment
 * receipt. Layout and colours vary per vendor (vendor-brand.ts). Bilingual.
 */
import { baseDocument, esc } from "./base";
import { vendorBrand, type VendorBrand } from "./vendor-brand";
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

function brandCss(b: VendorBrand): string {
  return `
.vh { display: flex; justify-content: space-between; align-items: flex-start; gap: 12pt; padding-bottom: 8pt; border-bottom: ${b.layout === 1 ? "1px" : "3px"} solid ${b.accent}; ${b.layout === 2 ? `background:${b.accentSoft}; padding: 10pt; border-radius: 4pt; border-bottom: none;` : ""} }
.vh .vname { font-size: ${b.layout === 1 ? "17pt" : "15pt"}; font-weight: 700; color: ${b.accent}; ${b.serif ? 'font-family: "Noto Serif", Georgia, serif;' : ""} }
.vh .vname-ar { font-size: 12.5pt; color: ${b.accent}; }
.vh .vmeta { font-size: 8.5pt; color: #444; margin-top: 2pt; }
.vh .dtitle { text-align: right; }
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
table.lines th .ar { display: block; font-weight: 400; }
table.lines td { padding: 4pt 5pt; border-bottom: 1px solid #e1e6ec; vertical-align: top; }
${b.layout === 0 ? "table.lines tr:nth-child(even) td { background: #f6f8fa; }" : ""}
.num { text-align: right; font-variant-numeric: tabular-nums; }
.desc-ar { display: block; font-size: 9pt; color: #333; }
.totals { margin-top: 8pt; margin-left: auto; width: 64mm; border-collapse: collapse; font-size: 10pt; }
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

function vendorHeader(v: VendorParty, title: string, titleAr: string, right: [string, string, string][]): string {
  return `<div class="vh">
  <div>
    <div class="vname">${esc(v.name)}</div>
    ${v.nameAr ? `<div class="vname-ar ar" dir="rtl">${esc(v.nameAr)}</div>` : ""}
    <div class="vmeta">${esc(v.addressLine)}, ${esc(v.city)}, ${esc(v.country)}${v.phone ? ` · ${esc(v.phone)}` : ""}${v.email ? ` · ${esc(v.email)}` : ""}</div>
    <div class="vmeta">CR ${esc(v.crNumber)} · Tax ID ${esc(v.taxId)}</div>
  </div>
  <div class="dtitle">
    <h2>${esc(title)}</h2>
    <div class="ar" dir="rtl">${esc(titleAr)}</div>
    <table style="margin-left:auto;margin-top:4pt;font-size:9.5pt;border-collapse:collapse">
      ${right.map(([l, la, val]) => `<tr><td style="color:#555;text-align:right;padding:1pt 4pt">${esc(l)} <span class="ar">${esc(la)}</span></td><td style="font-weight:700;padding:1pt 4pt">${esc(val)}</td></tr>`).join("")}
    </table>
  </div>
</div>`;
}

function billTo(extra: string): string {
  return `<div class="box">
  <h3>Bill to <span class="ar">فاتورة إلى</span></h3>
  <div><strong>${esc(COMPANY.name)}</strong></div>
  <div class="ar" dir="rtl">${esc(COMPANY.nameAr)}</div>
  <div>${esc(COMPANY.addressLine)}, ${esc(COMPANY.city)}</div>
  <div class="small">Tax ID ${esc(COMPANY.taxId)} · CR ${esc(COMPANY.crNumber)}</div>
  ${extra}
</div>`;
}

function linesTable(lines: MoneyLine[], opts: { showTaxRate?: boolean; showDiscount?: boolean }): string {
  const rows = lines
    .map(
      (l) => `<tr>
  <td class="num">${l.lineNo}</td>
  <td>${esc(l.itemCode ?? "")}</td>
  <td>${esc(l.description)}${l.descriptionAr ? `<span class="desc-ar ar" dir="rtl">${esc(l.descriptionAr)}</span>` : ""}</td>
  <td class="num">${fmtNumber(l.quantity, "en-US", Number(l.quantity) % 1 === 0 ? 0 : 3)}</td>
  <td>${esc(l.uom)}</td>
  <td class="num">${fmtNumber(l.unitPrice)}</td>
  ${opts.showDiscount ? `<td class="num">${Number(l.discountPct ?? 0) ? fmtNumber(l.discountPct!, "en-US", 1) + "%" : "—"}</td>` : ""}
  ${opts.showTaxRate ? `<td class="num">${(Number(l.taxRate ?? 0) * 100).toFixed(l.taxRate && Number(l.taxRate) * 100 % 1 ? 1 : 0)}%</td>` : `<td>${esc(l.taxCode ?? "")}</td>`}
  <td class="num">${fmtNumber(l.taxAmount)}</td>
  <td class="num">${fmtNumber(l.lineTotal)}</td>
</tr>`,
    )
    .join("\n");
  return `<table class="lines"><thead><tr>
  <th class="num">#</th><th>Item<span class="ar">الصنف</span></th><th>Description<span class="ar">الوصف</span></th>
  <th class="num">Qty<span class="ar">الكمية</span></th><th>UoM<span class="ar">الوحدة</span></th><th class="num">Unit price<span class="ar">سعر الوحدة</span></th>
  ${opts.showDiscount ? '<th class="num">Disc.<span class="ar">خصم</span></th>' : ""}
  ${opts.showTaxRate ? '<th class="num">VAT %<span class="ar">نسبة الضريبة</span></th>' : '<th>Tax<span class="ar">الضريبة</span></th>'}
  <th class="num">Tax amt<span class="ar">قيمة الضريبة</span></th><th class="num">Total<span class="ar">الإجمالي</span></th>
</tr></thead><tbody>${rows}</tbody></table>`;
}

function totalsTable(currency: string, subtotal: string | number, taxTotal: string | number, grandTotal: string | number, id = "grand-total"): string {
  return `<table class="totals">
  <tr><td>Subtotal <span class="ar">المجموع الفرعي</span></td><td class="num">${fmtNumber(subtotal)}</td></tr>
  <tr><td>VAT <span class="ar">ضريبة القيمة المضافة</span></td><td class="num">${fmtNumber(taxTotal)}</td></tr>
  <tr class="grand"><td>Total ${esc(currency)} <span class="ar">الإجمالي</span></td><td class="num" id="${id}">${fmtNumber(grandTotal)}</td></tr>
</table>`;
}

// --- Quotation -------------------------------------------------------------

export interface QuoteTemplateData {
  number: string; rfqNumber: string; quoteDate: string; validUntil: string; currency: string; paymentTermsDays: number; leadTimeDays: number;
  subtotal: string | number; taxTotal: string | number; grandTotal: string | number; vendor: VendorParty; lines: MoneyLine[];
}

export function renderQuoteHtml(d: QuoteTemplateData): string {
  const b = vendorBrand(d.vendor.code ?? d.vendor.taxId);
  const body = `
${vendorHeader(d.vendor, "QUOTATION", "عرض سعر", [["Quote No.", "رقم العرض", d.number], ["Date", "التاريخ", d.quoteDate], ["Valid until", "صالح حتى", d.validUntil], ["Your RFQ", "طلب عرض السعر", d.rfqNumber]])}
<div class="meta">
  ${billTo("")}
  <div class="box"><h3>Terms <span class="ar">الشروط</span></h3>
    <div class="kv">
      <div>Currency</div><div>${esc(d.currency)}</div>
      <div>Payment</div><div>${d.paymentTermsDays === 0 ? "Due on receipt" : `Net ${d.paymentTermsDays} days`}</div>
      <div>Lead time</div><div>${d.leadTimeDays} days from PO</div>
      <div>Delivery</div><div>DAP ${esc(COMPANY.city)}, packing included</div>
    </div>
  </div>
</div>
${linesTable(d.lines, {})}
${totalsTable(d.currency, d.subtotal, d.taxTotal, d.grandTotal)}
<div class="foot">
  <div><h4>Notes <span class="ar">ملاحظات</span></h4><p class="small">Prices are firm for the validity period. Quantities below the quoted volume may be re-priced. This quotation is not a tax invoice.</p></div>
  <div><h4>For ${esc(d.vendor.name)}</h4><div class="sig">${esc(d.vendor.contactName ?? "Sales Department")}</div></div>
</div>`;
  return baseDocument({ title: `Quotation ${d.number}`, body, extraCss: brandCss(b) });
}

// --- Delivery note -------------------------------------------------------------

export interface DeliveryNoteTemplateData {
  number: string; poNumber: string; deliveryDate: string; carrier: string | null; vehicle: string | null; packages: number | null;
  deliverTo: { name: string; addressLine: string; city: string } | null; vendor: VendorParty;
  lines: { lineNo: number; poLineNo: number | null; itemCode: string | null; description: string; descriptionAr?: string | null; quantity: string | number; uom: string }[];
}

export function renderDeliveryNoteHtml(d: DeliveryNoteTemplateData): string {
  const b = vendorBrand(d.vendor.code ?? d.vendor.taxId);
  const rows = d.lines.map((l) => `<tr><td class="num">${l.lineNo}</td><td>${l.poLineNo ?? ""}</td><td>${esc(l.itemCode ?? "")}</td><td>${esc(l.description)}${l.descriptionAr ? `<span class="desc-ar ar" dir="rtl">${esc(l.descriptionAr)}</span>` : ""}</td><td class="num">${fmtNumber(l.quantity, "en-US", Number(l.quantity) % 1 === 0 ? 0 : 3)}</td><td>${esc(l.uom)}</td><td style="width:22mm"></td></tr>`).join("");
  const body = `
${vendorHeader(d.vendor, "DELIVERY NOTE", "إشعار تسليم", [["DN No.", "رقم الإشعار", d.number], ["Date", "التاريخ", d.deliveryDate], ["Your PO", "أمر الشراء", d.poNumber]])}
<div class="meta">
  <div class="box"><h3>Deliver to <span class="ar">التسليم إلى</span></h3>
    <div><strong>${esc(COMPANY.name)}</strong></div>
    ${d.deliverTo ? `<div>${esc(d.deliverTo.name)}</div><div>${esc(d.deliverTo.addressLine)}, ${esc(d.deliverTo.city)}</div>` : ""}
  </div>
  <div class="box"><h3>Shipment <span class="ar">الشحنة</span></h3>
    <div class="kv">
      <div>Carrier</div><div>${esc(d.carrier ?? "—")}</div>
      <div>Vehicle</div><div>${esc(d.vehicle ?? "—")}</div>
      <div>Packages</div><div>${d.packages ?? "—"}</div>
    </div>
  </div>
</div>
<table class="lines"><thead><tr><th class="num">#</th><th>PO line</th><th>Item<span class="ar">الصنف</span></th><th>Description<span class="ar">الوصف</span></th><th class="num">Qty shipped<span class="ar">الكمية المشحونة</span></th><th>UoM<span class="ar">الوحدة</span></th><th>Received<span class="ar">المستلم</span></th></tr></thead><tbody>${rows}</tbody></table>
<div class="foot">
  <div><h4>Dispatched by <span class="ar">أرسلها</span></h4><div class="sig">${esc(d.vendor.name)} Warehouse</div></div>
  <div><h4>Received by <span class="ar">استلمها</span></h4><div class="sig">Name / signature / date</div></div>
</div>`;
  return baseDocument({ title: `Delivery Note ${d.number}`, body, extraCss: brandCss(b) });
}

// --- Tax invoice -------------------------------------------------------------

export interface InvoiceTemplateData {
  number: string; invoiceDate: string; dueDate: string; poNumber: string | null; currency: string;
  subtotal: string | number; taxTotal: string | number; grandTotal: string | number;
  vendor: VendorParty; printedIban: string; printedBankName: string; lines: MoneyLine[];
}

export function renderInvoiceHtml(d: InvoiceTemplateData): string {
  const b = vendorBrand(d.vendor.code ?? d.vendor.taxId);
  const body = `
${vendorHeader(d.vendor, "TAX INVOICE", "فاتورة ضريبية", [["Invoice No.", "رقم الفاتورة", d.number], ["Date", "التاريخ", d.invoiceDate], ["Due date", "تاريخ الاستحقاق", d.dueDate], ["PO ref.", "أمر الشراء", d.poNumber ?? "—"]])}
<div class="meta">
  ${billTo("")}
  <div class="box"><h3>Remit to <span class="ar">الدفع إلى</span></h3>
    <div class="kv">
      <div>Bank</div><div>${esc(d.printedBankName)}</div>
      <div>IBAN</div><div id="invoice-iban">${esc(formatIban(d.printedIban))}</div>
      ${d.vendor.swift ? `<div>SWIFT</div><div>${esc(d.vendor.swift)}</div>` : ""}
      <div>Beneficiary</div><div>${esc(d.vendor.name)}</div>
      <div>Currency</div><div>${esc(d.currency)}</div>
    </div>
  </div>
</div>
${linesTable(d.lines, { showTaxRate: true, showDiscount: true })}
${totalsTable(d.currency, d.subtotal, d.taxTotal, d.grandTotal, "invoice-grand-total")}
<div class="foot">
  <div><h4>Payment terms <span class="ar">شروط الدفع</span></h4><p class="small">Please quote invoice number ${esc(d.number)} on your remittance. Late payments may incur charges as per contract.</p><div class="stamp">TAX INVOICE</div></div>
  <div><h4>Authorised by <span class="ar">اعتماد</span></h4><div class="sig">${esc(d.vendor.contactName ?? "Accounts Receivable")}, ${esc(d.vendor.name)}</div></div>
</div>`;
  return baseDocument({ title: `Tax Invoice ${d.number}`, body, extraCss: brandCss(b) });
}

// --- Receipt -------------------------------------------------------------

export interface ReceiptTemplateData {
  number: string; receiptDate: string; amount: string | number; currency: string; invoiceNumber: string; paymentReference: string; method: string; vendor: VendorParty;
}

export function renderReceiptHtml(d: ReceiptTemplateData): string {
  const b = vendorBrand(d.vendor.code ?? d.vendor.taxId);
  const body = `
${vendorHeader(d.vendor, "PAYMENT RECEIPT", "سند قبض", [["Receipt No.", "رقم السند", d.number], ["Date", "التاريخ", d.receiptDate]])}
<div class="meta" style="grid-template-columns:1fr">
  <div class="box">
    <h3>Received from <span class="ar">استلمنا من</span></h3>
    <div><strong>${esc(COMPANY.name)}</strong> <span class="ar" dir="rtl">${esc(COMPANY.nameAr)}</span></div>
    <div class="kv" style="margin-top:6pt">
      <div>Amount</div><div id="receipt-amount"><strong>${fmtNumber(d.amount)} ${esc(d.currency)}</strong></div>
      <div>In settlement of</div><div>Invoice ${esc(d.invoiceNumber)}</div>
      <div>Method</div><div>${esc(d.method.replace(/_/g, " "))}</div>
      <div>Reference</div><div>${esc(d.paymentReference)}</div>
    </div>
    <div class="stamp">PAID · مدفوع</div>
  </div>
</div>
<div class="foot">
  <div></div>
  <div><h4>Received by <span class="ar">المستلم</span></h4><div class="sig">${esc(d.vendor.contactName ?? "Accounts")}, ${esc(d.vendor.name)}</div></div>
</div>`;
  return baseDocument({ title: `Receipt ${d.number}`, body, extraCss: brandCss(b) });
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
.grid .l { color: #444; } .grid .la { text-align: right; color: #444; }
.grid .v { font-weight: 600; }
.seal { position: absolute; right: 22pt; bottom: 22pt; width: 34mm; height: 34mm; border: 2px solid ${colour}; border-radius: 50%; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 7.5pt; color: ${colour}; opacity: 0.75; transform: rotate(-12deg); line-height: 1.2; }
.validity { margin-top: 14pt; font-size: 10pt; }
.qr { position: absolute; left: 22pt; bottom: 22pt; width: 22mm; height: 22mm; background: repeating-linear-gradient(90deg, #222 0 2pt, #fff 2pt 4pt), repeating-linear-gradient(0deg, #222 0 2pt, #fff 2pt 4pt); background-blend-mode: multiply; opacity: 0.8; }
`;
  const rows = Object.entries(d.attributes)
    .map(([k, v]) => {
      const [l, la] = ATTRIBUTE_LABELS[k] ?? [k, ""];
      return `<div class="l">${esc(l)}</div><div class="v">${esc(v)}</div><div class="la ar" dir="rtl">${esc(la)}</div>`;
    })
    .join("");
  const body = `
<div class="cert">
  <div class="issuer"><div class="en">${esc(d.issuer)}</div><div class="ar" dir="rtl">${esc(issuerAr(d.kind, d.vendor.city))}</div></div>
  <h2>${esc(title)}</h2><div class="h2ar ar" dir="rtl">${esc(titleAr)}</div>
  <div class="no">No. <strong id="doc-number">${esc(d.number)}</strong></div>
  <div class="grid">
    <div class="l">Name</div><div class="v">${esc(d.vendor.name)}</div><div class="la ar" dir="rtl">الاسم</div>
    <div class="l">Arabic name</div><div class="v ar" dir="rtl" style="text-align:left">${esc(d.vendor.nameAr ?? "")}</div><div class="la ar" dir="rtl">الاسم العربي</div>
    <div class="l">Address</div><div class="v">${esc(d.vendor.addressLine)}, ${esc(d.vendor.city)}, ${esc(d.vendor.country)}</div><div class="la ar" dir="rtl">العنوان</div>
    ${d.kind !== "vendor_licence" ? `<div class="l">CR No.</div><div class="v">${esc(d.vendor.crNumber)}</div><div class="la ar" dir="rtl">السجل التجاري</div>` : ""}
    ${d.kind !== "vendor_tax_card" ? `<div class="l">Tax ID</div><div class="v">${esc(d.vendor.taxId)}</div><div class="la ar" dir="rtl">الرقم الضريبي</div>` : ""}
    ${rows}
  </div>
  <div class="validity grid">
    <div class="l">Issued</div><div class="v" id="doc-issued">${esc(d.issuedDate)}</div><div class="la ar" dir="rtl">تاريخ الإصدار</div>
    <div class="l">Valid until</div><div class="v" id="doc-expiry">${esc(d.expiryDate)}</div><div class="la ar" dir="rtl">صالح حتى</div>
  </div>
  <div class="qr" aria-hidden="true"></div>
  <div class="seal">${esc(d.issuer)}<br>OFFICIAL SEAL<br>ختم رسمي</div>
</div>`;
  return baseDocument({ title: `${title} ${d.number}`, body, extraCss: css });
}

function issuerAr(kind: VendorComplianceTemplateData["kind"], city: string): string {
  switch (kind) {
    case "vendor_licence": return "وزارة التجارة";
    case "vendor_tax_card": return "هيئة الضرائب والجمارك";
    case "vendor_bank_letter": return "إدارة الحسابات المؤسسية";
    case "vendor_trade_licence": return `بلدية ${city}`;
  }
}
