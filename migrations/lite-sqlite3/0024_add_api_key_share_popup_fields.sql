-- Keep the lite-mode API-key table aligned with the shared Drizzle schema.
-- These nullable popup fields are additive; existing keys retain the disabled
-- default and no user content is synthesized during the upgrade.
ALTER TABLE api_keys ADD COLUMN share_popup_enabled integer NOT NULL DEFAULT 0 CHECK (share_popup_enabled IN (0, 1));
--> statement-breakpoint
ALTER TABLE api_keys ADD COLUMN share_popup_image blob;
--> statement-breakpoint
ALTER TABLE api_keys ADD COLUMN share_popup_image_mime text;
--> statement-breakpoint
ALTER TABLE api_keys ADD COLUMN share_popup_title text;
--> statement-breakpoint
ALTER TABLE api_keys ADD COLUMN share_popup_body text;
--> statement-breakpoint
ALTER TABLE api_keys ADD COLUMN expires_at text;
--> statement-breakpoint
ALTER TABLE api_keys ADD COLUMN model_template_id text;
