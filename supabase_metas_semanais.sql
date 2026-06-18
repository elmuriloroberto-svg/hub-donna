-- ============================================================
-- Donna Hub v4 — Metas Semanais Gamificadas
-- Rodar no SQL Editor do Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS metas_semanais (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_nome          TEXT NOT NULL,
  meta_valor             NUMERIC(12,2) NOT NULL,
  bonus_por_dez_porcento NUMERIC(12,2) NOT NULL DEFAULT 0,
  data_inicio            DATE NOT NULL,
  data_fim               DATE NOT NULL,
  created_by             UUID REFERENCES rubi_users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vendedor_nome, data_inicio)
);

ALTER TABLE metas_semanais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_only_metas_semanais" ON metas_semanais;
CREATE POLICY "service_only_metas_semanais"
  ON metas_semanais FOR ALL TO service_role USING (true) WITH CHECK (true);
