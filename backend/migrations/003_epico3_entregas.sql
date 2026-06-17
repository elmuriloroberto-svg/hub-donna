-- ═══════════════════════════════════════════════════════════════════
-- DONNA HUB v5.0 — Migration 003 — Épico 3: Controle de Entregas
-- Executar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Adiciona colunas que estavam apenas no lado cliente (GAS)
ALTER TABLE entregas
  ADD COLUMN IF NOT EXISTS num_venda   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS forma_envio TEXT NOT NULL DEFAULT 'uber';

-- Índice para filtro por data (filtro de mês usa range na coluna data)
CREATE INDEX IF NOT EXISTS idx_entregas_data ON entregas(data);

COMMENT ON COLUMN entregas.num_venda   IS 'Número da venda/pedido associado à entrega';
COMMENT ON COLUMN entregas.forma_envio IS 'Modal de envio: uber | 99 | correios | donna';
