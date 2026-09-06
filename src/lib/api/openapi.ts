/**
 * OpenAPI 3.1 description of the lab API.
 *
 * It is written by hand so the prose stays useful to students, and a test
 * (src/lib/api/openapi.test.ts) fails if a route file exists without a matching
 * path here, so the two cannot drift apart.
 */
import { INVOICE_STATUSES, PO_STATUSES, WEBHOOK_EVENTS, WORK_ITEM_QUEUES, WORK_ITEM_STATUSES } from "@/db/schema";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const jsonBody = (schema: unknown, required = true) => ({ required, content: { "application/json": { schema } } });
const jsonOk = (description: string, schema: unknown) => ({ description, content: { "application/json": { schema } } });

const listParams = [
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 }, description: "Page size." },
  { name: "cursor", in: "query", schema: { type: "string" }, description: "Opaque cursor from the previous response's page.nextCursor." },
];

const errorResponses = {
  "401": jsonOk("No credentials. Send a session cookie or an API token.", ref("Error")),
  "403": jsonOk("Authenticated but not allowed (no lab access, or a read-only record).", ref("Error")),
  "404": jsonOk("Not found.", ref("Error")),
  "409": jsonOk("The record is in a state that does not allow this action.", ref("Error")),
  "422": jsonOk("A business rule rejected the request. `violations` carries the rule IDs.", ref("ValidationError")),
};

