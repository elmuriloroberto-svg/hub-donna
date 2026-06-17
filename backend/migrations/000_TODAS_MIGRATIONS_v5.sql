-- ═══════════════════════════════════════════════════════════════════
-- DONNA HUB v5.0 — TODAS AS MIGRATIONS (005 a 008)
-- Cole este arquivo inteiro no Supabase SQL Editor e execute.
-- É seguro rodar múltiplas vezes (IF NOT EXISTS em todos os ALTER).
-- ═══════════════════════════════════════════════════════════════════

-- ── 005: Folha de Pagamento ──────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_folha_mes ON folha(mes);

-- ── 006: Metas & Auditoria ───────────────────────────────────────
ALTER TABLE metas
  ADD COLUMN IF NOT EXISTS collab_login   TEXT,
  ADD COLUMN IF NOT EXISTS criado_por     TEXT,
  ADD COLUMN IF NOT EXISTS criado_em      TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS atualizado_por TEXT,
  ADD COLUMN IF NOT EXISTS atualizado_em  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_metas_mes    ON metas(mes);
CREATE INDEX IF NOT EXISTS idx_metas_collab ON metas(colaborador_id);

-- ── 007: Processos / Wiki ────────────────────────────────────────
ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS links TEXT DEFAULT '';

-- ── 008: Gestão de Utilizadores ──────────────────────────────────
ALTER TABLE rubi_users
  ADD COLUMN IF NOT EXISTS tiny_vendor TEXT  DEFAULT '',
  ADD COLUMN IF NOT EXISTS permissoes  JSONB DEFAULT '{}';
