CREATE TABLE IF NOT EXISTS processed_posts (
  id TEXT PRIMARY KEY,
  canonical_url TEXT NOT NULL,
  published_at TEXT NOT NULL,
  content_fingerprint TEXT NOT NULL,
  discovered_at TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  source_payload_json TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_processed_posts_url
  ON processed_posts(canonical_url);

CREATE INDEX IF NOT EXISTS idx_processed_posts_published_at
  ON processed_posts(published_at DESC);

CREATE TABLE IF NOT EXISTS digest_runs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  source TEXT NOT NULL,
  candidate_count INTEGER NOT NULL,
  item_count INTEGER NOT NULL,
  ai_analysis INTEGER NOT NULL,
  message_text TEXT NOT NULL,
  analysis_text TEXT,
  report_object_key TEXT,
  report_url TEXT,
  source_items_json TEXT NOT NULL,
  feishu_push_ok INTEGER NOT NULL DEFAULT 0,
  push_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_digest_runs_created_at
  ON digest_runs(created_at DESC);
