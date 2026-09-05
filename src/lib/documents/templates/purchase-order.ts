/**
 * Purchase order template. Bilingual (EN/AR) by design so Arabic shaping and
 * bidi are exercised from P0, even though Arabic-first templates land in P3.
 */
import { baseDocument, esc } from "./base";
import { COMPANY } from "../../generator/vocab";
import { TAX_CODES, fmtNumber } from "../../generator/money";
import { formatIban } from "../../generator/iban";

export interface PoTemplateData {
  number: string;
  orderDate: string;
  expectedDeliveryDate: string;
  currency: string;
  paymentTermsDays: number;
  status: string;
  notes: string | null;
  subtotal: string | number;
  taxTotal: string | number;
  grandTotal: string | number;
  vendor: {
    code: string; name: string; nameAr: string | null; addressLine: string; city: string; country: string;
    taxId: string; crNumber: string; iban: string; bankName: string; contactName: string; email: string; phone: string;
  };
  buyer: { name: string; email: string } | null;
  requester: { name: string } | null;
  approver: { name: string } | null;
  costCenter: { code: string; name: string } | null;
  deliveryLocation: { code: string; name: string; addressLine: string; city: string } | null;
  lines: {
    lineNo: number; itemCode: string | null; description: string; descriptionAr?: string | null;
    quantity: string | number; uom: string; unitPrice: string | number; discountPct: string | number;
    taxCode: string; taxAmount: string | number; lineTotal: string | number;
  }[];
}

const css = `
.head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1d3557; padding-bottom: 8pt; }
.brand h1 { margin: 0; font-size: 15pt; color: #1d3557; }
.brand .ar { font-size: 12.5pt; color: #1d3557; }
.brand p { margin: 2pt 0 0; font-size: 9pt; color: #444; }
.doc-title { text-align: right; }
.doc-title h2 { margin: 0; font-size: 18pt; letter-spacing: 0.04em; color: #1d3557; }
.doc-title .ar { font-size: 14pt; }
.doc-title table { margin-top: 4pt; margin-left: auto; border-collapse: collapse; font-size: 9.5pt; }
.doc-title td { padding: 1pt 4pt; }
.doc-title td:first-child { color: #555; text-align: right; }
.doc-title td:last-child { font-weight: 700; text-align: left; }
.parties { display: flex; gap: 12pt; margin-top: 10pt; }
.party { flex: 1; border: 1px solid #c9d2dc; border-radius: 3pt; padding: 6pt 8pt; font-size: 9.5pt; }
.party h3 { margin: 0 0 3pt; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.08em; color: #1d3557; }
.party h3 .ar { text-transform: none; letter-spacing: 0; font-weight: 400; color: #444; }
.party .strong { font-weight: 700; }
.party .ar-name { font-size: 10.5pt; }
.kv { display: grid; grid-template-columns: auto 1fr; column-gap: 8pt; row-gap: 1pt; }
.kv div:nth-child(odd) { color: #555; }
table.lines { width: 100%; border-collapse: collapse; margin-top: 12pt; font-size: 9.5pt; }
table.lines th { background: #1d3557; color: #fff; padding: 4pt 5pt; text-align: left; font-weight: 700; font-size: 8.5pt; }
table.lines th .ar { display: block; font-weight: 400; font-size: 8.5pt; }
table.lines td { padding: 4pt 5pt; border-bottom: 1px solid #dfe5ec; vertical-align: top; }
table.lines tr:nth-child(even) td { background: #f5f7fa; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.desc-ar { display: block; font-size: 9pt; color: #333; }
.totals { margin-top: 8pt; margin-left: auto; width: 62mm; border-collapse: collapse; font-size: 10pt; }
.totals td { padding: 3pt 5pt; }
.totals td:first-child { color: #444; }
.totals tr.grand td { font-weight: 700; font-size: 11.5pt; border-top: 2px solid #1d3557; color: #1d3557; }
.tax-note { font-size: 8.5pt; color: #555; margin-top: 4pt; }
.footer-grid { display: flex; gap: 12pt; margin-top: 14pt; font-size: 9pt; }
.footer-grid > div { flex: 1; }
.terms h4, .sig h4 { margin: 0 0 3pt; font-size: 9pt; color: #1d3557; }
.terms ol { margin: 0; padding-left: 14pt; }
.sig-box { border-top: 1px solid #333; margin-top: 26pt; padding-top: 2pt; color: #444; }
.status-pill { display: inline-block; font-size: 8pt; padding: 1pt 6pt; border-radius: 8pt; border: 1px solid #1d3557; color: #1d3557; text-transform: uppercase; letter-spacing: 0.06em; }
.notes { margin-top: 8pt; font-size: 9.5pt; border-left: 3px solid #c9d2dc; padding-left: 6pt; }
`;

