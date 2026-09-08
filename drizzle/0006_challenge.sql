CREATE TABLE "accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"alias" text,
	"location" text,
	"roles" jsonb DEFAULT '["student"]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "challenge_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"scenario" text NOT NULL,
	"mode" text DEFAULT 'practice' NOT NULL,
	"channel" text,
	"status" text DEFAULT 'running' NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"targets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"processed_count" integer DEFAULT 0 NOT NULL,
	"score" numeric(5, 2),
	"breakdown" jsonb,
	"publish" boolean DEFAULT false NOT NULL,
	"certificate_code" text,
	"certificate_issued_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "challenge_runs" ADD CONSTRAINT "challenge_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_email_uq" ON "accounts" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "challenge_runs_board_idx" ON "challenge_runs" USING btree ("scenario","status","score");--> statement-breakpoint
CREATE INDEX "challenge_runs_user_idx" ON "challenge_runs" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_runs_certificate_uq" ON "challenge_runs" USING btree ("certificate_code");