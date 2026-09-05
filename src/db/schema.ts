/**
 * Automation Lab — database schema.
 *
 * Every business table carries `tenant_id`. There are two kinds of tenant:
 *   - the single `shared` tenant holding the read-only corpus (vendors, items,
 *     employees, history) that every student sees, and
 *   - one `student` tenant per user holding their active working set.
 *
 * Application code never touches these tables directly; it goes through
 * `TenantDb` in ./tenant.ts, which injects the tenant guard on every query.
 */
import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
  index,
  bigint,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Tenancy and identity
// ---------------------------------------------------------------------------

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    kind: text("kind", { enum: ["shared", "student"] }).notNull(),
    ownerUserId: text("owner_user_id"),
    /** Deterministic seed. Student tenants derive it from the user id. */
    seed: bigint("seed", { mode: "number" }).notNull(),
    status: text("status", { enum: ["provisioning", "ready", "archived", "failed"] })
      .notNull()
      .default("provisioning"),
    /** 0..100 while provisioning; drives the progress bar on the dashboard. */
    progress: integer("progress").notNull().default(0),
    statusMessage: text("status_message"),
    resetCount: integer("reset_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    provisionedAt: timestamp("provisioned_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("tenants_slug_uq").on(t.slug), index("tenants_owner_idx").on(t.ownerUserId)],
);

/** Users as seen by the lab. The identity provider is the source of truth; this is a mirror. */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  roles: jsonb("roles").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  providerId: text("provider_id").notNull(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Master data
// ---------------------------------------------------------------------------

const tenantId = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" });

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    nameAr: text("name_ar"),
    legalForm: text("legal_form").notNull(),
    category: text("category").notNull(),
    /** Commercial registration number (10 digits, mod-11 check). */
    crNumber: text("cr_number").notNull(),
    crExpiry: date("cr_expiry").notNull(),
    /** Tax registration number (15 digits, Luhn check). */
    taxId: text("tax_id").notNull(),
    taxCertExpiry: date("tax_cert_expiry").notNull(),
    iban: text("iban").notNull(),
    bankName: text("bank_name").notNull(),
    swift: text("swift").notNull(),
    currency: text("currency").notNull(),
    paymentTermsDays: integer("payment_terms_days").notNull(),
    contactName: text("contact_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    addressLine: text("address_line").notNull(),
    city: text("city").notNull(),
    country: text("country").notNull(),
    rating: integer("rating").notNull(),
    blacklisted: boolean("blacklisted").notNull().default(false),
    status: text("status", { enum: ["active", "pending", "blocked"] }).notNull().default("active"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("vendors_tenant_code_uq").on(t.tenantId, t.code),
    index("vendors_tenant_name_idx").on(t.tenantId, t.name),
  ],
);

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    nameAr: text("name_ar"),
    category: text("category").notNull(),
    uom: text("uom").notNull(),
    taxCode: text("tax_code").notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 4 }).notNull(),
    currency: text("currency").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [uniqueIndex("items_tenant_code_uq").on(t.tenantId, t.code)],
);

export const itemPriceHistory = pgTable(
  "item_price_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    effectiveFrom: date("effective_from").notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 4 }).notNull(),
  },
  (t) => [index("item_price_history_item_idx").on(t.itemId, t.effectiveFrom)],
);

export const costCenters = pgTable(
  "cost_centers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    nameAr: text("name_ar"),
  },
  (t) => [uniqueIndex("cost_centers_tenant_code_uq").on(t.tenantId, t.code)],
);

export const glAccounts = pgTable(
  "gl_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type", { enum: ["expense", "asset", "liability", "revenue", "equity"] }).notNull(),
  },
  (t) => [uniqueIndex("gl_accounts_tenant_code_uq").on(t.tenantId, t.code)],
);

export const deliveryLocations = pgTable(
  "delivery_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    addressLine: text("address_line").notNull(),
    city: text("city").notNull(),
  },
  (t) => [uniqueIndex("delivery_locations_tenant_code_uq").on(t.tenantId, t.code)],
);

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: text("role", { enum: ["requester", "buyer", "approver", "warehouse", "ap_clerk"] }).notNull(),
    approvalLimit: numeric("approval_limit", { precision: 14, scale: 2 }),
    costCenterId: uuid("cost_center_id").references(() => costCenters.id),
  },
  (t) => [uniqueIndex("employees_tenant_code_uq").on(t.tenantId, t.code)],
);

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export const PO_STATUSES = [
  "draft",
  "approved",
  "sent",
  "partially_received",
  "received",
  "closed",
  "cancelled",
] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    number: text("number").notNull(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    buyerId: uuid("buyer_id").references(() => employees.id),
    requesterId: uuid("requester_id").references(() => employees.id),
    approverId: uuid("approver_id").references(() => employees.id),
    costCenterId: uuid("cost_center_id").references(() => costCenters.id),
    deliveryLocationId: uuid("delivery_location_id").references(() => deliveryLocations.id),
    currency: text("currency").notNull(),
    orderDate: date("order_date").notNull(),
    expectedDeliveryDate: date("expected_delivery_date").notNull(),
    paymentTermsDays: integer("payment_terms_days").notNull(),
    status: text("status", { enum: PO_STATUSES }).notNull().default("draft"),
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
    taxTotal: numeric("tax_total", { precision: 14, scale: 2 }).notNull(),
    grandTotal: numeric("grand_total", { precision: 14, scale: 2 }).notNull(),
    notes: text("notes"),
    /** True for rows from the shared corpus' three-year history: no PDFs are rendered. */
    historical: boolean("historical").notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("purchase_orders_tenant_number_uq").on(t.tenantId, t.number),
    index("purchase_orders_tenant_status_idx").on(t.tenantId, t.status),
    index("purchase_orders_tenant_vendor_idx").on(t.tenantId, t.vendorId),
  ],
);

