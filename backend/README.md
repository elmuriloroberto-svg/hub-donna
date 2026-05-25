# Donna Unha Hub - Backend (Node.js + Express + MySQL)

Backend da aplicação de gestão Donna Unha Hub v3.0

## Setup

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar ambiente
Criar arquivo `.env` baseado em `.env.example`:
```bash
cp .env.example .env
```

Editar `.env` com suas credenciais MySQL:
```env
DB_HOST=localhost
DB_USER=seu_usuario
DB_PASSWORD=sua_senha
DB_NAME=donna_hub
JWT_SECRET=sua_chave_super_secreta
```

### 3. Criar banco de dados
```bash
mysql -u root -p < ../../db-schema.sql
```

### 4. Inserir dados iniciais (opcional)
```bash
mysql -u root -p donna_hub < seeds/initial-data.sql
```

### 5. Iniciar servidor

**Desenvolvimento (com hot reload):**
```bash
npm run dev
```

**Produção:**
```bash
npm start
```

O servidor estará em `http://localhost:3001`

## API Endpoints

### Autenticação
- `POST /api/auth/login` - Login

### Usuários
- `GET /api/users` - Listar (admin/gerente)
- `POST /api/users` - Criar (admin)
- `PUT /api/users/:id` - Atualizar (admin)
- `DELETE /api/users/:id` - Remover (admin)

### Clientes
- `GET /api/clientes` - Listar
- `POST /api/clientes` - Criar
- `PUT /api/clientes/:id` - Atualizar
- `DELETE /api/clientes/:id` - Remover

### Boletos
- `GET /api/boletos/pagar` - Boletos a pagar
- `GET /api/boletos/receber` - Boletos a receber
- `POST /api/boletos/pagar` - Criar boleto pagar
- `PUT /api/boletos/pagar/:id` - Atualizar boleto
- `DELETE /api/boletos/pagar/:id` - Remover boleto

### Tarefas
- `GET /api/tasks` - Listar
- `POST /api/tasks` - Criar
- `PUT /api/tasks/:id` - Atualizar
- `DELETE /api/tasks/:id` - Remover

### Metas
- `GET /api/metas` - Listar
- `POST /api/metas` - Criar
- `PUT /api/metas/:id` - Atualizar

### Processos
- `GET /api/processos` - Listar
- `POST /api/processos` - Criar (admin/gerente)
- `PUT /api/processos/:id` - Atualizar (admin/gerente)
- `DELETE /api/processos/:id` - Remover (admin/gerente)

### Entregas
- `GET /api/entregas` - Listar
- `GET /api/entregas/resumo/uber` - Resumo Uber
- `POST /api/entregas` - Criar
- `DELETE /api/entregas/:id` - Remover

### Folha de Pagamento
- `GET /api/folha` - Listar (admin/gerente)
- `POST /api/folha` - Criar (admin/gerente)
- `DELETE /api/folha/:id` - Remover (admin/gerente)

### Config
- `GET /api/config` - Listar configurações
- `POST /api/config` - Salvar (admin/gerente)

### Hub
- `GET /api/hub` - Listar informações do Hub
- `GET /api/hub/:id` - Buscar uma informação específica
- `POST /api/hub` - Salvar nova informação do Hub
- `PUT /api/hub/:id` - Atualizar informação do Hub
- `DELETE /api/hub/:id` - Remover informação do Hub

### Dashboard
- `GET /api/dashboard` - Resumo dashboard

## Estrutura de Diretórios

```
backend/
├── config/
│   └── database.js          # Pool MySQL
├── middleware/
│   └── auth.js              # JWT & RBAC
├── routes/
│   ├── auth.js
│   ├── users.js
│   ├── clientes.js
│   ├── boletos.js
│   ├── tasks.js
│   ├── metas.js
│   ├── processos.js
│   ├── entregas.js
│   ├── folha.js
│   ├── config.js
│   └── dashboard.js
├── .env.example
├── package.json
├── server.js
└── README.md
```

## Autenticação

Todos os endpoints (exceto `/api/health` e `POST /api/auth/login`) requerem token JWT no header:

```bash
Authorization: Bearer <seu_token_jwt>
```

O token é válido por 7 dias (configurável em `.env`).

## RBAC (Role-Based Access Control)

- **admin**: Acesso total
- **gerente**: Acesso a administrativo (exceto usuários)
- **vendedor**: Acesso apenas a módulos de venda e tarefas

## Variáveis de Ambiente

| Variável | Descrição | Padrão |
|----------|-----------|---------|
| `NODE_ENV` | dev/production | development |
| `PORT` | Porta do servidor | 3001 |
| `DB_HOST` | Host MySQL | localhost |
| `DB_USER` | Usuário MySQL | root |
| `DB_PASSWORD` | Senha MySQL | (vazio) |
| `DB_NAME` | Nome do banco | donna_hub |
| `JWT_SECRET` | Chave JWT | (obrigatório) |
| `JWT_EXPIRE` | Expiração do token | 7d |

## Deploy

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

### Produção (Railway, Heroku, etc)
1. Variáveis de ambiente devem estar configuradas
2. Banco MySQL deve estar acessível remotamente
3. Executar `npm install && npm start`
