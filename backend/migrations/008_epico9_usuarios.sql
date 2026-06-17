-- ═══════════════════════════════════════════════════════════════════
-- DONNA HUB v5.0 — Migration 008 — Épico 9: Gestão de Utilizadores
-- Executar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE rubi_users
  ADD COLUMN IF NOT EXISTS tiny_vendor TEXT  DEFAULT '',
  ADD COLUMN IF NOT EXISTS permissoes  JSONB DEFAULT '{}';

COMMENT ON COLUMN rubi_users.tiny_vendor IS 'Nome do vendedor no Tiny ERP para correlacionar vendas';
COMMENT ON COLUMN rubi_users.permissoes  IS 'Mapa de overrides por aba: {"boletos":true,"folha":false,...}';
