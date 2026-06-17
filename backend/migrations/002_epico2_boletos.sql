-- ═══════════════════════════════════════════════════════════════════
-- DONNA HUB v5.0 — Migration 002 — Épico 2: Contas a Pagar
-- Executar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Adiciona colunas para categorização e agrupamento de parcelas
ALTER TABLE boletos_pagar
  ADD COLUMN IF NOT EXISTS categoria    TEXT     NOT NULL DEFAULT 'Geral',
  ADD COLUMN IF NOT EXISTS grupo_id     UUID,
  ADD COLUMN IF NOT EXISTS parcela_num  SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parcela_tot  SMALLINT NOT NULL DEFAULT 1;

-- Backfill grupo_id para linhas existentes (cada linha fica no seu próprio grupo)
UPDATE boletos_pagar SET grupo_id = gen_random_uuid() WHERE grupo_id IS NULL;
ALTER TABLE boletos_pagar ALTER COLUMN grupo_id SET NOT NULL;
ALTER TABLE boletos_pagar ALTER COLUMN grupo_id SET DEFAULT gen_random_uuid();

-- Índices para performance nas queries de filtro
CREATE INDEX IF NOT EXISTS idx_boletos_pagar_grupo_id   ON boletos_pagar(grupo_id);
CREATE INDEX IF NOT EXISTS idx_boletos_pagar_vencimento ON boletos_pagar(vencimento);

COMMENT ON COLUMN boletos_pagar.categoria   IS 'Classificação da despesa: Produtos, Aluguel, Energia, Marketing, Salários, Impostos, Equipamentos, Outros, Geral';
COMMENT ON COLUMN boletos_pagar.grupo_id    IS 'Agrupa parcelas de uma mesma conta — todas as parcelas de um boleto parcelado partilham o mesmo grupo_id';
COMMENT ON COLUMN boletos_pagar.parcela_num IS 'Número da parcela (1, 2, 3…)';
COMMENT ON COLUMN boletos_pagar.parcela_tot IS 'Total de parcelas do grupo';
