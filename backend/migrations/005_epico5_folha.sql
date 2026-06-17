-- ═══════════════════════════════════════════════════════════════════
-- DONNA HUB v5.0 — Migration 005 — Épico 5: Folha de Pagamento
-- Executar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Adiciona campos detalhados que estavam apenas no cliente (localStorage)
ALTER TABLE folha
  ADD COLUMN IF NOT EXISTS tipo              TEXT          DEFAULT 'clt',
  ADD COLUMN IF NOT EXISTS dias_uteis        SMALLINT      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS faltas            SMALLINT      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dias_trabalhados  SMALLINT      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vt                NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vr                NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adiantamento      NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_valor        NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_realizado    NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fgts              NUMERIC(10,2) DEFAULT 0;

-- Índice para filtro de mês
CREATE INDEX IF NOT EXISTS idx_folha_mes ON folha(mes);

COMMENT ON COLUMN folha.tipo             IS 'socio | clt';
COMMENT ON COLUMN folha.dias_uteis       IS 'Dias úteis do mês de referência';
COMMENT ON COLUMN folha.faltas           IS 'Número de faltas no mês';
COMMENT ON COLUMN folha.dias_trabalhados IS 'dias_uteis - faltas';
COMMENT ON COLUMN folha.vt               IS 'Vale Transporte total do mês (R$)';
COMMENT ON COLUMN folha.vr               IS 'Vale Refeição total do mês (R$)';
COMMENT ON COLUMN folha.adiantamento     IS 'Adiantamento descontado do líquido';
COMMENT ON COLUMN folha.meta_valor       IS 'Meta de vendas do mês (CLT)';
COMMENT ON COLUMN folha.meta_realizado   IS 'Vendas realizadas no mês (CLT)';
COMMENT ON COLUMN folha.fgts             IS 'FGTS — custo da empresa (8% do bruto CLT)';
