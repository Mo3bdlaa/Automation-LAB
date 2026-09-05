/**
 * Documents issued by the company itself (besides the purchase order):
 * request for quotation and goods receipt note. Company letterhead.
 */
import { baseDocument, esc } from "./base";
import { COMPANY } from "../../generator/vocab";
import { fmtNumber } from "../../generator/money";

const css = `
.head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1d3557; padding-bottom: 8pt; }
.brand h1 { margin: 0; font-size: 15pt; color: #1d3557; } .brand .ar { font-size: 12.5pt; color: #1d3557; } .brand p { margin: 2pt 0 0; font-size: 9pt; color: #444; }
.doc-title { text-align: right; } .doc-title h2 { margin: 0; font-size: 18pt; letter-spacing: 0.04em; color: #1d3557; } .doc-title .ar { font-size: 14pt; }
.doc-title table { margin-top: 4pt; margin-left: auto; border-collapse: collapse; font-size: 9.5pt; } .doc-title td { padding: 1pt 4pt; } .doc-title td:first-child { color: #555; text-align: right; } .doc-title td:last-child { font-weight: 700; text-align: left; }
.parties { display: flex; gap: 12pt; margin-top: 10pt; } .party { flex: 1; border: 1px solid #c9d2dc; border-radius: 3pt; padding: 6pt 8pt; font-size: 9.5pt; }
.party h3 { margin: 0 0 3pt; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.08em; color: #1d3557; } .party h3 .ar { text-transform: none; letter-spacing: 0; font-weight: 400; color: #444; }
.kv { display: grid; grid-template-columns: auto 1fr; column-gap: 8pt; row-gap: 1pt; } .kv div:nth-child(odd) { color: #555; }
table.lines { width: 100%; border-collapse: collapse; margin-top: 12pt; font-size: 9.5pt; }
table.lines th { background: #1d3557; color: #fff; padding: 4pt 5pt; text-align: left; font-weight: 700; font-size: 8.5pt; } table.lines th .ar { display: block; font-weight: 400; }
table.lines td { padding: 4pt 5pt; border-bottom: 1px solid #dfe5ec; vertical-align: top; } table.lines tr:nth-child(even) td { background: #f5f7fa; }
.num { text-align: right; font-variant-numeric: tabular-nums; } .desc-ar { display: block; font-size: 9pt; color: #333; }
.foot { display: flex; gap: 12pt; margin-top: 14pt; font-size: 9pt; } .foot > div { flex: 1; } .foot h4 { margin: 0 0 3pt; font-size: 9pt; color: #1d3557; }
.sig { border-top: 1px solid #333; margin-top: 26pt; padding-top: 2pt; color: #444; }
.small { font-size: 8.5pt; color: #555; }
`;

function head(title: string, titleAr: string, right: [string, string, string][]): string {
  return `<div class="head">
  <div class="brand">
    <h1>${esc(COMPANY.name)}</h1><div class="ar" dir="rtl">${esc(COMPANY.nameAr)}</div>
    <p>${esc(COMPANY.addressLine)}, ${esc(COMPANY.city)} · ${esc(COMPANY.phone)} · ${esc(COMPANY.email)}</p>
    <p>CR ${esc(COMPANY.crNumber)} · Tax ID ${esc(COMPANY.taxId)}</p>
  </div>
  <div class="doc-title"><h2>${esc(title)}</h2><div class="ar" dir="rtl">${esc(titleAr)}</div>
    <table>${right.map(([l, la, v]) => `<tr><td>${esc(l)} <span class="ar">${esc(la)}</span></td><td>${esc(v)}</td></tr>`).join("")}</table>
  </div>
</div>`;
}

export interface RfqTemplateData {
  number: string; issueDate: string; dueDate: string; buyer: { name: string; email: string } | null; requester: { name: string } | null;
  costCenter: { code: string; name: string } | null; notes: string | null;
  lines: { lineNo: number; itemCode: string | null; description: string; descriptionAr?: string | null; quantity: string | number; uom: string }[];
}

