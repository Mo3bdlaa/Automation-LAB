CREATE TABLE "document_field_boxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"field" text NOT NULL,
	"page" integer DEFAULT 1 NOT NULL,
	"x" numeric(8, 6) NOT NULL,
	"y" numeric(8, 6) NOT NULL,
	"w" numeric(8, 6) NOT NULL,
	"h" numeric(8, 6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "extractions" ADD COLUMN "level" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "ground_truth" ADD COLUMN "alternates" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "document_language" text DEFAULT 'bilingual' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_field_boxes" ADD CONSTRAINT "document_field_boxes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_field_boxes" ADD CONSTRAINT "document_field_boxes_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_field_boxes_uq" ON "document_field_boxes" USING btree ("document_id","level","field");--> statement-breakpoint
CREATE INDEX "document_field_boxes_doc_idx" ON "document_field_boxes" USING btree ("document_id");--> statement-breakpoint
ALTER TABLE "ground_truth" DROP COLUMN "bbox";
