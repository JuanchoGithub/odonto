-- Treatment catalog: fixed list (admin/secretary definitive) + provisional
-- entries proposed by dentists when they bill a custom description/price.
-- One definitive CONSULTA row is seeded below (single consulta catalog).
CREATE TABLE IF NOT EXISTS treatment_catalog (
  id TEXT PRIMARY KEY,
  code TEXT,
  description TEXT NOT NULL,
  default_price_cents INTEGER NOT NULL DEFAULT 0,
  tax_kind TEXT NOT NULL DEFAULT 'standard' CHECK (tax_kind IN ('standard','reduced','none')),
  kind TEXT NOT NULL DEFAULT 'general' CHECK (kind IN ('consulta','general')),
  is_definitive INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_catalog_kind ON treatment_catalog(kind, archived_at);
CREATE INDEX IF NOT EXISTS idx_catalog_desc ON treatment_catalog(description);
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_code ON treatment_catalog(code) WHERE code IS NOT NULL;

-- Single definitive consulta catalog entry (50.000 ARS final, IVA incluido).
-- Price is final/post-tax; tax split is computed at invoice time from clinic rates.
INSERT OR IGNORE INTO treatment_catalog
  (id, code, description, default_price_cents, tax_kind, kind, is_definitive, created_at)
VALUES
  ('catalog-consulta', 'CONSULTA', 'Consulta', 5000000, 'standard', 'consulta', 1, datetime('now'));
