-- Provider routing may pin an owned network pool. This column is nullable so
-- existing routes retain the automatic/direct behavior.
ALTER TABLE "provider_routing_settings"
  ADD COLUMN IF NOT EXISTS "assigned_pool_id" uuid
  REFERENCES "network_pools"("id") ON DELETE SET NULL;
