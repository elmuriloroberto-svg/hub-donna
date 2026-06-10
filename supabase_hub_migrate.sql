11-- ============================================================
-- Donna Hub v4 — Migração completa para Supabase (PostgreSQL)
-- Rodar no SQL Editor do Supabase (projeto Hub: suvzmcwsiqoglbnidvzo)
-- IMPORTANTE: rode supabase_security_migrate.sql ANTES deste
-- ============================================================

-- Clientes
CREATE TABLE IF NOT EXISTS clientes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT NOT NULL,
  tipo        TEXT NOT NULL DEFAULT 'Salão',
  telefone    TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  endereco    TEXT NOT NULL DEFAULT '',
  cpf_cnpj    TEXT NOT NULL DEFAULT '',
  obs         TEXT NOT NULL DEFAULT '',
  ativo       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Boletos a pagar
CREATE TABLE IF NOT EXISTS boletos_pagar (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor  TEXT NOT NULL,
  valor       NUMERIC(12,2) NOT NULL,
  vencimento  DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pendente'
              CHECK (status IN ('pendente','pago','vencido')),
  obs         TEXT NOT NULL DEFAULT '',
  created_by  UUID REFERENCES rubi_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Boletos a receber
CREATE TABLE IF NOT EXISTS boletos_receber (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  UUID REFERENCES clientes(id) ON DELETE SET NULL,
  valor       NUMERIC(12,2) NOT NULL,
  vencimento  DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pendente'
              CHECK (status IN ('pendente','recebido','atrasado')),
  pedido      TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Tarefas / Agenda
CREATE TABLE IF NOT EXISTS tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo           TEXT NOT NULL,
  descricao        TEXT NOT NULL DEFAULT '',
  collab_id        UUID NOT NULL REFERENCES rubi_users(id) ON DELETE CASCADE,
  prazo            DATE,
  prio             TEXT NOT NULL DEFAULT 'media'
                   CHECK (prio IN ('alta','media','baixa')),
  done             BOOLEAN NOT NULL DEFAULT false,
  delegado_por_id  UUID REFERENCES rubi_users(id) ON DELETE SET NULL,
  recorrente       BOOLEAN NOT NULL DEFAULT false,
  intervalo_dias   SMALLINT,
  proxima_execucao DATE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Metas de vendas
CREATE TABLE IF NOT EXISTS metas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  UUID NOT NULL REFERENCES rubi_users(id) ON DELETE CASCADE,
  mes             TEXT NOT NULL,
  meta_valor      NUMERIC(12,2) NOT NULL,
  realizado       NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Processos / Wiki
CREATE TABLE IF NOT EXISTS processos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo       TEXT NOT NULL,
  categoria    TEXT NOT NULL DEFAULT '',
  conteudo     TEXT NOT NULL DEFAULT '',
  autor_id     UUID REFERENCES rubi_users(id) ON DELETE SET NULL,
  criado_em    DATE NOT NULL DEFAULT CURRENT_DATE,
  atualizado_em DATE NOT NULL DEFAULT CURRENT_DATE
);

-- Entregas / Uber
CREATE TABLE IF NOT EXISTS entregas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data           DATE NOT NULL,
  cliente_id     UUID REFERENCES clientes(id) ON DELETE SET NULL,
  descricao      TEXT NOT NULL DEFAULT '',
  valor_cobrado  NUMERIC(12,2) NOT NULL,
  valor_uber     NUMERIC(12,2) NOT NULL,
  status         TEXT NOT NULL DEFAULT 'realizada',
  obs            TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Folha de salários
CREATE TABLE IF NOT EXISTS folha (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  UUID NOT NULL REFERENCES rubi_users(id) ON DELETE CASCADE,
  mes             TEXT NOT NULL,
  salario_base    NUMERIC(12,2) NOT NULL,
  comissao        NUMERIC(12,2) NOT NULL DEFAULT 0,
  bonus           NUMERIC(12,2) NOT NULL DEFAULT 0,
  descontos       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_liquido   NUMERIC(12,2) NOT NULL,
  obs             TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Hub de informações internas
CREATE TABLE IF NOT EXISTS hub_data (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria   TEXT NOT NULL DEFAULT 'geral',
  titulo      TEXT NOT NULL,
  conteudo    TEXT NOT NULL DEFAULT '',
  meta        TEXT NOT NULL DEFAULT '',
  ativo       BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES rubi_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- hub_config já existe; garante estrutura correta
CREATE TABLE IF NOT EXISTS hub_config (
  config_key   TEXT PRIMARY KEY,
  config_value TEXT,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Row Level Security (apenas service_role acessa) ─────────────────────────
ALTER TABLE clientes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE boletos_pagar   ENABLE ROW LEVEL SECURITY;
ALTER TABLE boletos_receber ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE metas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE processos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE entregas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE folha           ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_data        ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_config      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_only_clientes"        ON clientes;
DROP POLICY IF EXISTS "service_only_boletos_pagar"   ON boletos_pagar;
DROP POLICY IF EXISTS "service_only_boletos_receber" ON boletos_receber;
DROP POLICY IF EXISTS "service_only_tasks"           ON tasks;
DROP POLICY IF EXISTS "service_only_metas"           ON metas;
DROP POLICY IF EXISTS "service_only_processos"       ON processos;
DROP POLICY IF EXISTS "service_only_entregas"        ON entregas;
DROP POLICY IF EXISTS "service_only_folha"           ON folha;
DROP POLICY IF EXISTS "service_only_hub_data"        ON hub_data;
DROP POLICY IF EXISTS "service_only_hub_config"      ON hub_config;

CREATE POLICY "service_only_clientes"        ON clientes        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_only_boletos_pagar"   ON boletos_pagar   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_only_boletos_receber" ON boletos_receber FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_only_tasks"           ON tasks           FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_only_metas"           ON metas           FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_only_processos"       ON processos       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_only_entregas"        ON entregas        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_only_folha"           ON folha           FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_only_hub_data"        ON hub_data        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_only_hub_config"      ON hub_config      FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── CRM Clientes — dados cruzados Tiny (contatos + pedidos) ─────────────────
-- Alimentada diariamente pelo cron do backend (syncCrm.js)
CREATE TABLE IF NOT EXISTS crm_clientes (
  id              BIGSERIAL PRIMARY KEY,
  nome            TEXT NOT NULL,
  celular         TEXT NOT NULL DEFAULT '',
  telefone        TEXT NOT NULL DEFAULT '',
  telefones       JSONB NOT NULL DEFAULT '[]',
  ultimo_pedido   TEXT,
  dias_sem        INTEGER,
  temperatura     TEXT NOT NULL DEFAULT 'congelado',
  qtd_pedidos     INTEGER NOT NULL DEFAULT 0,
  ticket_medio    NUMERIC(10,2) NOT NULL DEFAULT 0,
  frequencia_dias INTEGER,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(nome)
);

CREATE INDEX IF NOT EXISTS idx_crm_temperatura   ON crm_clientes(temperatura);
CREATE INDEX IF NOT EXISTS idx_crm_atualizado_em ON crm_clientes(atualizado_em DESC);

ALTER TABLE crm_clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_only_crm_clientes" ON crm_clientes;
CREATE POLICY "service_only_crm_clientes" ON crm_clientes FOR ALL TO service_role USING (true) WITH CHECK (true);
