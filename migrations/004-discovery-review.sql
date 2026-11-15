ALTER TABLE hub_catalog ADD COLUMN IF NOT EXISTS owner_edited boolean NOT NULL DEFAULT false;
UPDATE hub_catalog c SET owner_edited=true WHERE EXISTS(SELECT 1 FROM admin_audit a WHERE a.resource=c.id AND a.action='catalog.save' AND a.actor<>'auto-publish');
