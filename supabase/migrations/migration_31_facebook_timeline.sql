-- Facebook page accounts
CREATE TABLE IF NOT EXISTS facebook_accounts (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_phone    TEXT        NOT NULL,
  page_id           TEXT        NOT NULL,
  page_name         TEXT,
  access_token      TEXT        NOT NULL,
  token_expires_at  TIMESTAMPTZ,
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (whatsapp_phone, page_id)
);

-- Extend pending_posts for timeline + Facebook
ALTER TABLE pending_posts
  ADD COLUMN IF NOT EXISTS facebook_post_id   TEXT,
  ADD COLUMN IF NOT EXISTS facebook_post_url  TEXT,
  ADD COLUMN IF NOT EXISTS timeline_json      JSONB,
  ADD COLUMN IF NOT EXISTS render_resolution  TEXT NOT NULL DEFAULT 'preview';
