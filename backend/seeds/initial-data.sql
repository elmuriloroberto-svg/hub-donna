-- Dados iniciais para Donna Unha Hub

-- Usuário Murilo único no sistema
INSERT INTO users (login, senha, nome, role, ativo, created_at) VALUES 
('murilo', 'Flamengosub20$', 'Murilo', 'admin', 1, NOW());

-- Nenhum outro usuário padrão configurado

-- Clientes de exemplo
INSERT INTO clientes (nome, tipo, telefone, email, endereco, cpf_cnpj, ativo, created_at) VALUES 
('Maria Silva', 'pessoa', '11987654321', 'maria@email.com', 'Rua A, 123', '12345678901', 1, NOW()),
('Salão Top', 'empresa', '1133334444', 'contato@salaotop.com.br', 'Av. B, 456', '12345678000100', 1, NOW()),
('Joana Costa', 'pessoa', '21998765432', 'joana@email.com', 'Rua C, 789', '98765432109', 1, NOW());

-- Configurações padrão
INSERT INTO config (config_key, config_value) VALUES 
('formula_custos', '22.18'),
('formula_cartao', '6.00'),
('moeda', 'BRL'),
('timezone', 'America/Sao_Paulo'),
('empresa_nome', 'Donna Unha Hub'),
('empresa_logo', 'https://...');
