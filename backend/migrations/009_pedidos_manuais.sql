-- ═══════════════════════════════════════════════════════════════════
-- DONNA HUB — Migration 009 — Pedidos Manuais (rota dedicada)
-- Executar no Supabase SQL Editor
-- Contexto: auditoria 2026-07-13 — pedidos_manuais era a única feature viva
-- que tratava /api/db (hub_config) como sua API real. Esta tabela substitui
-- a chave 'pedidos_manuais' em hub_config.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pedidos_manuais (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto     TEXT NOT NULL,
  qtd         INTEGER NOT NULL DEFAULT 1,
  obs         TEXT NOT NULL DEFAULT '',
  pedido      BOOLEAN NOT NULL DEFAULT false,
  pedido_em   TIMESTAMPTZ,
  pedido_por  UUID REFERENCES rubi_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_manuais_pedido ON pedidos_manuais(pedido);
