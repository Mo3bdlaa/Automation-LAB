/**
 * Automation Lab — database schema.
 *
 * Every business table carries `tenant_id`. There are two kinds of tenant:
 *   - the single `shared` tenant holding the master data set — vendors, items,
 *     employees and the whole transaction set with its rendered documents —
 *     which every participant works on, and
 *   - one `student` tenant per participant holding only what they changed and
 *     what they created.
 *
 * A participant does not get a copy of the master set. They read it directly,
 * and a change to a master row is stored as a patch in `entity_overlays`,
 * applied on read for that participant alone. So a thousand participants share
 * one rendered corpus, and "reset my sandbox" is a delete of their own rows.
 *
 * Application code never touches these tables directly; it goes through
 * `TenantDb` in ./tenant.ts, which injects the tenant guard on every query and
 * resolves the overlay.
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
    /**
     * On the shared tenant: which build of the master set this is. Bumped every
     * time the transaction set is regenerated, so an event can swap the
     * documents and start a clean board without invalidating a certificate
     * already issued against the previous build. Meaningless on a participant.
     */
    datasetVersion: integer("dataset_version").notNull().default(1),
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

/**
 * Credentials for people who signed themselves up. The lab is a public
 * challenge, so registration is open: an email, a password and a display name.
 * Passwords are scrypt hashes with a per-account salt; nothing here is
 * reversible. `users` stays the application-side mirror of a principal.
 */
export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    /** Shown on the leaderboard instead of the display name, when set. */
    alias: text("alias"),
    /** The country or city a participant wants shown beside their name. */
    location: text("location"),
    roles: jsonb("roles").$type<string[]>().notNull().default(sql`'["student"]'::jsonb`),
    status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
    /**
     * Set when this account is a robot credential rather than a person: the
     * user id of the person it belongs to. UiPath has to type a username and a
     * password into the login form, and nobody should be putting their own
     * password in a workflow they share. The robot signs in as itself, works in
     * its owner's sandbox, and everything it does counts for the owner.
     */
    botOf: text("bot_of"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("accounts_email_uq").on(sql`lower(${t.email})`)],
);

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
    /** Which script this vendor prints its own documents in (P3). */
    documentLanguage: text("document_language", { enum: ["en", "ar", "bilingual"] }).notNull().default("bilingual"),
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
// Procurement cycle: RFQ -> quotes -> award -> PO -> delivery note -> GRN -> invoice -> payment
// ---------------------------------------------------------------------------

export const rfqs = pgTable(
  "rfqs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    number: text("number").notNull(),
    requesterId: uuid("requester_id").references(() => employees.id),
    buyerId: uuid("buyer_id").references(() => employees.id),
    costCenterId: uuid("cost_center_id").references(() => costCenters.id),
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date").notNull(),
    status: text("status", { enum: ["open", "quoted", "awarded", "cancelled"] }).notNull().default("open"),
    /** Filled when a quote is awarded and a PO is created from it. */
    purchaseOrderId: uuid("purchase_order_id"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("rfqs_tenant_number_uq").on(t.tenantId, t.number)],
);

export const rfqLines = pgTable(
  "rfq_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    rfqId: uuid("rfq_id")
      .notNull()
      .references(() => rfqs.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id").references(() => items.id),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    uom: text("uom").notNull(),
  },
  (t) => [uniqueIndex("rfq_lines_rfq_line_uq").on(t.rfqId, t.lineNo)],
);

export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    /** Vendor's own quotation number. */
    number: text("number").notNull(),
    rfqId: uuid("rfq_id")
      .notNull()
      .references(() => rfqs.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    quoteDate: date("quote_date").notNull(),
    validUntil: date("valid_until").notNull(),
    currency: text("currency").notNull(),
    paymentTermsDays: integer("payment_terms_days").notNull(),
    leadTimeDays: integer("lead_time_days").notNull(),
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
    taxTotal: numeric("tax_total", { precision: 14, scale: 2 }).notNull(),
    grandTotal: numeric("grand_total", { precision: 14, scale: 2 }).notNull(),
    status: text("status", { enum: ["received", "awarded", "rejected", "expired"] }).notNull().default("received"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("quotes_tenant_vendor_number_uq").on(t.tenantId, t.vendorId, t.number), index("quotes_rfq_idx").on(t.rfqId)],
);

