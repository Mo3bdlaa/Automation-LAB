ALTER TABLE "challenge_runs" ADD COLUMN "dataset_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "dataset_version" integer DEFAULT 1 NOT NULL;