-- ═══════════════════════════════════════════════════════════════════
-- DONNA HUB v5.0 — Migration 006 — Épico 6: Metas & Auditoria
-- Executar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Adiciona campos de auditoria à tabela de metas individuais
ALTER TABLE metas
  ADD COLUMN IF NOT EXISTS collab_login   TEXT,
  ADD COLUMN IF NOT EXISTS criado_por     TEXT,
  ADD COLUMN IF NOT EXISTS criado_em      TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS atualizado_por TEXT,
  ADD COLUMN IF NOT EXISTS atualizado_em  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_metas_mes    ON metas(mes);
CREATE INDEX IF NOT EXISTS idx_metas_collab ON metas(colaborador_id);

COMMENT ON COLUMN metas.collab_login   IS 'Login do colaborador (redundante para lookup rápido)';
COMMENT ON COLUMN metas.criado_por     IS 'Nome do usuário que criou a meta';
COMMENT ON COLUMN metas.criado_em      IS 'Timestamp da criação';
COMMENT ON COLUMN metas.atualizado_por IS 'Nome do usuário que editou por último';
COMMENT ON COLUMN metas.atualizado_em  IS 'Timestamp da última edição';
