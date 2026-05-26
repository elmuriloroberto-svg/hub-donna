-- ============================================================
-- Rubi Hub — Migração de Segurança (Supabase PostgreSQL)
-- Rodar no SQL Editor do Supabase
-- ============================================================

-- Tabela de usuários com senhas hasheadas (bcrypt)
CREATE TABLE IF NOT EXISTS rubi_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username    TEXT UNIQUE NOT NULL,
  nome        TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'vendedor'
              CHECK (role IN ('admin', 'gerente', 'vendedor', 'colaborador')),
  ativo       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para lookup rápido por username
CREATE INDEX IF NOT EXISTS idx_rubi_users_username ON rubi_users(username);

-- Tabela de tentativas de login (rate limiting stateful)
CREATE TABLE IF NOT EXISTS login_attempts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip         TEXT NOT NULL,
  username   TEXT NOT NULL,
  success    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip, created_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_cleanup ON login_attempts(created_at);

-- Limpeza automática de tentativas antigas (>24h) via trigger
CREATE OR REPLACE FUNCTION cleanup_old_attempts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM login_attempts WHERE created_at < NOW() - INTERVAL '24 hours';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_attempts ON login_attempts;
CREATE TRIGGER trg_cleanup_attempts
  AFTER INSERT ON login_attempts
  FOR EACH STATEMENT EXECUTE FUNCTION cleanup_old_attempts();

-- Row Level Security: apenas service_role acessa (nosso backend)
ALTER TABLE rubi_users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_only_users"    ON rubi_users;
DROP POLICY IF EXISTS "service_only_attempts" ON login_attempts;

CREATE POLICY "service_only_users"
  ON rubi_users FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_only_attempts"
  ON login_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);
