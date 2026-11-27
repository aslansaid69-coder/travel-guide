-- Stage 2: place model additions (slug, Kazakh text, gallery, researched prices).
-- Catalog items remain JSONB validated by lib/hub/types.ts (itemSchema).

-- 1. Backfill URL slugs from ids, de-duplicated, then enforce uniqueness.
WITH s AS (
  SELECT id, trim(both '-' from lower(regexp_replace(id, '[^a-zA-Z0-9]+', '-', 'g'))) AS base
  FROM hub_catalog WHERE COALESCE(data->>'slug', '') = ''
), n AS (
  SELECT id, base, row_number() OVER (PARTITION BY base ORDER BY id) AS k FROM s
)
UPDATE hub_catalog c
SET data = jsonb_set(c.data, '{slug}', to_jsonb(CASE WHEN n.k = 1 THEN n.base ELSE n.base || '-' || n.k END))
FROM n WHERE c.id = n.id;
CREATE UNIQUE INDEX IF NOT EXISTS hub_catalog_slug ON hub_catalog ((data->>'slug')) WHERE COALESCE(data->>'slug', '') <> '';
CREATE INDEX IF NOT EXISTS hub_catalog_google ON hub_catalog ((data->>'googlePlaceId')) WHERE COALESCE(data->>'googlePlaceId', '') <> '';
CREATE INDEX IF NOT EXISTS hub_catalog_name ON hub_catalog (lower(data->>'name'));

-- 2. Researched entrance prices live in data/place-prices.json and are applied by
--    seedCatalog() on every migrate run (only where no price exists yet).
UPDATE hub_catalog
SET data = data || jsonb_build_object('priceStatus', CASE WHEN jsonb_typeof(data->'price') = 'object' THEN 'found' ELSE 'unknown' END)
WHERE NOT data ? 'priceStatus';
