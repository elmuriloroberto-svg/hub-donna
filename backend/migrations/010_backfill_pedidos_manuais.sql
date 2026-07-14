-- ═══════════════════════════════════════════════════════════════════
-- DONNA HUB — Migration 010 — Backfill pedidos_manuais (hub_config → tabela dedicada)
-- Executar no Supabase SQL Editor, DEPOIS da 009_pedidos_manuais.sql
-- Idempotente: rodar quantas vezes for preciso, não duplica registros
-- (usa legacy_id como chave de conflito).
--
-- Não apaga hub_config.pedidos_manuais — a limpeza do legado acontece
-- só quando /api/db for removido de vez (passo 5).
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE pedidos_manuais ADD COLUMN IF NOT EXISTS legacy_id TEXT UNIQUE;

WITH legacy AS (
  SELECT config_value
  FROM hub_config
  WHERE config_key = 'pedidos_manuais'
    AND config_value IS NOT NULL
    AND config_value NOT IN ('', '[]')
)
INSERT INTO pedidos_manuais (produto, qtd, obs, pedido, pedido_em, created_at, legacy_id)
SELECT
  item->>'produto',
  COALESCE((item->>'qtd')::int, 1),
  COALESCE(item->>'obs', ''),
  COALESCE((item->>'pedido')::boolean, false),
  NULLIF(item->>'pedidoEm', '')::timestamptz,
  COALESCE(NULLIF(item->>'criadoEm', '')::timestamptz, NOW()),
  item->>'id'
FROM legacy, jsonb_array_elements(legacy.config_value::jsonb) AS item
WHERE item->>'produto' IS NOT NULL
ON CONFLICT (legacy_id) DO NOTHING;

-- Conferência pós-backfill: compara quantidade migrada com a lista legada
SELECT
  (SELECT jsonb_array_length(config_value::jsonb) FROM hub_config WHERE config_key = 'pedidos_manuais') AS itens_no_legado,
  (SELECT count(*) FROM pedidos_manuais WHERE legacy_id IS NOT NULL) AS itens_migrados;
