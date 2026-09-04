/**
 * Document service: builds template data from rows, renders, stores.
 * Runs inside jobs, so it uses the raw client scoped by the document's own
 * tenant id rather than a request principal.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { blobStore, documentBlobKey } from "../blob";
import { renderHtmlToPdf } from "./renderer";
import { renderPurchaseOrderHtml, type PoTemplateData } from "./templates/purchase-order";
import { ensureSharedTenant } from "../corpus/persist";

export function documentFilename(number: string, vendorName: string, ext = "pdf"): string {
  const slug = vendorName
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toUpperCase()
    .slice(0, 40)
    .replace(/-+$/, "");
  return `${number}_${slug || "VENDOR"}.${ext}`;
}

export async function loadPurchaseOrderTemplateData(purchaseOrderId: string, tenantIds: string[]): Promise<PoTemplateData> {
  const [po] = await db
    .select()
    .from(schema.purchaseOrders)
    .where(and(eq(schema.purchaseOrders.id, purchaseOrderId), inArray(schema.purchaseOrders.tenantId, tenantIds)));
  if (!po) throw new Error(`Purchase order ${purchaseOrderId} not found`);
  const [vendor] = await db.select().from(schema.vendors).where(eq(schema.vendors.id, po.vendorId));
  if (!vendor) throw new Error(`Vendor ${po.vendorId} missing for PO ${po.number}`);
  const lines = await db
    .select({ line: schema.purchaseOrderLines, item: schema.items })
    .from(schema.purchaseOrderLines)
    .leftJoin(schema.items, eq(schema.items.id, schema.purchaseOrderLines.itemId))
    .where(eq(schema.purchaseOrderLines.purchaseOrderId, po.id))
    .orderBy(asc(schema.purchaseOrderLines.lineNo));
  const empIds = [po.buyerId, po.requesterId, po.approverId].filter(Boolean) as string[];
  const emps = empIds.length ? await db.select().from(schema.employees).where(inArray(schema.employees.id, empIds)) : [];
  const emp = (id: string | null) => emps.find((e) => e.id === id) ?? null;
  const [cc] = po.costCenterId ? await db.select().from(schema.costCenters).where(eq(schema.costCenters.id, po.costCenterId)) : [];
  const [dl] = po.deliveryLocationId ? await db.select().from(schema.deliveryLocations).where(eq(schema.deliveryLocations.id, po.deliveryLocationId)) : [];
  const buyer = emp(po.buyerId);
  return {
    number: po.number,
    orderDate: po.orderDate,
    expectedDeliveryDate: po.expectedDeliveryDate,
    currency: po.currency,
    paymentTermsDays: po.paymentTermsDays,
    status: po.status,
    notes: po.notes,
    subtotal: po.subtotal,
    taxTotal: po.taxTotal,
    grandTotal: po.grandTotal,
    vendor: {
      code: vendor.code, name: vendor.name, nameAr: vendor.nameAr, addressLine: vendor.addressLine, city: vendor.city, country: vendor.country,
      taxId: vendor.taxId, crNumber: vendor.crNumber, iban: vendor.iban, bankName: vendor.bankName, contactName: vendor.contactName, email: vendor.email, phone: vendor.phone,
    },
    buyer: buyer ? { name: buyer.name, email: buyer.email } : null,
    requester: emp(po.requesterId) ? { name: emp(po.requesterId)!.name } : null,
    approver: emp(po.approverId) ? { name: emp(po.approverId)!.name } : null,
    costCenter: cc ? { code: cc.code, name: cc.name } : null,
    deliveryLocation: dl ? { code: dl.code, name: dl.name, addressLine: dl.addressLine, city: dl.city } : null,
    lines: lines.map(({ line, item }) => ({
      lineNo: line.lineNo,
      itemCode: item?.code ?? null,
      description: line.description,
      descriptionAr: item?.nameAr ?? null,
      quantity: line.quantity,
      uom: line.uom,
      unitPrice: line.unitPrice,
      discountPct: line.discountPct,
      taxCode: line.taxCode,
      taxAmount: line.taxAmount,
      lineTotal: line.lineTotal,
    })),
  };
}

/** Render level-1 (native text) PDF for a document and record the file. Idempotent per (document, level). */
export async function renderDocument(documentId: string, log: (m: string) => void = () => {}, level = 1): Promise<void> {
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, documentId));
  if (!doc) throw new Error(`Document ${documentId} not found`);
  const shared = await ensureSharedTenant();
  let html: string;
  let vendorName = "VENDOR";
  switch (doc.kind) {
    case "purchase_order": {
      const data = await loadPurchaseOrderTemplateData(doc.sourceId, [doc.tenantId, shared]);
      vendorName = data.vendor.name;
      html = renderPurchaseOrderHtml(data);
      break;
    }
    default:
      throw new Error(`No template for document kind ${doc.kind} yet`);
  }
  const { pdf, pages } = await renderHtmlToPdf(html);
  const key = documentBlobKey(doc.tenantId, doc.id, level);
  const { size } = await blobStore().put(key, pdf, "application/pdf");
  const filename = documentFilename(doc.number, vendorName);
  await db
    .insert(schema.documentFiles)
    .values({ tenantId: doc.tenantId, documentId: doc.id, level, mime: "application/pdf", pages, blobKey: key, sizeBytes: size, filename })
    .onConflictDoUpdate({
      target: [schema.documentFiles.documentId, schema.documentFiles.level],
      set: { pages, blobKey: key, sizeBytes: size, filename, renderedAt: new Date() },
    });
  log(`rendered ${doc.kind} ${doc.number} L${level} (${pages}p, ${size} bytes)`);
}
