-- Reset de usuários para Donna Unha Hub
-- Deleta todos os usuários e cria apenas o usuário admin principal.

DELETE FROM users;

INSERT INTO users (login, senha, nome, role, ativo, created_at) VALUES
('muriloroberto', 'Flamengosub20$', 'Murilo Roberto', 'admin', 1, NOW());