export const quoteLines = pgTable(
  "quote_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id").references(() => items.id),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    uom: text("uom").notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 4 }).notNull(),
    taxCode: text("tax_code").notNull(),
    taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull(),
    lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull(),
  },
  (t) => [uniqueIndex("quote_lines_quote_line_uq").on(t.quoteId, t.lineNo)],
);

export const deliveryNotes = pgTable(
  "delivery_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    /** Vendor's delivery note number. */
    number: text("number").notNull(),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    deliveryDate: date("delivery_date").notNull(),
    deliveryLocationId: uuid("delivery_location_id").references(() => deliveryLocations.id),
    carrier: text("carrier"),
    vehicle: text("vehicle"),
    packages: integer("packages"),
    status: text("status", { enum: ["in_transit", "delivered", "received"] }).notNull().default("delivered"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("delivery_notes_tenant_vendor_number_uq").on(t.tenantId, t.vendorId, t.number), index("delivery_notes_po_idx").on(t.purchaseOrderId)],
);

export const deliveryNoteLines = pgTable(
  "delivery_note_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    deliveryNoteId: uuid("delivery_note_id")
      .notNull()
      .references(() => deliveryNotes.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    purchaseOrderLineId: uuid("purchase_order_line_id").references(() => purchaseOrderLines.id),
    itemId: uuid("item_id").references(() => items.id),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    uom: text("uom").notNull(),
  },
  (t) => [uniqueIndex("dn_lines_dn_line_uq").on(t.deliveryNoteId, t.lineNo)],
);

export const grns = pgTable(
  "grns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    number: text("number").notNull(),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    deliveryNoteId: uuid("delivery_note_id").references(() => deliveryNotes.id),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    receivedDate: date("received_date").notNull(),
    deliveryLocationId: uuid("delivery_location_id").references(() => deliveryLocations.id),
    receivedById: uuid("received_by_id").references(() => employees.id),
    status: text("status", { enum: ["posted", "cancelled"] }).notNull().default("posted"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("grns_tenant_number_uq").on(t.tenantId, t.number), index("grns_po_idx").on(t.purchaseOrderId)],
);

export const grnLines = pgTable(
  "grn_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    grnId: uuid("grn_id")
      .notNull()
      .references(() => grns.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    purchaseOrderLineId: uuid("purchase_order_line_id").references(() => purchaseOrderLines.id),
    itemId: uuid("item_id").references(() => items.id),
    description: text("description").notNull(),
    quantityReceived: numeric("quantity_received", { precision: 14, scale: 3 }).notNull(),
    quantityAccepted: numeric("quantity_accepted", { precision: 14, scale: 3 }).notNull(),
    quantityRejected: numeric("quantity_rejected", { precision: 14, scale: 3 }).notNull().default("0"),
    uom: text("uom").notNull(),
    rejectionReason: text("rejection_reason"),
  },
  (t) => [uniqueIndex("grn_lines_grn_line_uq").on(t.grnId, t.lineNo)],
);

export const INVOICE_STATUSES = ["pending_extraction", "extracted", "matched", "exception", "approved", "rejected", "paid"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    /** Vendor's invoice number as printed. */
    number: text("number").notNull(),
    /** Internal registration number for the AP queue: INV-YYYY-NNNNN. */
    internalNumber: text("internal_number").notNull(),
    /** Null when the invoice arrived without a PO (INV-NO-PO). */
    purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id, { onDelete: "set null" }),
    /** Null when the issuing vendor is not in the master (INV-VENDOR-MASTER). */
    vendorId: uuid("vendor_id").references(() => vendors.id),
    /** Vendor details as printed, kept even when the vendor is in the master so changes can be detected. */
    printedVendorName: text("printed_vendor_name").notNull(),
    printedVendorTaxId: text("printed_vendor_tax_id").notNull(),
    printedIban: text("printed_iban").notNull(),
    printedBankName: text("printed_bank_name").notNull(),
    printedPoNumber: text("printed_po_number"),
    invoiceDate: date("invoice_date").notNull(),
    dueDate: date("due_date").notNull(),
    currency: text("currency").notNull(),
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
    taxTotal: numeric("tax_total", { precision: 14, scale: 2 }).notNull(),
    grandTotal: numeric("grand_total", { precision: 14, scale: 2 }).notNull(),
    status: text("status", { enum: INVOICE_STATUSES }).notNull().default("pending_extraction"),
    receivedDate: date("received_date").notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("invoices_tenant_internal_uq").on(t.tenantId, t.internalNumber),
    index("invoices_tenant_status_idx").on(t.tenantId, t.status),
    index("invoices_tenant_vendor_number_idx").on(t.tenantId, t.vendorId, t.number),
  ],
);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    purchaseOrderLineId: uuid("purchase_order_line_id").references(() => purchaseOrderLines.id),
    itemId: uuid("item_id").references(() => items.id),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    uom: text("uom").notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 4 }).notNull(),
    discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).notNull().default("0"),
    taxCode: text("tax_code").notNull(),
    taxRate: numeric("tax_rate", { precision: 5, scale: 4 }).notNull(),
    taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull(),
    lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull(),
  },
  (t) => [uniqueIndex("invoice_lines_inv_line_uq").on(t.invoiceId, t.lineNo)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    number: text("number").notNull(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id").references(() => vendors.id),
    paidDate: date("paid_date").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    method: text("method", { enum: ["bank_transfer", "cheque"] }).notNull().default("bank_transfer"),
    reference: text("reference").notNull(),
    ibanPaidTo: text("iban_paid_to").notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("payments_tenant_number_uq").on(t.tenantId, t.number)],
);

