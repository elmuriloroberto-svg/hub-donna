-- ═══════════════════════════════════════════════════════════════════
-- DONNA HUB v5.0 — Migration 007 — Épico 7: Processos / Wiki
-- Executar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Adiciona campo de links externos ao processo
ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS links TEXT DEFAULT '';

COMMENT ON COLUMN processos.links IS 'URLs de referência, uma por linha';
