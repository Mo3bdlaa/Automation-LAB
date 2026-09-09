/**
 * The master set is shared and a participant's change to it is a patch that
 * only they see. That claim is worth testing against a real database rather
 * than a mock, because the whole mechanism is one piece of SQL: a CTE that
 * shadows the table name so a filter binds to the merged row.
 *
 * Skipped when no database is reachable, so `pnpm test` still runs on a laptop
 * with no Postgres. CI applies the migrations before the tests and does run it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool, schema } from "./client";
import { forTenant, type TenantDb } from "./tenant";

const reachable = await db
  .execute(sql`select 1`)
  .then(() => true)
  .catch(() => false);

const suite = reachable ? describe : describe.skip;

suite("master set overlays", () => {
  const tag = `overlay-test-${Date.now()}`;
  let sharedId: string;
  let aliceId: string;
  let bobId: string;
  let invoiceId: string;
  let alice: TenantDb;
  let bob: TenantDb;

  const tenant = async (slug: string, kind: "shared" | "student") => {
    const [row] = await db.insert(schema.tenants).values({ slug, kind, seed: 1 }).returning();
    return row.id;
  };

  beforeAll(async () => {
    sharedId = await tenant(`${tag}-shared`, "shared");
    aliceId = await tenant(`${tag}-alice`, "student");
    bobId = await tenant(`${tag}-bob`, "student");
    alice = forTenant({ tenantId: aliceId, readableTenantIds: [aliceId, sharedId], sharedTenantId: sharedId });
    bob = forTenant({ tenantId: bobId, readableTenantIds: [bobId, sharedId], sharedTenantId: sharedId });

    const [invoice] = await db
      .insert(schema.invoices)
      .values({
        tenantId: sharedId,
        number: `${tag}-INV`,
        internalNumber: `${tag}-AP`,
        printedVendorName: "Master Vendor",
        printedVendorTaxId: "300000000000003",
        printedIban: "SA0000000000000000000000",
        printedBankName: "Master Bank",
        invoiceDate: "2026-01-01",
        dueDate: "2026-02-01",
        receivedDate: "2026-01-02",
        currency: "SAR",
        subtotal: "100.00",
        taxTotal: "15.00",
        grandTotal: "115.00",
      })
      .returning();
    invoiceId = invoice.id;
  });

  afterAll(async () => {
    await db.delete(schema.entityOverlays).where(inArray(schema.entityOverlays.tenantId, [aliceId, bobId]));
    await db.delete(schema.invoices).where(eq(schema.invoices.id, invoiceId));
    await db.delete(schema.tenants).where(inArray(schema.tenants.id, [sharedId, aliceId, bobId]));
    await pool.end();
  });

  it("shows the master row to everyone before anyone touches it", async () => {
    expect((await alice.one(schema.invoices, eq(schema.invoices.id, invoiceId)))?.status).toBe("pending_extraction");
    expect((await bob.one(schema.invoices, eq(schema.invoices.id, invoiceId)))?.status).toBe("pending_extraction");
  });

  it("records a change to a master row as a patch, leaving the row alone", async () => {
    await alice.update(schema.invoices, { status: "approved" }, eq(schema.invoices.id, invoiceId));

    const [raw] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId));
    expect(raw.status).toBe("pending_extraction");
    expect(raw.tenantId).toBe(sharedId);

    const overlays = await db.select().from(schema.entityOverlays).where(eq(schema.entityOverlays.tenantId, aliceId));
    expect(overlays).toHaveLength(1);
    expect(overlays[0].patch).toEqual({ status: "approved" });
  });

  it("reads the change back for its author and not for anyone else", async () => {
    expect((await alice.one(schema.invoices, eq(schema.invoices.id, invoiceId)))?.status).toBe("approved");
    expect((await bob.one(schema.invoices, eq(schema.invoices.id, invoiceId)))?.status).toBe("pending_extraction");
  });

  it("filters on the resolved value, not the master value", async () => {
    // The bug this guards against: an invoice you approved still coming back
    // from a query for pending invoices, because the filter hit the master row.
    const alicePending = await alice.list(schema.invoices, { where: eq(schema.invoices.status, "pending_extraction") });
    const bobPending = await bob.list(schema.invoices, { where: eq(schema.invoices.status, "pending_extraction") });
    expect(alicePending.map((r) => r.id)).not.toContain(invoiceId);
    expect(bobPending.map((r) => r.id)).toContain(invoiceId);

    const aliceApproved = await alice.list(schema.invoices, { where: eq(schema.invoices.status, "approved") });
    expect(aliceApproved.map((r) => r.id)).toContain(invoiceId);
    expect(aliceApproved.find((r) => r.id === invoiceId)?.number).toBe(`${tag}-INV`);
  });

  it("counts what it lists", async () => {
    expect(await alice.count(schema.invoices, eq(schema.invoices.status, "approved"))).toBe(1);
    expect(await bob.count(schema.invoices, eq(schema.invoices.status, "approved"))).toBe(0);
  });

  it("merges a second change instead of replacing the first", async () => {
    await alice.update(schema.invoices, { printedBankName: "Corrected Bank" }, eq(schema.invoices.id, invoiceId));
    const row = await alice.one(schema.invoices, eq(schema.invoices.id, invoiceId));
    expect(row?.status).toBe("approved");
    expect(row?.printedBankName).toBe("Corrected Bank");
  });

  it("treats a master row of an overlaid table as the participant's to change", async () => {
    const row = await alice.one(schema.invoices, eq(schema.invoices.id, invoiceId));
    expect(alice.isReadOnlyRow(schema.invoices, row!)).toBe(false);
    // The answer key is not: documents, ground truth and seeded defects stay read-only.
    expect(alice.isReadOnlyRow(schema.documents, { tenantId: sharedId })).toBe(true);
  });

  it("still updates a participant's own row in place, with no overlay", async () => {
    const [own] = await alice.insert(schema.invoices, {
      number: `${tag}-OWN`,
      internalNumber: `${tag}-OWN-AP`,
      printedVendorName: "Own Vendor",
      printedVendorTaxId: "300000000000004",
      printedIban: "SA1111111111111111111111",
      printedBankName: "Own Bank",
      invoiceDate: "2026-01-01",
      dueDate: "2026-02-01",
      receivedDate: "2026-01-02",
      currency: "SAR",
      subtotal: "10.00",
      taxTotal: "1.50",
      grandTotal: "11.50",
    });
    await alice.update(schema.invoices, { status: "paid" }, eq(schema.invoices.id, own.id));

    const [raw] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, own.id));
    expect(raw.status).toBe("paid");
    const overlays = await db
      .select()
      .from(schema.entityOverlays)
      .where(eq(schema.entityOverlays.entityId, own.id));
    expect(overlays).toHaveLength(0);

    await db.delete(schema.invoices).where(eq(schema.invoices.id, own.id));
  });
});