export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id").references(() => items.id),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    uom: text("uom").notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 4 }).notNull(),
    discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).notNull().default("0"),
    taxCode: text("tax_code").notNull(),
    taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull(),
    lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull(),
    glAccountId: uuid("gl_account_id").references(() => glAccounts.id),
  },
  (t) => [
    uniqueIndex("po_lines_po_line_uq").on(t.purchaseOrderId, t.lineNo),
    index("po_lines_tenant_idx").on(t.tenantId),
  ],
);

// ---------------------------------------------------------------------------
// Documents, files, ground truth
// ---------------------------------------------------------------------------

export const DOCUMENT_KINDS = [
  "purchase_order",
  "delivery_note",
  "grn",
  "invoice",
  "receipt",
  "quote",
  "vendor_licence",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    kind: text("kind", { enum: DOCUMENT_KINDS }).notNull(),
    /** Business number, e.g. PO-2026-00017. */
    number: text("number").notNull(),
    /** Row the document was rendered from (purchase_orders.id for a PO). */
    sourceId: uuid("source_id").notNull(),
    vendorId: uuid("vendor_id").references(() => vendors.id),
    language: text("language", { enum: ["en", "ar", "bilingual"] }).notNull().default("bilingual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("documents_tenant_kind_number_uq").on(t.tenantId, t.kind, t.number),
    index("documents_tenant_source_idx").on(t.tenantId, t.sourceId),
  ],
);

export const documentFiles = pgTable(
  "document_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    /** Difficulty level 1..5. P0 renders level 1 only. */
    level: integer("level").notNull().default(1),
    mime: text("mime").notNull(),
    pages: integer("pages").notNull().default(1),
    blobKey: text("blob_key").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    filename: text("filename").notNull(),
    renderedAt: timestamp("rendered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("document_files_doc_level_uq").on(t.documentId, t.level)],
);

export const groundTruth = pgTable(
  "ground_truth",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    /** Dotted field path, e.g. `vendor.taxId` or `lines[2].quantity`. */
    field: text("field").notNull(),
    value: text("value").notNull(),
    /** Normalised page-relative box {page,x,y,w,h} once layout capture lands (P1). */
    bbox: jsonb("bbox").$type<{ page: number; x: number; y: number; w: number; h: number } | null>(),
  },
  (t) => [uniqueIndex("ground_truth_doc_field_uq").on(t.documentId, t.field)],
);

export const seededDefects = pgTable(
  "seeded_defects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    defectType: text("defect_type").notNull(),
    severity: text("severity", { enum: ["warning", "error", "critical"] }).notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [index("seeded_defects_doc_idx").on(t.documentId)],
);

// ---------------------------------------------------------------------------
// Background jobs and audit
// ---------------------------------------------------------------------------

export const JOB_KINDS = ["provision_sandbox", "reset_sandbox", "render_document"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: JOB_KINDS }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    status: text("status", { enum: ["queued", "running", "done", "failed"] }).notNull().default("queued"),
    priority: integer("priority").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    error: text("error"),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("jobs_status_run_after_idx").on(t.status, t.runAfter, t.priority)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_tenant_at_idx").on(t.tenantId, t.at)],
);

/** Tables that carry a tenant_id and are safe to scope through TenantDb. */
export const tenantTables = {
  vendors,
  items,
  itemPriceHistory,
  costCenters,
  glAccounts,
  deliveryLocations,
  employees,
  purchaseOrders,
  purchaseOrderLines,
  documents,
  documentFiles,
  groundTruth,
  seededDefects,
} as const;

export type Vendor = typeof vendors.$inferSelect;
export type NewVendor = typeof vendors.$inferInsert;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Employee = typeof employees.$inferSelect;
export type CostCenter = typeof costCenters.$inferSelect;
export type GlAccount = typeof glAccounts.$inferSelect;
export type DeliveryLocation = typeof deliveryLocations.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type NewPurchaseOrder = typeof purchaseOrders.$inferInsert;
export type PurchaseOrderLine = typeof purchaseOrderLines.$inferSelect;
export type NewPurchaseOrderLine = typeof purchaseOrderLines.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type DocumentFile = typeof documentFiles.$inferSelect;
export type Tenant = typeof tenants.$inferSelect;
export type Job = typeof jobs.$inferSelect;
