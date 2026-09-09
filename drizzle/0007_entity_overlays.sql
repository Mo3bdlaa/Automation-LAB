CREATE TABLE "entity_overlays" (
	"tenant_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"patch" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entity_overlays" ADD CONSTRAINT "entity_overlays_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entity_overlays_pk" ON "entity_overlays" USING btree ("tenant_id","entity","entity_id");--> statement-breakpoint
CREATE INDEX "entity_overlays_entity_idx" ON "entity_overlays" USING btree ("entity","entity_id");