"use server";

import { redirect } from "next/navigation";
import { requireLab } from "@/lib/auth/server";
import { approvePurchaseOrder, createPurchaseOrder, type PoLineInput } from "@/lib/services/purchase-orders";
import { failedState, formValues, num, str, type FormState } from "@/lib/forms";
import type { Violation } from "@/lib/validation/engine";
import { PO_FORM_MAX_LINES } from "./constants";

/**
 * Move `lines[i]` violations from document line numbers onto form row numbers.
 *
 * The rules see the order as it will be stored — blank rows dropped, the rest
 * renumbered from one — so a fault on the second line of a three-line order is
 * reported as `lines[2]`. The form, though, has to light up the row the
 * participant typed it on, and the two only coincide when there is no blank row
 * above it.
 */
function onFormRows(violations: Violation[], rowOfLine: number[]): Violation[] {
  return violations.map((v) => {
    const m = /^lines\[(\d+)\]\.(.+)$/.exec(v.field ?? "");
    const row = m ? rowOfLine[Number(m[1]) - 1] : undefined;
    return row ? { ...v, field: `lines[${row}].${m![2]}` } : v;
  });
}

export async function createPurchaseOrderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireLab();
  const values = formValues(formData);
  const lines: PoLineInput[] = [];
  // The form row each line came from, for onFormRows below. Every row up to the
  // cap is read, whatever the form rendered: a bot is free to post `line9*`
  // without clicking "add line" first.
  const rowOfLine: number[] = [];
  for (let n = 1; n <= PO_FORM_MAX_LINES; n++) {
    const itemCode = str(values, `line${n}ItemCode`).toUpperCase();
    if (!itemCode) continue;
    const unitPrice = num(values, `line${n}UnitPrice`, NaN);
    rowOfLine.push(n);
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
  if (!result.ok) return failedState(onFormRows(result.violations, rowOfLine), values);
  redirect(`/purchase-orders/${encodeURIComponent(result.number)}?created=1`);
}

export async function approvePurchaseOrderAction(formData: FormData): Promise<void> {
  const session = await requireLab();
  const number = String(formData.get("number") ?? "");
  const result = await approvePurchaseOrder(session, number);
  redirect(`/purchase-orders/${encodeURIComponent(number)}${result.ok ? "?approved=1" : ""}`);
}
