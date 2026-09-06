"use server";

import { redirect } from "next/navigation";
import { requireLab } from "@/lib/auth/server";
import { approvePurchaseOrder, createPurchaseOrder, type PoLineInput } from "@/lib/services/purchase-orders";
import { failedState, formValues, num, str, type FormState } from "@/lib/forms";
import { PO_FORM_LINES } from "./constants";

export async function createPurchaseOrderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireLab();
  const values = formValues(formData);
  const lines: PoLineInput[] = [];
  for (let n = 1; n <= PO_FORM_LINES; n++) {
    const itemCode = str(values, `line${n}ItemCode`).toUpperCase();
    if (!itemCode) continue;
    const unitPrice = num(values, `line${n}UnitPrice`, NaN);
    lines.push({
      itemCode,
      quantity: num(values, `line${n}Quantity`, 0),
      unitPrice: Number.isNaN(unitPrice) ? undefined : unitPrice,
      discountPct: num(values, `line${n}DiscountPct`, 0),
      uom: str(values, `line${n}Uom`),
      taxCode: str(values, `line${n}TaxCode`),
    });
  }
  const result = await createPurchaseOrder(session, {
    vendorCode: str(values, "vendorCode"),
    orderDate: str(values, "orderDate"),
    expectedDeliveryDate: str(values, "expectedDeliveryDate"),
    buyerCode: str(values, "buyerCode"),
    requesterCode: str(values, "requesterCode"),
    approverCode: str(values, "approverCode"),
    costCenterCode: str(values, "costCenterCode"),
    deliveryLocationCode: str(values, "deliveryLocationCode"),
    notes: str(values, "notes"),
    lines,
  });
  if (!result.ok) return failedState(result.violations, values);
  redirect(`/purchase-orders/${encodeURIComponent(result.number)}?created=1`);
}

export async function approvePurchaseOrderAction(formData: FormData): Promise<void> {
  const session = await requireLab();
  const number = String(formData.get("number") ?? "");
  const result = await approvePurchaseOrder(session, number);
  redirect(`/purchase-orders/${encodeURIComponent(number)}${result.ok ? "?approved=1" : ""}`);
}
