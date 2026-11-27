-- Stage 1: OWNER / ADMIN / GUIDE / TOURIST roles and a richer admin audit log.
-- "manager" is renamed to "admin". TOURIST is any verified user without a staff_roles row.
ALTER TABLE staff_roles DROP CONSTRAINT IF EXISTS staff_roles_role_check;
UPDATE staff_roles SET role='admin' WHERE role='manager';
ALTER TABLE staff_roles ADD CONSTRAINT staff_roles_role_check CHECK(role IN ('owner','admin','partner','guide'));
ALTER TABLE staff_roles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE staff_roles ADD COLUMN IF NOT EXISTS updated_by text;

ALTER TABLE admin_audit ADD COLUMN IF NOT EXISTS actor_email text;
ALTER TABLE admin_audit ADD COLUMN IF NOT EXISTS actor_role text;
ALTER TABLE admin_audit ADD COLUMN IF NOT EXISTS ip text;
ALTER TABLE admin_audit ADD COLUMN IF NOT EXISTS user_agent text;
CREATE INDEX IF NOT EXISTS admin_audit_time ON admin_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_actor ON admin_audit(actor, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_action ON admin_audit(action, created_at DESC);
