-- Restore PostgreSQL schema fields and tables present in the application schema.
-- These were previously added only to Lite/SQLite migrations, so an existing
-- PostgreSQL database could run application code against missing objects.
ALTER TABLE "network_pools"
  ADD COLUMN IF NOT EXISTS "provider_probe_provider_id" text;
--> statement-breakpoint
ALTER TABLE "network_pools"
  ADD COLUMN IF NOT EXISTS "provider_probe_status" text;
--> statement-breakpoint
ALTER TABLE "network_pools"
  ADD COLUMN IF NOT EXISTS "provider_probe_http_status" integer;
--> statement-breakpoint
ALTER TABLE "network_pools"
  ADD COLUMN IF NOT EXISTS "provider_probe_reason" text;
--> statement-breakpoint
ALTER TABLE "network_pools"
  ADD COLUMN IF NOT EXISTS "provider_probe_latency_ms" integer;
--> statement-breakpoint
ALTER TABLE "network_pools"
  ADD COLUMN IF NOT EXISTS "provider_probe_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "network_pools"
  ADD COLUMN IF NOT EXISTS "provider_probe_endpoint" text;
--> statement-breakpoint
ALTER TABLE "network_pools"
  ADD COLUMN IF NOT EXISTS "provider_cooldowns" jsonb;
--> statement-breakpoint
ALTER TABLE "telemetry_events"
  ADD COLUMN IF NOT EXISTS "client_name" text;
--> statement-breakpoint
ALTER TABLE "telemetry_events"
  ADD COLUMN IF NOT EXISTS "reported_model" text;
--> statement-breakpoint
-- Do not discard telemetry history to make the idempotency index fit. If a
-- prior version wrote duplicate request identities, stop with an actionable
-- error so an operator can reconcile those rows explicitly before upgrading.
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "telemetry_events"
     GROUP BY "tenant_id", "request_id"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Cannot create telemetry_events_tenant_request_uidx: duplicate tenant_id/request_id rows exist.',
      HINT = 'Preserve and reconcile the duplicate telemetry history, then retry the migration.';
  END IF;
END
$migration$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "telemetry_events_tenant_request_uidx"
  ON "telemetry_events" ("tenant_id", "request_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "buddy_usage_snapshots" (
  "account_id" uuid NOT NULL REFERENCES "provider_accounts"("id") ON DELETE cascade,
  "day_key" text NOT NULL,
  "model" text NOT NULL,
  "credit" numeric(14, 4) NOT NULL,
  "synced_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "buddy_usage_snapshots_account_id_day_key_model_pk"
    PRIMARY KEY ("account_id", "day_key", "model")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "buddy_usage_snapshots_day_idx"
  ON "buddy_usage_snapshots" ("day_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inferhub_config_keys" (
  "id" text PRIMARY KEY,
  "ciphertext" bytea NOT NULL,
  "fingerprint" text NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "telemetry_reconciliation_state" (
  "job_name" text PRIMARY KEY,
  "lease_owner" text,
  "lease_expires_at" timestamptz,
  "file_name" text NOT NULL DEFAULT '',
  "byte_offset" bigint NOT NULL DEFAULT 0,
  "files_completed" bigint DEFAULT 0,
  "events_examined" bigint DEFAULT 0,
  "events_inserted" bigint DEFAULT 0,
  "conflicts" bigint DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "telemetry_reconciliation_state_offset_nonneg"
    CHECK ("byte_offset" >= 0)
);
