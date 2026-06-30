-- Adiciona coluna tipo na tabela tasks
-- Execute no SQL Editor do Supabase antes de usar o seletor de tipo no Calendário
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'tarefa';