export function openApiDocument(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Automation Lab API",
      version: "1.0.0",
      description: [
        "REST API for the Automation Lab practice sandbox.",
        "",
        "Authenticate with a personal API token: `Authorization: Bearer al_...`. Create one on the Sandbox page or with POST /api/tokens while signed in.",
        "",
        "Every request is scoped to your own sandbox. The shared corpus is readable but never writable.",
        "",
        "Business rules answer with 422 and a `violations` array whose `ruleId` values are stable: branch on those, never on message text. The same rules run on the web forms.",
        "",
        "Invoices pending extraction hide their printed values. Download the PDF, read it, and submit the result to POST /api/extractions.",
      ].join("\n"),
      contact: { name: "Automation Lab" },
    },
    servers: [{ url: origin, description: "This lab" }],
    security: [{ bearerAuth: [] }, { sessionCookie: [] }],
    tags: [
      { name: "Work queues", description: "Dispatcher and performer endpoints with Orchestrator-like semantics." },
      { name: "Invoices", description: "Extraction, three-way match and the accounts payable decisions." },
      { name: "Procurement", description: "Requests for quotation, purchase orders, deliveries and goods receipts." },
      { name: "Master data", description: "Vendors and catalogue items." },
      { name: "Documents", description: "Generated PDFs and their metadata." },
      { name: "Account", description: "Identity, sandbox status, tokens and webhooks." },
    ],
    paths: {
      "/api/health": { get: { tags: ["Account"], summary: "Liveness and database check.", security: [], responses: { "200": jsonOk("Healthy.", { type: "object" }) } } },
      "/api/me": { get: { tags: ["Account"], summary: "Current user, sandbox status and score summary.", responses: { "200": jsonOk("Profile.", { type: "object" }), ...errorResponses } } },
      "/api/rules": { get: { tags: ["Account"], summary: "The validation rule catalogue.", security: [], responses: { "200": jsonOk("Every rule with its ID, severity and parameters.", { type: "object" }) } } },
      "/api/sandbox": { get: { tags: ["Account"], summary: "Sandbox provisioning and render progress.", responses: { "200": jsonOk("Sandbox status.", { type: "object" }), ...errorResponses } } },
      "/api/tokens": {
        get: { tags: ["Account"], summary: "List your API tokens.", responses: { "200": jsonOk("Tokens (never the secret).", { type: "object" }), ...errorResponses } },
        post: { tags: ["Account"], summary: "Create an API token.", requestBody: jsonBody({ type: "object", properties: { name: { type: "string" } } }), responses: { "201": jsonOk("The token. `plaintext` is shown once.", { type: "object" }), ...errorResponses } },
      },
      "/api/tokens/{id}": { delete: { tags: ["Account"], summary: "Revoke a token.", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": jsonOk("Revoked.", { type: "object" }), ...errorResponses } } },
      "/api/webhooks": {
        get: { tags: ["Account"], summary: "List webhook endpoints.", responses: { "200": jsonOk("Endpoints.", { type: "object" }), ...errorResponses } },
        post: {
          tags: ["Account"],
          summary: "Register a webhook endpoint.",
          description: `Deliveries are signed with \`X-Automation-Lab-Signature: t=<unix>,v1=<hex hmac-sha256 of "t.body">\`. Events: ${WEBHOOK_EVENTS.join(", ")}.`,
          requestBody: jsonBody({ type: "object", required: ["url"], properties: { url: { type: "string", format: "uri" }, events: { type: "array", items: { type: "string", enum: WEBHOOK_EVENTS } } } }),
          responses: { "201": jsonOk("Endpoint and its signing secret.", { type: "object" }), ...errorResponses },
        },
      },
      "/api/webhooks/{id}": {
        get: { tags: ["Account"], summary: "One endpoint and its recent deliveries.", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": jsonOk("Endpoint.", { type: "object" }), ...errorResponses } },
        delete: { tags: ["Account"], summary: "Remove an endpoint.", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": jsonOk("Deleted.", { type: "object" }), ...errorResponses } },
      },
      "/api/queues": { get: { tags: ["Work queues"], summary: "Every queue with the number of items pending now.", responses: { "200": jsonOk("Queues.", { type: "object" }), ...errorResponses } } },
      "/api/queues/{queue}/download": {
        get: {
          tags: ["Work queues"],
          summary: "ZIP of every rendered PDF in a queue.",
          parameters: [{ name: "queue", in: "path", required: true, schema: { type: "string", enum: ["invoices-pending", "pos-awaiting-invoice", "vendor-applications"] } }],
          responses: { "200": { description: "ZIP archive.", content: { "application/zip": { schema: { type: "string", format: "binary" } } } }, ...errorResponses },
        },
      },
      "/api/work-items": {
        get: {
          tags: ["Work queues"],
          summary: "Dispatcher: materialise a queue and list its items.",
          description: "Items are keyed by (queue, reference), so calling this repeatedly never creates duplicates.",
          parameters: [
            { name: "queue", in: "query", required: true, schema: { type: "string", enum: WORK_ITEM_QUEUES } },
            { name: "status", in: "query", schema: { type: "string", enum: WORK_ITEM_STATUSES } },
            { name: "refresh", in: "query", schema: { type: "string", enum: ["0", "1"] }, description: "Set to 0 to skip re-reading the domain state." },
            ...listParams,
          ],
          responses: { "200": jsonOk("Work items.", { type: "object", properties: { items: { type: "array", items: ref("WorkItem") } } }), "400": jsonOk("Unknown queue or status.", ref("Error")), ...errorResponses },
        },
      },
      "/api/work-items/claim": {
        post: {
          tags: ["Work queues"],
          summary: "Performer: claim the next item and hold a lease on it.",
          requestBody: jsonBody({ type: "object", required: ["queue"], properties: { queue: { type: "string", enum: WORK_ITEM_QUEUES }, owner: { type: "string" }, leaseSeconds: { type: "integer", minimum: 30, maximum: 3600 }, refresh: { type: "boolean" } } }),
          responses: { "200": jsonOk("The claimed item.", { type: "object", properties: { workItem: ref("WorkItem") } }), "204": { description: "The queue is empty." }, ...errorResponses },
        },
      },
      "/api/work-items/{id}/complete": {
        post: { tags: ["Work queues"], summary: "Mark an item successful.", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], requestBody: jsonBody({ type: "object", properties: { outcome: { type: "object" } } }, false), responses: { "200": jsonOk("Updated item.", { type: "object" }), ...errorResponses } },
      },
      "/api/work-items/{id}/fail": {
        post: {
          tags: ["Work queues"],
          summary: "Record a business or application exception.",
          description: "An application exception with `retryInSeconds` returns the item to the queue; a business exception is final.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          requestBody: jsonBody({ type: "object", properties: { reason: { type: "string", enum: ["business", "application"] }, message: { type: "string" }, ruleIds: { type: "array", items: { type: "string" } }, retryInSeconds: { type: "integer" } } }),
          responses: { "200": jsonOk("Updated item.", { type: "object" }), ...errorResponses },
        },
      },
      "/api/invoices": {
        get: {
          tags: ["Invoices"],
          summary: "List invoices.",
          parameters: [{ name: "status", in: "query", schema: { type: "string", enum: INVOICE_STATUSES } }, { name: "q", in: "query", schema: { type: "string" } }, ...listParams],
          responses: { "200": jsonOk("Invoices. Pending ones carry `hidden: true`.", { type: "object" }), ...errorResponses },
        },
      },
      "/api/invoices/{internalNumber}": {
        get: { tags: ["Invoices"], summary: "One invoice.", description: "Values stay hidden until an extraction is submitted.", parameters: [{ name: "internalNumber", in: "path", required: true, schema: { type: "string" }, example: "INV-2026-05012" }], responses: { "200": jsonOk("Invoice.", ref("Invoice")), ...errorResponses } },
      },
      "/api/extractions": {
        post: {
          tags: ["Invoices"],
          summary: "Submit an extraction and run the three-way match.",
          description: "The match runs on the submitted values, and the submission is graded against the ground truth stored when the document was generated.",
          requestBody: jsonBody(ref("ExtractionRequest")),
          responses: { "201": jsonOk("Match result and grade.", ref("ExtractionResult")), ...errorResponses },
        },
      },
      "/api/invoices/{internalNumber}/match": { post: { tags: ["Invoices"], summary: "Re-run the match on the last extraction.", parameters: [{ name: "internalNumber", in: "path", required: true, schema: { type: "string" } }], responses: { "200": jsonOk("Match result.", { type: "object" }), ...errorResponses } } },
      "/api/invoices/{internalNumber}/approve": { post: { tags: ["Invoices"], summary: "Approve an invoice.", parameters: [{ name: "internalNumber", in: "path", required: true, schema: { type: "string" } }], responses: { "200": jsonOk("Approved.", { type: "object" }), ...errorResponses } } },
      "/api/invoices/{internalNumber}/reject": { post: { tags: ["Invoices"], summary: "Reject an invoice.", parameters: [{ name: "internalNumber", in: "path", required: true, schema: { type: "string" } }], responses: { "200": jsonOk("Rejected.", { type: "object" }), ...errorResponses } } },
      "/api/invoices/{internalNumber}/pay": { post: { tags: ["Invoices"], summary: "Pay an approved invoice.", parameters: [{ name: "internalNumber", in: "path", required: true, schema: { type: "string" } }], responses: { "200": jsonOk("Paid, with the payment number.", { type: "object" }), ...errorResponses } } },
      "/api/purchase-orders": {
        get: { tags: ["Procurement"], summary: "List purchase orders.", parameters: [{ name: "status", in: "query", schema: { type: "string", enum: PO_STATUSES } }, { name: "scope", in: "query", schema: { type: "string", enum: ["mine", "all"] }, description: "`all` includes the three years of history." }, { name: "awaitingInvoice", in: "query", schema: { type: "string", enum: ["1"] } }, { name: "q", in: "query", schema: { type: "string" } }, ...listParams], responses: { "200": jsonOk("Purchase orders.", { type: "object" }), ...errorResponses } },
        post: { tags: ["Procurement"], summary: "Create a draft purchase order.", requestBody: jsonBody(ref("PurchaseOrderRequest")), responses: { "201": jsonOk("Created.", { type: "object" }), ...errorResponses } },
      },
      "/api/purchase-orders/{number}": { get: { tags: ["Procurement"], summary: "One purchase order with its lines.", parameters: [{ name: "number", in: "path", required: true, schema: { type: "string" }, example: "PO-2026-05057" }], responses: { "200": jsonOk("Purchase order.", { type: "object" }), ...errorResponses } } },
      "/api/purchase-orders/{number}/approve": { post: { tags: ["Procurement"], summary: "Approve a draft and render its PDF.", parameters: [{ name: "number", in: "path", required: true, schema: { type: "string" } }], responses: { "200": jsonOk("Approved.", { type: "object" }), ...errorResponses } } },
      "/api/rfqs": { get: { tags: ["Procurement"], summary: "List requests for quotation with their quotations.", parameters: [{ name: "status", in: "query", schema: { type: "string", enum: ["open", "quoted", "awarded", "cancelled"] } }, { name: "open", in: "query", schema: { type: "string", enum: ["1"] } }, ...listParams], responses: { "200": jsonOk("RFQs.", { type: "object" }), ...errorResponses } } },
      "/api/rfqs/{number}": { get: { tags: ["Procurement"], summary: "One RFQ.", parameters: [{ name: "number", in: "path", required: true, schema: { type: "string" } }], responses: { "200": jsonOk("RFQ.", { type: "object" }), ...errorResponses } } },
      "/api/rfqs/{number}/award": { post: { tags: ["Procurement"], summary: "Award a quotation and create the draft purchase order.", parameters: [{ name: "number", in: "path", required: true, schema: { type: "string" } }], requestBody: jsonBody({ type: "object", required: ["quoteId"], properties: { quoteId: { type: "string", format: "uuid" } } }), responses: { "200": jsonOk("Awarded.", { type: "object" }), ...errorResponses } } },
      "/api/deliveries": { get: { tags: ["Procurement"], summary: "List delivery notes.", parameters: [{ name: "status", in: "query", schema: { type: "string", enum: ["in_transit", "delivered", "received"] } }, ...listParams], responses: { "200": jsonOk("Delivery notes.", { type: "object" }), ...errorResponses } } },
      "/api/deliveries/{id}": { get: { tags: ["Procurement"], summary: "One delivery note with its lines.", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": jsonOk("Delivery note.", { type: "object" }), ...errorResponses } } },
      "/api/grns": {
        get: { tags: ["Procurement"], summary: "List goods receipts.", parameters: listParams, responses: { "200": jsonOk("Goods receipts.", { type: "object" }), ...errorResponses } },
        post: { tags: ["Procurement"], summary: "Post a goods receipt against a delivery note.", requestBody: jsonBody(ref("GrnRequest")), responses: { "201": jsonOk("Posted.", { type: "object" }), ...errorResponses } },
      },
      "/api/grns/{number}": { get: { tags: ["Procurement"], summary: "One goods receipt.", parameters: [{ name: "number", in: "path", required: true, schema: { type: "string" } }], responses: { "200": jsonOk("Goods receipt.", { type: "object" }), ...errorResponses } } },
      "/api/payments": { get: { tags: ["Procurement"], summary: "List payments.", parameters: listParams, responses: { "200": jsonOk("Payments.", { type: "object" }), ...errorResponses } } },
      "/api/payments/{number}": { get: { tags: ["Procurement"], summary: "One payment and its receipt.", parameters: [{ name: "number", in: "path", required: true, schema: { type: "string" } }], responses: { "200": jsonOk("Payment.", { type: "object" }), ...errorResponses } } },
      "/api/vendors": {
        get: { tags: ["Master data"], summary: "List vendors.", parameters: [{ name: "q", in: "query", schema: { type: "string" } }, { name: "status", in: "query", schema: { type: "string", enum: ["active", "pending", "blocked"] } }, ...listParams], responses: { "200": jsonOk("Vendors.", { type: "object" }), ...errorResponses } },
        post: { tags: ["Master data"], summary: "Create a vendor in your sandbox.", requestBody: jsonBody(ref("VendorRequest")), responses: { "201": jsonOk("Created.", { type: "object" }), ...errorResponses } },
      },
      "/api/vendors/{code}": {
        get: { tags: ["Master data"], summary: "One vendor with its compliance documents.", parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" }, example: "V-00001" }], responses: { "200": jsonOk("Vendor.", { type: "object" }), ...errorResponses } },
        patch: { tags: ["Master data"], summary: "Update a vendor you created.", parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }], requestBody: jsonBody(ref("VendorRequest")), responses: { "200": jsonOk("Updated.", { type: "object" }), ...errorResponses } },
      },
      "/api/items": {
        get: { tags: ["Master data"], summary: "List catalogue items.", parameters: [{ name: "q", in: "query", schema: { type: "string" } }, { name: "category", in: "query", schema: { type: "string" } }, ...listParams], responses: { "200": jsonOk("Items.", { type: "object" }), ...errorResponses } },
        post: { tags: ["Master data"], summary: "Create an item in your sandbox.", requestBody: jsonBody({ type: "object" }), responses: { "201": jsonOk("Created.", { type: "object" }), ...errorResponses } },
      },
      "/api/items/{code}": {
        get: { tags: ["Master data"], summary: "One item.", parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }], responses: { "200": jsonOk("Item.", { type: "object" }), ...errorResponses } },
        patch: { tags: ["Master data"], summary: "Update an item you created.", parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }], requestBody: jsonBody({ type: "object" }), responses: { "200": jsonOk("Updated.", { type: "object" }), ...errorResponses } },
      },
      "/api/documents/{id}": { get: { tags: ["Documents"], summary: "Document metadata and render state.", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": jsonOk("Document.", { type: "object" }), ...errorResponses } } },
      "/api/documents/{id}/file": {
        get: {
          tags: ["Documents"],
          summary: "Download the PDF.",
          description: "Served as an attachment with a predictable file name. 409 means the render is still queued; wait for Retry-After and try again.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }, { name: "level", in: "query", schema: { type: "integer", default: 1 }, description: "Difficulty level. Level 1 is native text." }],
          responses: { ...errorResponses, "200": { description: "The PDF.", content: { "application/pdf": { schema: { type: "string", format: "binary" } } } }, "409": jsonOk("The render is still queued. Wait for Retry-After and try again.", ref("Error")) },
        },
      },
      "/api/openapi": { get: { tags: ["Account"], summary: "This document.", security: [], responses: { "200": jsonOk("The OpenAPI 3.1 description.", { type: "object" }) } } },
      "/api/docs": { get: { tags: ["Account"], summary: "Swagger UI for this API.", security: [], responses: { "200": { description: "HTML page.", content: { "text/html": { schema: { type: "string" } } } } } } },
      "/api/jobs/run": { post: { tags: ["Account"], summary: "Drain the background job queue (cron).", security: [], responses: { "200": jsonOk("Report.", { type: "object" }), "401": jsonOk("Bad cron secret.", ref("Error")) } } },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", description: "A personal API token: `Authorization: Bearer al_...`." },
        sessionCookie: { type: "apiKey", in: "cookie", name: "al_session", description: "The browser session cookie, for bots that sign in through the form." },
      },
      schemas: {
        Error: { type: "object", required: ["error", "message"], properties: { error: { type: "string", description: "Machine-readable code." }, message: { type: "string" } } },
        Violation: { type: "object", properties: { ruleId: { type: "string", example: "PO-INV-PRICE" }, severity: { type: "string", enum: ["warning", "error", "critical"] }, message: { type: "string" }, field: { type: "string" } } },
        ValidationError: { allOf: [ref("Error"), { type: "object", properties: { violations: { type: "array", items: ref("Violation") } } }] },
        WorkItem: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" }, queue: { type: "string", enum: WORK_ITEM_QUEUES }, reference: { type: "string" },
            status: { type: "string", enum: WORK_ITEM_STATUSES }, priority: { type: "string", enum: ["low", "normal", "high"] },
            attempts: { type: "integer" }, specificContent: { type: "object" }, leaseUntil: { type: ["string", "null"], format: "date-time" },
          },
        },
        Invoice: {
          type: "object",
          properties: {
            internalNumber: { type: "string" }, status: { type: "string", enum: INVOICE_STATUSES }, hidden: { type: "boolean" },
            documentId: { type: ["string", "null"], format: "uuid" }, downloadUrl: { type: ["string", "null"] },
            number: { type: "string" }, invoiceDate: { type: "string", format: "date" }, grandTotal: { type: "number" },
            lastExtraction: { type: ["object", "null"] },
          },
        },
        ExtractionRequest: {
          type: "object",
          required: ["internalNumber", "lines"],
          properties: {
            internalNumber: { type: "string", example: "INV-2026-05012" },
            fields: { type: "object", properties: { number: { type: "string" }, invoiceDate: { type: "string" }, dueDate: { type: "string" }, poNumber: { type: "string" }, currency: { type: "string" }, vendorName: { type: "string" }, vendorTaxId: { type: "string" }, iban: { type: "string" }, bankName: { type: "string" }, subtotal: { type: "number" }, taxTotal: { type: "number" }, grandTotal: { type: "number" } } },
            lines: { type: "array", items: { type: "object", required: ["quantity", "unitPrice"], properties: { poLineNo: { type: "integer" }, itemCode: { type: "string" }, description: { type: "string" }, quantity: { type: "number" }, uom: { type: "string" }, unitPrice: { type: "number" }, taxRate: { type: "number", description: "Percent, e.g. 15." }, taxAmount: { type: "number" }, lineTotal: { type: "number" } } } },
          },
        },
        ExtractionResult: {
          type: "object",
          properties: {
            extractionId: { type: ["string", "null"], format: "uuid" },
            match: { type: "object", properties: { ok: { type: "boolean" }, violations: { type: "array", items: ref("Violation") } } },
            grade: { type: "object", properties: { score: { type: "number", description: "Weighted field accuracy, 0 to 1." }, defects: { type: "object" } } },
          },
        },
        PurchaseOrderRequest: { type: "object", required: ["vendorCode", "lines"], properties: { vendorCode: { type: "string" }, orderDate: { type: "string", format: "date" }, expectedDeliveryDate: { type: "string", format: "date" }, approverCode: { type: "string" }, lines: { type: "array", items: { type: "object", required: ["itemCode", "quantity"], properties: { itemCode: { type: "string" }, quantity: { type: "number" }, unitPrice: { type: "number" }, uom: { type: "string" }, taxCode: { type: "string" } } } } } },
        GrnRequest: { type: "object", required: ["deliveryNoteId", "lines"], properties: { deliveryNoteId: { type: "string", format: "uuid" }, receivedDate: { type: "string", format: "date" }, notes: { type: "string" }, lines: { type: "array", items: { type: "object", required: ["lineNo", "quantityReceived"], properties: { lineNo: { type: "integer" }, quantityReceived: { type: "number" }, quantityAccepted: { type: "number" }, quantityRejected: { type: "number" }, rejectionReason: { type: "string" } } } } } },
        VendorRequest: { type: "object", properties: { code: { type: "string" }, name: { type: "string" }, crNumber: { type: "string" }, taxId: { type: "string" }, iban: { type: "string" }, email: { type: "string" }, status: { type: "string", enum: ["active", "pending", "blocked"] } } },
      },
    },
  };
}
