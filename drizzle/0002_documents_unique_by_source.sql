DROP INDEX "documents_tenant_kind_number_uq";--> statement-breakpoint
DROP INDEX "documents_tenant_source_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "documents_tenant_kind_source_uq" ON "documents" USING btree ("tenant_id","kind","source_id");--> statement-breakpoint
CREATE INDEX "documents_tenant_number_idx" ON "documents" USING btree ("tenant_id","number");