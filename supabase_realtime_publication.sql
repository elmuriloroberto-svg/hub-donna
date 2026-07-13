-- Habilita o Supabase Realtime nas tabelas que o relay (realtime-relay/)
-- precisa ouvir para avisar o navegador de mudanças. Rodar manualmente no
-- SQL Editor do Supabase (mesma convenção dos outros supabase_*.sql deste
-- projeto — não existe migration runner automático).
--
-- Isso NÃO altera RLS nem abre nenhuma policy nova: o relay conecta com a
-- service key (bypassa RLS, igual ao backend hoje), então nada muda em
-- termos de quem pode ler o quê — só habilita a publicação interna do
-- Postgres que o Realtime usa pra saber quais tabelas transmitir.

ALTER PUBLICATION supabase_realtime ADD TABLE
  tasks,
  clientes,
  crm_clientes,
  boletos_pagar,
  boletos_receber,
  metas,
  metas_semanais,
  metas_mensais,
  folha,
  folha_ponto,
  processos,
  entregas,
  hub_data;

-- calendario_eventos: tabela ainda não existe em produção (feature
-- planejada, dashboard.js já tem fallback silencioso pra isso).
-- Adicionar aqui quando a tabela for criada.