export function renderRfqHtml(d: RfqTemplateData): string {
  const rows = d.lines.map((l) => `<tr><td class="num">${l.lineNo}</td><td>${esc(l.itemCode ?? "")}</td><td>${esc(l.description)}${l.descriptionAr ? `<span class="desc-ar ar" dir="rtl">${esc(l.descriptionAr)}</span>` : ""}</td><td class="num">${fmtNumber(l.quantity, "en-US", 0)}</td><td>${esc(l.uom)}</td><td style="width:28mm"></td><td style="width:28mm"></td></tr>`).join("");
  const body = `
${head("REQUEST FOR QUOTATION", "طلب عرض سعر", [["RFQ No.", "رقم الطلب", d.number], ["Issue date", "تاريخ الإصدار", d.issueDate], ["Quotes due", "آخر موعد", d.dueDate]])}
<div class="parties">
  <div class="party"><h3>Buyer contact <span class="ar">جهة الاتصال</span></h3><div>${esc(d.buyer?.name ?? "Procurement")}</div><div>${esc(d.buyer?.email ?? COMPANY.email)}</div><div>Requested by: ${esc(d.requester?.name ?? "—")}</div></div>
  <div class="party"><h3>Instructions <span class="ar">التعليمات</span></h3><div class="small">Quote all lines in ${esc(COMPANY.currency)} including VAT, state lead time and validity, and reference this RFQ number. Partial quotes are accepted.</div>${d.costCenter ? `<div class="small">Cost centre ${esc(d.costCenter.code)} ${esc(d.costCenter.name)}</div>` : ""}</div>
</div>
<table class="lines"><thead><tr><th class="num">#</th><th>Item<span class="ar">الصنف</span></th><th>Description<span class="ar">الوصف</span></th><th class="num">Qty<span class="ar">الكمية</span></th><th>UoM<span class="ar">الوحدة</span></th><th>Unit price<span class="ar">سعر الوحدة</span></th><th>Lead time<span class="ar">مدة التوريد</span></th></tr></thead><tbody>${rows}</tbody></table>
${d.notes ? `<p class="small">${esc(d.notes)}</p>` : ""}
<div class="foot"><div></div><div><h4>Issued by <span class="ar">صادر عن</span></h4><div class="sig">${esc(d.buyer?.name ?? "Procurement")}, ${esc(COMPANY.shortName)} Procurement</div></div></div>`;
  return baseDocument({ title: `RFQ ${d.number}`, body, extraCss: css });
}

export interface GrnTemplateData {
  number: string; poNumber: string; deliveryNoteNumber: string | null; receivedDate: string; vendorName: string; vendorCode: string;
  location: { code: string; name: string } | null; receivedBy: { name: string } | null; notes: string | null;
  lines: { lineNo: number; poLineNo: number | null; itemCode: string | null; description: string; descriptionAr?: string | null; quantityReceived: string | number; quantityAccepted: string | number; quantityRejected: string | number; uom: string; rejectionReason: string | null }[];
}

export function renderGrnHtml(d: GrnTemplateData): string {
  const q = (v: string | number) => fmtNumber(v, "en-US", Number(v) % 1 === 0 ? 0 : 3);
  const rows = d.lines.map((l) => `<tr><td class="num">${l.lineNo}</td><td>${l.poLineNo ?? ""}</td><td>${esc(l.itemCode ?? "")}</td><td>${esc(l.description)}${l.descriptionAr ? `<span class="desc-ar ar" dir="rtl">${esc(l.descriptionAr)}</span>` : ""}</td><td class="num">${q(l.quantityReceived)}</td><td class="num">${q(l.quantityAccepted)}</td><td class="num">${q(l.quantityRejected)}</td><td>${esc(l.uom)}</td><td>${esc(l.rejectionReason ?? "")}</td></tr>`).join("");
  const body = `
${head("GOODS RECEIPT NOTE", "إشعار استلام بضاعة", [["GRN No.", "رقم الإشعار", d.number], ["Received", "تاريخ الاستلام", d.receivedDate], ["PO", "أمر الشراء", d.poNumber], ["Vendor DN", "إشعار التسليم", d.deliveryNoteNumber ?? "—"]])}
<div class="parties">
  <div class="party"><h3>Vendor <span class="ar">المورد</span></h3><div><strong>${esc(d.vendorName)}</strong></div><div>${esc(d.vendorCode)}</div></div>
  <div class="party"><h3>Receiving <span class="ar">الاستلام</span></h3><div class="kv"><div>Location</div><div>${d.location ? `${esc(d.location.code)} · ${esc(d.location.name)}` : "—"}</div><div>Received by</div><div>${esc(d.receivedBy?.name ?? "—")}</div></div></div>
</div>
<table class="lines"><thead><tr><th class="num">#</th><th>PO line</th><th>Item<span class="ar">الصنف</span></th><th>Description<span class="ar">الوصف</span></th><th class="num">Received<span class="ar">المستلم</span></th><th class="num">Accepted<span class="ar">المقبول</span></th><th class="num">Rejected<span class="ar">المرفوض</span></th><th>UoM</th><th>Reason<span class="ar">السبب</span></th></tr></thead><tbody>${rows}</tbody></table>
${d.notes ? `<p class="small">Notes: ${esc(d.notes)}</p>` : ""}
<div class="foot"><div><h4>Warehouse <span class="ar">المستودع</span></h4><div class="sig">${esc(d.receivedBy?.name ?? "")}</div></div><div><h4>Quality check <span class="ar">فحص الجودة</span></h4><div class="sig">Name / signature</div></div></div>`;
  return baseDocument({ title: `GRN ${d.number}`, body, extraCss: css });
}
