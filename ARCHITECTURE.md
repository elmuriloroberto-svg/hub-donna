# Arquitetura Donna Unha Hub v3.0

```
┌─────────────────────────────────────────────────────────────────┐
│                    🌐 FRONTEND - BROWSER                        │
│  HTML5 + Vanilla JavaScript + localStorage (cache)              │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ donna_hub_v3_index (6).html                              │  │
│  │                                                          │  │
│  │  Módulos:                                                │  │
│  │  • Dashboard (KPIs em tempo real)                        │  │
│  │  • Usuários (CRUD com RBAC)                             │  │
│  │  • Clientes (Filtro, Busca)                             │  │
│  │  • Boletos (Pagar/Receber)                              │  │
│  │  • Tarefas (Delegação, Recorrência)                     │  │
│  │  • Metas (Por colaborador/mês)                          │  │
│  │  • Processos (Documentação)                             │  │
│  │  • Entregas (Uber + manual)                             │  │
│  │  • Folha de Pagamento                                   │  │
│  │  • Configurações                                        │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            ↓                                     │
│                    api-client.js                                │
│            (Fetch com Authorization header)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    │ REST API Calls  │
                    │  (JSON + JWT)   │
                    └────────┬────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
            ↓                ↓                ↓
┌──────────────────────────────────────────────────────────────────┐
│                  🔷 BACKEND - Node.js/Express                    │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ server.js (PORT: 3001)                                    │ │
│  │                                                           │ │
│  │  Routes:                                                 │ │
│  │  POST   /api/auth/login         → JWT Token             │ │
│  │  GET    /api/users              → Lista usuários        │ │
│  │  POST   /api/users              → Criar usuário         │ │
│  │  PUT    /api/users/:id          → Atualizar usuário     │ │
│  │  DELETE /api/users/:id          → Remover usuário       │ │
│  │  GET    /api/clientes           → Lista clientes        │ │
│  │  POST   /api/clientes           → Criar cliente         │ │
│  │  GET    /api/boletos/pagar      → Boletos a pagar       │ │
│  │  GET    /api/boletos/receber    → Recebíveis            │ │
│  │  GET    /api/tasks              → Tarefas               │ │
│  │  POST   /api/tasks              → Criar tarefa          │ │
│  │  GET    /api/metas              → Metas                 │ │
│  │  GET    /api/processos          → Processos             │ │
│  │  GET    /api/entregas           → Entregas              │ │
│  │  GET    /api/folha              → Folha de pagamento    │ │
│  │  GET    /api/dashboard          → Dashboard data        │ │
│  │                                                           │ │
│  └────────────────────────────────────────────────────────────┘ │
│                            ↓                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Middleware:                                               │ │
│  │ • Authentication (JWT verification)                      │ │
│  │ • Authorization (RBAC - admin/gerente/vendedor)         │ │
│  │ • CORS                                                   │ │
│  │ • Error Handling                                         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                            ↓                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ config/database.js                                        │ │
│  │ (MySQL2 Connection Pool)                                 │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────┬───────────────────────────────────────────┘
                     │
                     ↓
        ┌────────────────────────┐
        │   🗄️  MYSQL Database   │
        │                        │
        │  Database: donna_hub   │
        │  Tables: 10            │
        │  Port: 3306            │
        └────────────────────────┘

```

## Fluxo de Autenticação

```
Login Screen
    ↓
[User Input: login, password, role]
    ↓
API.login(login, senha, role)
    ↓
POST /api/auth/login
    ↓
Middleware: Verify credentials (user exists, role matches)
    ↓
Generate JWT Token
    ↓
Return { token, user: { login, nome, role } }
    ↓
localStorage.setItem('token', token)
    ↓
API.setToken(token)
    ↓
API.getUsers(), API.getClientes(), etc.
    ↓
All requests now include:
Header: Authorization: Bearer <token>
    ↓
Middleware: authenticateToken()
    ↓
Verify JWT signature
    ↓
req.user populated with { id, login, nome, role }
    ↓
Process request
    ↓
Return data
```

## Fluxo de Autorização (RBAC)

```
User logged in as 'vendedor' tries to access admin feature

User clicks "Delete User"
    ↓
JavaScript calls: API.deleteUser(id)
    ↓
DELETE /api/users/:id
    ↓
Request Headers: Authorization: Bearer <token>
    ↓
authenticateToken() middleware
    ↓
Decode JWT → req.user = { role: 'vendedor' }
    ↓
authorize('admin') middleware
    ↓
Check: req.user.role in ['admin'] ?
    ↓
NO → 403 Forbidden { ok: false, msg: 'Acesso negado' }
    ↓
Frontend shows toast: "Acesso negado"
    ↓
UI button for "Delete" is hidden (applyRBAC('vendedor'))
```

## Stack Tecnológico

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Frontend | HTML5 + CSS3 + Vanilla JS | ES6+ |
| Backend | Node.js | 18+ |
| Framework | Express.js | 4.18+ |
| Banco | MySQL | 8.0+ |
| Autenticação | JWT (jsonwebtoken) | 9.1.0 |
| Hashing | bcryptjs | 2.4.3 |
| HTTP Client | Fetch API | Native |
| CORS | cors | 2.8.5 |

## Segurança

- ✅ JWT tokens (7 dias de expiração)
- ✅ RBAC (3 roles definidos)
- ✅ Senha hasheada (bcryptjs)
- ✅ CORS habilitado
- ✅ Validação de input no backend
- ⚠️ TODO: Rate limiting
- ⚠️ TODO: HTTPS em produção
- ⚠️ TODO: Helmet.js para segurança de headers

## Deploy

### Local
```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
python3 -m http.server 8000
```

### Produção (Railway, Render, AWS)
- MySQL hospedado (RDS, Planetscale, etc)
- Backend em container (Docker)
- Frontend servido via CDN (Cloudflare, Vercel)
- Domínio SSL
- Variáveis de ambiente no provedor

## Escalabilidade

Para crescimento futuro:

```
┌─────────────────────────────────────────┐
│         Cloudflare CDN                  │
│      (Static Files + Caching)           │
└────────────────┬────────────────────────┘
                 │
┌────────────────┼────────────────────────┐
│  Load Balancer (Nginx)                  │
└────────────────┼────────────────────────┘
                 │
    ┌────────────┼────────────┐
    ↓            ↓            ↓
  [BE-1]       [BE-2]       [BE-3]
Backend Pod 1  Backend Pod 2  Backend Pod 3
  (Docker)     (Docker)      (Docker)
    │            │            │
    └────────────┼────────────┘
                 ↓
        ┌───────────────────┐
        │ MySQL Primary     │
        │ (Read/Write)      │
        └─────────┬─────────┘
                  │
        ┌─────────┴──────────┐
        ↓                    ↓
    [Read Replica 1]    [Read Replica 2]
        (Backup)         (Analytics)
```

## Monitoramento

Implementar:
- Winston.js (logging)
- Sentry.io (error tracking)
- Datadog (metrics)
- CloudWatch (AWS)

```javascript
// Exemplo: Log estruturado
logger.info('User login', { 
  userId: 123, 
  role: 'admin', 
  timestamp: new Date(),
  ip: req.ip 
});
```

## Backup

Automatizar:
- Backup diário MySQL (S3)
- Logs centralizados
- GitHub para source code
- Disaster recovery plan