export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    /** Vendor's receipt number. */
    number: text("number").notNull(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id").references(() => vendors.id),
    receiptDate: date("receipt_date").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("receipts_tenant_payment_uq").on(t.tenantId, t.paymentId)],
);

/** Vendor compliance documents (commercial licence, tax card, bank letter, trade licence). PDFs render on first download. */
export const vendorDocuments = pgTable(
  "vendor_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["vendor_licence", "vendor_tax_card", "vendor_bank_letter", "vendor_trade_licence"] }).notNull(),
    number: text("number").notNull(),
    issuedDate: date("issued_date").notNull(),
    expiryDate: date("expiry_date").notNull(),
    issuer: text("issuer").notNull(),
    /** Free-form attributes printed on the document (activities, capital, branch...). */
    attributes: jsonb("attributes").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [uniqueIndex("vendor_documents_vendor_kind_uq").on(t.vendorId, t.kind)],
);

/** A student's (or bot's) extraction of a document, scored against ground truth in P2. */
export const extractions = pgTable(
  "extractions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    source: text("source", { enum: ["ui", "api"] }).notNull().default("ui"),
    /** Difficulty level of the file the submission was read from (1..5). */
    level: integer("level").notNull().default(1),
    fields: jsonb("fields").$type<Record<string, string>>().notNull(),
    /** Optional per-field confidence from the extractor, used by the validation station. */
    confidence: jsonb("confidence").$type<Record<string, number>>(),
    /** Field-level score 0..1 once graded. */
    score: numeric("score", { precision: 5, scale: 4 }),
    fieldResults: jsonb("field_results").$type<Record<string, { expected: string; actual: string; match: boolean }>>(),
    matchResult: jsonb("match_result").$type<{
      ok: boolean;
      violations: { ruleId: string; severity: string; message: string; field?: string }[];
      /** Defect grade: which seeded defects the submission caught. */
      defects?: { caught: { defectType: string; ruleId: string }[]; missed: { defectType: string; ruleId: string }[]; falsePositives: string[] };
    }>(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("extractions_doc_idx").on(t.documentId)],
);

// ---------------------------------------------------------------------------
// Documents, files, ground truth
// ---------------------------------------------------------------------------

export const DOCUMENT_KINDS = [
  "rfq",
  "quote",
  "purchase_order",
  "delivery_note",
  "grn",
  "invoice",
  "receipt",
  "vendor_licence",
  "vendor_tax_card",
  "vendor_bank_letter",
  "vendor_trade_licence",
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
    // Uniqueness is by source row: vendor-assigned numbers can repeat across vendors, and the
    // duplicate-invoice defect repeats one on purpose. Invoice documents carry the internal AP number.
    uniqueIndex("documents_tenant_kind_source_uq").on(t.tenantId, t.kind, t.sourceId),
    index("documents_tenant_number_idx").on(t.tenantId, t.number),
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
    /**
     * Equally correct renderings of the same value: the Arabic form of a name a
     * document printed in Arabic, a date the vendor printed in another format.
     * A submission matching any of them is correct (P3).
     */
    alternates: jsonb("alternates").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  },
  (t) => [uniqueIndex("ground_truth_doc_field_uq").on(t.documentId, t.field)],
);

