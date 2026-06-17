-- ═══════════════════════════════════════════════════════════════════
-- DONNA HUB v5.0 — Migration 001 — Épico 1: Dashboard & Alertas
-- Executar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Meta mensal migrada do localStorage para o Supabase.
-- Permite que o Admin defina a meta UMA vez e todos os devices vejam.
CREATE TABLE IF NOT EXISTS metas_mensais (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  mes          TEXT         NOT NULL,                              -- formato YYYY-MM
  meta_total   NUMERIC(12, 2) NOT NULL CHECK (meta_total > 0),
  super_pct    NUMERIC(5, 2)  NOT NULL DEFAULT 10,                -- % acima da meta para super-meta
  criado_por   UUID         REFERENCES rubi_users(id) ON DELETE SET NULL,
  criado_em    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  alterado_por UUID         REFERENCES rubi_users(id) ON DELETE SET NULL,
  alterado_em  TIMESTAMPTZ,
  UNIQUE(mes)
);

COMMENT ON TABLE  metas_mensais             IS 'Meta mensal de vendas — migrada do localStorage para multidevice';
COMMENT ON COLUMN metas_mensais.super_pct   IS '% adicional sobre meta_total que define a Super Meta. Ex: 10 = meta * 1.10';
COMMENT ON COLUMN metas_mensais.alterado_por IS 'Último admin que editou — visível no modal de edição';
