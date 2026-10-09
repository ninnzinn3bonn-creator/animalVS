CREATE TABLE IF NOT EXISTS capture_jobs (
  id TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  character_name TEXT NOT NULL,
  input_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'retrying', 'completed', 'failed')),
  stage TEXT NOT NULL,
  character_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS capture_jobs_session_status
  ON capture_jobs(session_hash, status);
CREATE INDEX IF NOT EXISTS capture_jobs_created_at
  ON capture_jobs(created_at);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  sprite_key TEXT NOT NULL,
  mask_key TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  collision_mode TEXT NOT NULL,
  vertices_json TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS characters_created_at ON characters(created_at DESC);