/**
 * Where a ground-truth field sits on the page, per difficulty level. Level 1 is
 * measured from the print layout; levels 2 to 5 are those boxes carried through
 * the degradation geometry, so a highlight lands on the right place on a scan.
 */
export const documentFieldBoxes = pgTable(
  "document_field_boxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    level: integer("level").notNull().default(1),
    field: text("field").notNull(),
    page: integer("page").notNull().default(1),
    /** Page-relative, 0..1 from the top-left corner. */
    x: numeric("x", { precision: 8, scale: 6 }).notNull(),
    y: numeric("y", { precision: 8, scale: 6 }).notNull(),
    w: numeric("w", { precision: 8, scale: 6 }).notNull(),
    h: numeric("h", { precision: 8, scale: 6 }).notNull(),
  },
  (t) => [uniqueIndex("document_field_boxes_uq").on(t.documentId, t.level, t.field), index("document_field_boxes_doc_idx").on(t.documentId)],
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
// P2: API access, work queues, webhooks
// ---------------------------------------------------------------------------

/**
 * Personal API tokens. Only the SHA-256 hash is stored; the plaintext is shown
 * once at creation. `prefix` is the visible part, so a student can tell tokens
 * apart without revealing the secret.
 */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("api_tokens_hash_uq").on(t.tokenHash), index("api_tokens_user_idx").on(t.userId)],
);

export const WORK_ITEM_QUEUES = ["invoices-pending", "pos-awaiting-invoice", "vendor-applications", "deliveries-awaiting-grn", "rfqs-open"] as const;
export type WorkItemQueue = (typeof WORK_ITEM_QUEUES)[number];
export const WORK_ITEM_STATUSES = ["new", "in_progress", "successful", "failed", "abandoned"] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

/**
 * Orchestrator-like queue items. They are materialised from the current domain
 * state on every dispatcher read and keyed by (tenant, queue, reference), so
 * re-running a dispatcher never creates duplicates.
 */
export const workItems = pgTable(
  "work_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    queue: text("queue", { enum: WORK_ITEM_QUEUES }).notNull(),
    /** Unique business key inside the queue, e.g. INV-2026-05012. */
    reference: text("reference").notNull(),
    specificContent: jsonb("specific_content").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    status: text("status", { enum: WORK_ITEM_STATUSES }).notNull().default("new"),
    priority: text("priority", { enum: ["low", "normal", "high"] }).notNull().default("normal"),
    attempts: integer("attempts").notNull().default(0),
    /** Set while a performer holds the item; expires so a crashed robot does not block the queue. */
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    leaseOwner: text("lease_owner"),
    deferUntil: timestamp("defer_until", { withTimezone: true }),
    lastError: text("last_error"),
    /** Business exception rule IDs recorded by the performer. */
    outcome: jsonb("outcome").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("work_items_tenant_queue_ref_uq").on(t.tenantId, t.queue, t.reference),
    index("work_items_tenant_queue_status_idx").on(t.tenantId, t.queue, t.status),
  ],
);

