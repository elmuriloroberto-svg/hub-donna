-- ============================================================
-- Donna Hub v4 — Meta da Semana: "Meta Geral" (loja) vs "Meta por Vendedor"
-- Rodar no SQL Editor do Supabase antes de usar o toggle de tipo
-- no modal de Meta da Semana.
-- ============================================================

ALTER TABLE metas_semanais ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'individual';

ALTER TABLE metas_semanais DROP CONSTRAINT IF EXISTS metas_semanais_tipo_check;
ALTER TABLE metas_semanais ADD CONSTRAINT metas_semanais_tipo_check
  CHECK (tipo IN ('individual','geral'));

-- Trava de integridade: uma meta 'geral' sempre usa o mesmo vendedor_nome
-- sentinela. Isso faz o UNIQUE(vendedor_nome, data_inicio) já existente
-- funcionar como "no máximo 1 meta geral por semana", sem precisar mexer
-- na constraint nem no onConflict do upsert.
ALTER TABLE metas_semanais DROP CONSTRAINT IF EXISTS metas_semanais_tipo_sentinela_check;
ALTER TABLE metas_semanais ADD CONSTRAINT metas_semanais_tipo_sentinela_check
  CHECK (
    (tipo = 'geral'      AND vendedor_nome = '__GERAL__')
    OR
    (tipo = 'individual' AND vendedor_nome <> '__GERAL__')
  );