function money(v: string | number) {
  return fmtNumber(v);
}

export function renderPurchaseOrderHtml(d: PoTemplateData): string {
  const lines = d.lines
    .map(
      (l) => `<tr>
  <td class="num">${l.lineNo}</td>
  <td>${esc(l.itemCode ?? "")}</td>
  <td>${esc(l.description)}${l.descriptionAr ? `<span class="desc-ar ar" dir="rtl">${esc(l.descriptionAr)}</span>` : ""}</td>
  <td class="num">${fmtNumber(l.quantity, "en-US", Number(l.quantity) % 1 === 0 ? 0 : 3)}</td>
  <td>${esc(l.uom)}</td>
  <td class="num">${money(l.unitPrice)}</td>
  <td class="num">${Number(l.discountPct) ? fmtNumber(l.discountPct, "en-US", 1) + "%" : "—"}</td>
  <td>${esc(l.taxCode)}</td>
  <td class="num">${money(l.taxAmount)}</td>
  <td class="num">${money(l.lineTotal)}</td>
</tr>`,
    )
    .join("\n");

  const taxCodesUsed = [...new Set(d.lines.map((l) => l.taxCode))].filter((c) => c in TAX_CODES) as (keyof typeof TAX_CODES)[];

  const body = `
<div class="head">
  <div class="brand">
    <h1>${esc(COMPANY.name)}</h1>
    <div class="ar" dir="rtl">${esc(COMPANY.nameAr)}</div>
    <p>${esc(COMPANY.addressLine)}, ${esc(COMPANY.city)} · ${esc(COMPANY.phone)} · ${esc(COMPANY.email)}</p>
    <p>CR ${esc(COMPANY.crNumber)} · Tax ID ${esc(COMPANY.taxId)}</p>
  </div>
  <div class="doc-title">
    <h2>PURCHASE ORDER</h2>
    <div class="ar" dir="rtl">أمر شراء</div>
    <table>
      <tr><td>PO No. <span class="ar">رقم الأمر</span></td><td id="po-number">${esc(d.number)}</td></tr>
      <tr><td>Date <span class="ar">التاريخ</span></td><td>${esc(d.orderDate)}</td></tr>
      <tr><td>Expected delivery <span class="ar">التسليم المتوقع</span></td><td>${esc(d.expectedDeliveryDate)}</td></tr>
      <tr><td>Currency <span class="ar">العملة</span></td><td>${esc(d.currency)}</td></tr>
      <tr><td>Status</td><td><span class="status-pill">${esc(d.status.replace(/_/g, " "))}</span></td></tr>
    </table>
  </div>
</div>

<div class="parties">
  <div class="party">
    <h3>Vendor <span class="ar">المورد</span></h3>
    <div class="strong">${esc(d.vendor.name)}</div>
    ${d.vendor.nameAr ? `<div class="ar ar-name" dir="rtl">${esc(d.vendor.nameAr)}</div>` : ""}
    <div>${esc(d.vendor.addressLine)}, ${esc(d.vendor.city)}, ${esc(d.vendor.country)}</div>
    <div class="kv" style="margin-top:4pt">
      <div>Vendor code</div><div>${esc(d.vendor.code)}</div>
      <div>Tax ID</div><div>${esc(d.vendor.taxId)}</div>
      <div>CR No.</div><div>${esc(d.vendor.crNumber)}</div>
      <div>Contact</div><div>${esc(d.vendor.contactName)} · ${esc(d.vendor.phone)}</div>
      <div>Email</div><div>${esc(d.vendor.email)}</div>
    </div>
  </div>
  <div class="party">
    <h3>Deliver to <span class="ar">التسليم إلى</span></h3>
    <div class="strong">${esc(COMPANY.name)}</div>
    ${d.deliveryLocation ? `<div>${esc(d.deliveryLocation.name)} (${esc(d.deliveryLocation.code)})</div><div>${esc(d.deliveryLocation.addressLine)}, ${esc(d.deliveryLocation.city)}</div>` : ""}
    <div class="kv" style="margin-top:4pt">
      <div>Buyer</div><div>${esc(d.buyer?.name ?? "—")}${d.buyer ? ` · ${esc(d.buyer.email)}` : ""}</div>
      <div>Requester</div><div>${esc(d.requester?.name ?? "—")}</div>
      <div>Approved by</div><div>${esc(d.approver?.name ?? "—")}</div>
      <div>Cost centre</div><div>${d.costCenter ? `${esc(d.costCenter.code)} ${esc(d.costCenter.name)}` : "—"}</div>
      <div>Payment terms</div><div>${d.paymentTermsDays === 0 ? "Due on receipt" : `Net ${d.paymentTermsDays} days`}</div>
    </div>
  </div>
</div>

<table class="lines">
  <thead>
    <tr>
      <th class="num">#</th>
      <th>Item<span class="ar">الصنف</span></th>
      <th>Description<span class="ar">الوصف</span></th>
      <th class="num">Qty<span class="ar">الكمية</span></th>
      <th>UoM<span class="ar">الوحدة</span></th>
      <th class="num">Unit price<span class="ar">سعر الوحدة</span></th>
      <th class="num">Disc.<span class="ar">خصم</span></th>
      <th>Tax<span class="ar">الضريبة</span></th>
      <th class="num">Tax amt<span class="ar">قيمة الضريبة</span></th>
      <th class="num">Line total<span class="ar">الإجمالي</span></th>
    </tr>
  </thead>
  <tbody>
${lines}
  </tbody>
</table>

<table class="totals">
  <tr><td>Subtotal <span class="ar">المجموع الفرعي</span></td><td class="num">${money(d.subtotal)}</td></tr>
  <tr><td>Tax <span class="ar">الضريبة</span></td><td class="num">${money(d.taxTotal)}</td></tr>
  <tr class="grand"><td>Total ${esc(d.currency)} <span class="ar">الإجمالي</span></td><td class="num" id="po-grand-total">${money(d.grandTotal)}</td></tr>
</table>
<div class="tax-note">Tax codes: ${taxCodesUsed.map((c) => `${c} = ${esc(TAX_CODES[c].label)} <span class="ar">${esc(TAX_CODES[c].labelAr)}</span>`).join(" · ")}</div>

${d.notes ? `<div class="notes"><strong>Notes:</strong> ${esc(d.notes)}</div>` : ""}

<div class="footer-grid">
  <div class="terms">
    <h4>Terms &amp; conditions <span class="ar">الشروط والأحكام</span></h4>
    <ol>
      <li>Quote this PO number on all delivery notes and invoices. Invoices without a PO number will be returned.</li>
      <li>Goods are subject to inspection at the delivery location. Over-deliveries will be rejected.</li>
      <li>Prices are fixed for the life of this order. Payment ${d.paymentTermsDays === 0 ? "on receipt of a valid invoice" : `net ${d.paymentTermsDays} days from receipt of a valid invoice`}.</li>
      <li>Remit-to bank details on file: ${esc(d.vendor.bankName)}, IBAN ${esc(formatIban(d.vendor.iban))}. Changes must be confirmed in writing by ${esc(COMPANY.shortName)} Procurement.</li>
    </ol>
  </div>
  <div class="sig">
    <h4>Authorised signature <span class="ar">التوقيع المعتمد</span></h4>
    <div class="sig-box">${esc(d.approver?.name ?? "")}, ${esc(COMPANY.shortName)} Procurement</div>
  </div>
</div>
`;

  return baseDocument({ title: `Purchase Order ${d.number}`, body, extraCss: css });
}
