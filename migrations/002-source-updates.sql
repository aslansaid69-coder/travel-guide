CREATE TABLE IF NOT EXISTS source_snapshots (
 source_key text PRIMARY KEY, kind text NOT NULL, label text NOT NULL, data jsonb,
 last_success timestamptz, last_attempt timestamptz, status text NOT NULL DEFAULT 'not_configured',
 consecutive_failures int NOT NULL DEFAULT 0, last_error text, revision text
);
CREATE TABLE IF NOT EXISTS update_runs (
 id text PRIMARY KEY, job text NOT NULL, actor text NOT NULL, started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz, status text NOT NULL DEFAULT 'running', summary jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS update_source_runs (
 run_id text NOT NULL REFERENCES update_runs(id), source_key text NOT NULL, status text NOT NULL,
 reason text, duration_ms int NOT NULL, requests int NOT NULL DEFAULT 0, PRIMARY KEY(run_id,source_key)
);
CREATE TABLE IF NOT EXISTS update_leases (
 name text PRIMARY KEY, owner text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS update_job_state (
 job text PRIMARY KEY, failures int NOT NULL DEFAULT 0, incident_id text, last_run text, last_status text, last_attempt timestamptz
);
CREATE TABLE IF NOT EXISTS notification_outbox (
 id text PRIMARY KEY, job text NOT NULL, incident_id text NOT NULL, subject text NOT NULL, body text NOT NULL,
 status text NOT NULL DEFAULT 'pending', attempts int NOT NULL DEFAULT 0, last_error text, next_attempt timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(job,incident_id)
);
CREATE TABLE IF NOT EXISTS content_candidates (
 source_key text NOT NULL, external_id text NOT NULL, kind text NOT NULL, data jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending', published_data jsonb, discovered_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(source_key,external_id)
);
CREATE INDEX IF NOT EXISTS update_runs_time ON update_runs(started_at DESC);

ALTER TABLE content_candidates ADD COLUMN IF NOT EXISTS published_data jsonb;
