-- ═══════════════════════════════════════════════════════════════════
-- DONNA HUB v5.0 — Migration 004 — Épico 4: Calendário & Tarefas
-- Executar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS emoji         TEXT         DEFAULT '',
  ADD COLUMN IF NOT EXISTS data_inicio   DATE,
  ADD COLUMN IF NOT EXISTS data_fim      DATE,
  ADD COLUMN IF NOT EXISTS para_todos    BOOLEAN      DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS concluido_por TEXT,
  ADD COLUMN IF NOT EXISTS concluido_em  TIMESTAMPTZ;

-- Migra prazo → data_inicio para registros existentes
UPDATE tasks SET data_inicio = prazo::DATE WHERE data_inicio IS NULL AND prazo IS NOT NULL;

-- Índice para view de calendário (filtra por mês em data_inicio)
CREATE INDEX IF NOT EXISTS idx_tasks_data_inicio ON tasks(data_inicio);

COMMENT ON COLUMN tasks.emoji         IS 'Emoji opcional exibido antes do título da tarefa';
COMMENT ON COLUMN tasks.data_inicio   IS 'Data de início da tarefa (substitui prazo para novas tarefas)';
COMMENT ON COLUMN tasks.data_fim      IS 'Data limite / data de conclusão esperada';
COMMENT ON COLUMN tasks.para_todos    IS 'TRUE quando a tarefa foi delegada para toda a equipa';
COMMENT ON COLUMN tasks.concluido_por IS 'Nome do colaborador que marcou como concluída';
COMMENT ON COLUMN tasks.concluido_em  IS 'Timestamp da conclusão';
