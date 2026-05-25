# Modelo de Banco de Dados para Donna Unha Hub v3

Este documento descreve o modelo de dados recomendado para transformar seu sistema atual em um aplicativo com banco de dados real.

## Visão geral das entidades

1. `users` - usuários do sistema (admin, gerente, vendedor)
2. `clientes` - clientes / salões / profissionais
3. `boletos_pagar` - boletos a pagar para fornecedores
4. `boletos_receber` - boletos a receber de clientes
5. `tasks` - tarefas da agenda
6. `metas` - metas comerciais por colaborador
7. `processos` - processos / wiki interna
8. `entregas` - entregas e valores Uber
9. `folha` - dados de folha de pagamento
10. `config` - configurações de fórmula e parâmetros

---

## MySQL / Relacional

### users
- `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
- `login` VARCHAR(50) UNIQUE NOT NULL
- `senha` VARCHAR(255) NOT NULL
- `nome` VARCHAR(120) NOT NULL
- `role` ENUM('admin','gerente','vendedor') NOT NULL
- `ativo` TINYINT(1) NOT NULL DEFAULT 1
- `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

### clientes
- `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
- `nome` VARCHAR(160) NOT NULL
- `tipo` VARCHAR(40) NOT NULL
- `telefone` VARCHAR(40)
- `email` VARCHAR(120)
- `endereco` VARCHAR(220)
- `cpf_cnpj` VARCHAR(30)
- `obs` TEXT
- `ativo` TINYINT(1) NOT NULL DEFAULT 1
- `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

### boletos_pagar
- `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
- `fornecedor` VARCHAR(160) NOT NULL
- `valor` DECIMAL(12,2) NOT NULL
- `vencimento` DATE NOT NULL
- `status` ENUM('pendente','pago','vencido') NOT NULL DEFAULT 'pendente'
- `obs` TEXT
- `created_by` BIGINT UNSIGNED NULL
- `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

### boletos_receber
- `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
- `cliente_id` BIGINT UNSIGNED NULL
- `valor` DECIMAL(12,2) NOT NULL
- `vencimento` DATE NOT NULL
- `status` ENUM('pendente','recebido','atrasado') NOT NULL DEFAULT 'pendente'
- `pedido` VARCHAR(80)
- `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

### tasks
- `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
- `titulo` VARCHAR(180) NOT NULL
- `descricao` TEXT
- `collab_id` BIGINT UNSIGNED NOT NULL
- `prazo` DATE
- `prio` ENUM('alta','media','baixa') NOT NULL DEFAULT 'media'
- `done` TINYINT(1) NOT NULL DEFAULT 0
- `delegado_por_id` BIGINT UNSIGNED
- `recorrente` TINYINT(1) NOT NULL DEFAULT 0
- `intervalo_dias` SMALLINT UNSIGNED
- `proxima_execucao` DATE
- `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

### metas
- `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
- `colaborador_id` BIGINT UNSIGNED NOT NULL
- `mes` VARCHAR(7) NOT NULL
- `meta_valor` DECIMAL(12,2) NOT NULL
- `realizado` DECIMAL(12,2) NOT NULL DEFAULT 0
- `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

### processos
- `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
- `titulo` VARCHAR(180) NOT NULL
- `categoria` VARCHAR(60) NOT NULL
- `conteudo` TEXT NOT NULL
- `autor_id` BIGINT UNSIGNED
- `criado_em` DATE NOT NULL
- `atualizado_em` DATE NOT NULL

### entregas
- `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
- `data` DATE NOT NULL
- `cliente_id` BIGINT UNSIGNED NULL
- `descricao` TEXT
- `valor_cobrado` DECIMAL(12,2) NOT NULL
- `valor_uber` DECIMAL(12,2) NOT NULL
- `status` VARCHAR(40) NOT NULL DEFAULT 'realizada'
- `obs` TEXT
- `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

### folha
- `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
- `colaborador_id` BIGINT UNSIGNED NOT NULL
- `mes` VARCHAR(7) NOT NULL
- `salario_base` DECIMAL(12,2) NOT NULL
- `comissao` DECIMAL(12,2) NOT NULL DEFAULT 0
- `bonus` DECIMAL(12,2) NOT NULL DEFAULT 0
- `descontos` DECIMAL(12,2) NOT NULL DEFAULT 0
- `total_liquido` DECIMAL(12,2) NOT NULL
- `obs` TEXT
- `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

### config
- `config_key` VARCHAR(80) PRIMARY KEY
- `config_value` TEXT
- `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

---

## Firestore / NoSQL

### Coleções recomendadas

- `users`
- `clientes`
- `boletos_pagar`
- `boletos_receber`
- `tasks`
- `metas`
- `processos`
- `entregas`
- `folha`
- `config`

### Estrutura de documento exemplo

`users/{userId}`
- login: string
- senha: string
- nome: string
- role: string
- ativo: boolean
- createdAt: timestamp
- updatedAt: timestamp

`clientes/{clienteId}`
- nome: string
- tipo: string
- telefone: string
- email: string
- endereco: string
- cpf_cnpj: string
- obs: string
- ativo: boolean
- createdAt: timestamp
- updatedAt: timestamp

`boletos_receber/{boletoId}`
- clienteId: reference or string
- valor: number
- vencimento: timestamp
- status: string
- pedido: string
- createdAt: timestamp
- updatedAt: timestamp

> Use `clienteId` como referência ao documento em `clientes` para manter relacionamentos.

---

## Tiny ERP / GAS

### Tiny ERP

Para integrar ao Tiny ERP, use as entidades:

- `customers` ou `thirds` para clientes
- `orders` para pedidos / recebíveis (pode ser modelado como contas a receber)
- `expenses` para boletos a pagar
- `tasks` pode ser tratado como `events` ou notas internas
- `stocks` e `products` para o módulo de etiquetas/estoque

### Google Apps Script (GAS)

Use planilhas separadas como tabelas:

- `Usuarios`
- `Clientes`
- `BoletosPagar`
- `BoletosReceber`
- `Tarefas`
- `Metas`
- `Processos`
- `Entregas`
- `Folha`
- `Config`

Cada aba deve ter cabeçalho na primeira linha e os mesmos campos do modelo relacional.

---

## Recomendação de próximos passos

1. Adote `users` e `clientes` como principais entidades de relacionamento.
2. Conecte `boletos_receber` e `entregas` a `cliente_id`.
3. Armazene `config` em chave/valor para fórmulas e taxas.
4. Se quiser, posso gerar o SQL completo de criação de tabelas e o modelo Firestore pronto para usar.