export const WEBHOOK_EVENTS = ["invoice.status_changed", "document.rendered", "sandbox.ready", "work_item.added"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    url: text("url").notNull(),
    /** Shared secret for the X-Automation-Lab-Signature HMAC header. */
    secret: text("secret").notNull(),
    events: jsonb("events").$type<WebhookEvent[]>().notNull().default(sql`'[]'::jsonb`),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("webhook_endpoints_tenant_idx").on(t.tenantId)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    event: text("event", { enum: WEBHOOK_EVENTS }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status", { enum: ["queued", "delivered", "failed"] }).notNull().default("queued"),
    responseCode: integer("response_code"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (t) => [index("webhook_deliveries_endpoint_idx").on(t.endpointId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Background jobs and audit
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// P5: the challenge - scenarios, scored runs, leaderboard, certificates
// ---------------------------------------------------------------------------

export const RUN_MODES = ["practice", "scored"] as const;
export type RunMode = (typeof RUN_MODES)[number];

export const RUN_STATUSES = ["running", "completed", "abandoned"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** How the work was done, which decides which leaderboard a run lands on. */
export const RUN_CHANNELS = ["ui", "api", "mixed"] as const;
export type RunChannel = (typeof RUN_CHANNELS)[number];

/** One scored attempt at one scenario. */
export const challengeRuns = pgTable(
  "challenge_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    userId: text("user_id").notNull(),
    /** Scenario slug from the code-defined catalogue. */
    scenario: text("scenario").notNull(),
    mode: text("mode", { enum: RUN_MODES }).notNull().default("practice"),
    channel: text("channel", { enum: RUN_CHANNELS }),
    status: text("status", { enum: RUN_STATUSES }).notNull().default("running"),
    /** Difficulty level the documents were served at. */
    level: integer("level").notNull().default(1),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    /**
     * The work in scope, snapshotted when the run started. Scoring a run later
     * must not be affected by anything that arrived afterwards.
     */
    targets: jsonb("targets").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    processedCount: integer("processed_count").notNull().default(0),
    /** Final mark out of 100. */
    score: numeric("score", { precision: 5, scale: 2 }),
    /** Points and detail per judging parameter. */
    breakdown: jsonb("breakdown").$type<{
      parameters: { key: string; label: string; points: number; max: number; detail: string }[];
      notes: string[];
    }>(),
    /** Opt in to appear on the public leaderboard. */
    publish: boolean("publish").notNull().default(false),
    /**
     * The build of the master set this run was worked against. Boards are per
     * build, so regenerating the documents starts a clean board and leaves
     * every certificate already issued meaning exactly what it meant.
     */
    datasetVersion: integer("dataset_version").notNull().default(1),
    /** Set when the run earns a certificate; the code is what /verify checks. */
    certificateCode: text("certificate_code"),
    certificateIssuedAt: timestamp("certificate_issued_at", { withTimezone: true }),
  },
  (t) => [
    index("challenge_runs_board_idx").on(t.scenario, t.status, t.score),
    index("challenge_runs_user_idx").on(t.userId, t.startedAt),
    uniqueIndex("challenge_runs_certificate_uq").on(t.certificateCode),
  ],
);

/**
 * Instructor-set knobs that apply to the whole lab rather than one sandbox.
 * Kept as one small key/value table so a new knob does not need a migration.
 */
export const labSettings = pgTable("lab_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const JOB_KINDS = ["provision_sandbox", "reset_sandbox", "render_document", "degrade_document", "deliver_webhook"] as const;
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

/**
 * One participant's change to a row of the shared master set.
 *
 * `patch` holds only the columns they changed, merged over the master row on
 * read. Storing the delta rather than a copy keeps every id stable, so the
 * lines, documents and ground truth hanging off a master row keep resolving
 * without being copied too.
 */
export const entityOverlays = pgTable(
  "entity_overlays",
  {
    tenantId: tenantId(),
    /** The SQL table the row lives in, e.g. "invoices". */
    entity: text("entity").notNull(),
    /** The master row's id. Ids are never rewritten, which is the point. */
    entityId: uuid("entity_id").notNull(),
    patch: jsonb("patch").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("entity_overlays_pk").on(t.tenantId, t.entity, t.entityId),
    index("entity_overlays_entity_idx").on(t.entity, t.entityId),
  ],
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
  rfqs,
  rfqLines,
  quotes,
  quoteLines,
  deliveryNotes,
  deliveryNoteLines,
  grns,
  grnLines,
  invoices,
  invoiceLines,
  payments,
  receipts,
  vendorDocuments,
  extractions,
  workItems,
  webhookEndpoints,
  webhookDeliveries,
  documents,
  documentFiles,
  documentFieldBoxes,
  groundTruth,
  seededDefects,
  challengeRuns,
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
export type Rfq = typeof rfqs.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type DeliveryNote = typeof deliveryNotes.$inferSelect;
export type Grn = typeof grns.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Receipt = typeof receipts.$inferSelect;
export type VendorDocument = typeof vendorDocuments.$inferSelect;
export type Extraction = typeof extractions.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
export type WorkItem = typeof workItems.$inferSelect;
export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type DocumentFile = typeof documentFiles.$inferSelect;
export type DocumentFieldBox = typeof documentFieldBoxes.$inferSelect;
export type GroundTruth = typeof groundTruth.$inferSelect;
export type LabSetting = typeof labSettings.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type ChallengeRun = typeof challengeRuns.$inferSelect;
export type Tenant = typeof tenants.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type EntityOverlay = typeof entityOverlays.$inferSelect;
