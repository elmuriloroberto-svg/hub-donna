-- Folha de Ponto — execute no SQL Editor do Supabase antes de usar o módulo
-- Também crie manualmente o bucket "ponto-fotos" em Storage > Buckets (privado)

CREATE TABLE IF NOT EXISTS folha_ponto (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID NOT NULL REFERENCES rubi_users(id) ON DELETE CASCADE,
  data        DATE NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('chegada','saida_almoco','retorno_almoco','saida')),
  hora        TIME NOT NULL,
  foto_path   TEXT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT  uq_ponto UNIQUE (usuario_id, data, tipo)
);

CREATE INDEX IF NOT EXISTS idx_ponto_data       ON folha_ponto (data);
CREATE INDEX IF NOT EXISTS idx_ponto_usuario_data ON folha_ponto (usuario_id, data);
