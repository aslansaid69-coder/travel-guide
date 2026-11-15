CREATE TABLE IF NOT EXISTS staff_roles (
 user_id text PRIMARY KEY, email text NOT NULL, role text NOT NULL CHECK (role IN ('owner','manager','partner')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cameras (
 id text PRIMARY KEY, config jsonb NOT NULL, status text NOT NULL DEFAULT 'offline' CHECK (status IN ('online','offline','hidden')),
 failures int NOT NULL DEFAULT 0, manual_hidden boolean NOT NULL DEFAULT false, blocked boolean NOT NULL DEFAULT false,
 last_check timestamptz, reason text, manifest_hash text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS camera_checks (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, camera_id text NOT NULL REFERENCES cameras(id), checked_at timestamptz NOT NULL DEFAULT now(),
 ok boolean NOT NULL, reason text NOT NULL, final_url text, actor text NOT NULL
);
CREATE INDEX IF NOT EXISTS camera_checks_camera_time ON camera_checks(camera_id,checked_at DESC);
CREATE TABLE IF NOT EXISTS job_runs (
 id text PRIMARY KEY, job text NOT NULL, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 status text NOT NULL DEFAULT 'running', details jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS admin_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor text NOT NULL, action text NOT NULL, resource text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
