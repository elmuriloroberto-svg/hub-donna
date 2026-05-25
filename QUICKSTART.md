# 🚀 INÍCIO RÁPIDO - Donna Unha Hub v3.0

## ⚡ 5 Minutos de Setup

### Opção 1: Setup Automático (Recomendado)
```bash
chmod +x setup.sh
./setup.sh
```
Depois siga os prompts na tela.

### Opção 2: Setup Manual

**Terminal 1 - Backend:**
```bash
cd backend
cp .env.example .env
# Editar .env com suas credenciais MySQL
npm install
npm run dev
```

**Terminal 2 - Banco de Dados:**
```bash
mysql -u root -p < db-schema.sql
mysql -u root -p donna_hub < backend/seeds/initial-data.sql
```

**Terminal 3 - Frontend:**
```bash
python3 -m http.server 8000
```

**Acesse:**
```
http://localhost:8000/donna_hub_v3_index%20%286%29.html
```

## 🔑 Credenciais de Teste

| Role | Login | Senha |
|------|-------|-------|
| Admin | `admin` | `dona2024` |
| Gerente | `gerente` | `gerente123` |
| Vendedor | `vendedor1` | `vend123` |

## 📂 Estrutura do Projeto

```
.
├── 📄 donna_hub_v3_index (6).html     ← Frontend
├── 📜 api-client.js                   ← Cliente HTTP
├── 📚 Documentação
│   ├── README.md                      ← Visão geral
│   ├── ARCHITECTURE.md                ← Diagrama técnico
│   ├── FRONTEND_INTEGRATION.md        ← Como integrar
│   ├── CHANGELOG.md                   ← O que mudou
│   ├── CHECKLIST.md                   ← Validações
│   └── QUICKSTART.md                  ← Este arquivo
├── 🗄️ Banco de Dados
│   ├── db-schema.sql                  ← DDL MySQL
│   └── database-model.md              ← Documentação do modelo
├── 🔧 Backend
│   ├── server.js                      ← Express server
│   ├── package.json                   ← Dependências
│   ├── .env.example                   ← Template de config
│   ├── config/
│   │   └── database.js
│   ├── middleware/
│   │   └── auth.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── users.js
│   │   ├── clientes.js
│   │   ├── boletos.js
│   │   ├── tasks.js
│   │   ├── metas.js
│   │   ├── processos.js
│   │   ├── entregas.js
│   │   ├── folha.js
│   │   ├── config.js
│   │   └── dashboard.js
│   ├── seeds/
│   │   └── initial-data.sql
│   └── README.md
├── 🛠️ Scripts de Setup
│   ├── diagnose.sh                    ← Diagnóstico
│   └── setup.sh                       ← Setup automático
└── .gitignore
```

## 🔍 Diagnosis Rápido

```bash
# Verificar se tudo está OK
chmod +x diagnose.sh
./diagnose.sh
```

## ✨ O Que Mudou Nesta Versão

✅ **Removido:**
- Dados sensíveis da tela de login
- Credenciais demo (donna123)
- Números fictícios (R$84k, 127, 3)
- Função `quickLogin()`

✅ **Adicionado:**
- Backend Node.js + Express
- Autenticação JWT
- RBAC (admin/gerente/vendedor)
- 11 endpoints de API
- MySQL com 10 tabelas
- API Client JavaScript
- Documentação completa

## 🧪 Testes Rápidos

```bash
# 1. Verificar se backend está respondendo
curl http://localhost:3001/api/health

# 2. Fazer login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"admin","senha":"dona2024","role":"admin"}'

# 3. Listar usuários (com token)
curl -X GET http://localhost:3001/api/users \
  -H "Authorization: Bearer <seu_token>"
```

## 📱 URLs Importantes

| URL | Descrição |
|-----|-----------|
| `http://localhost:8000` | Frontend HTML |
| `http://localhost:3001` | Backend API |
| `http://localhost:3001/api/health` | Health check |

## 🔒 Segurança

- JWT tokens válidos por 7 dias
- Senhas ainda em plaintext (TODO: bcryptjs)
- CORS habilitado para localhost
- RBAC implementado

## 📚 Próximos Passos

1. **Integração Frontend:** Incluir `api-client.js` no HTML e atualizar `handleLogin()`
2. **Hashing de Senhas:** Implementar bcryptjs
3. **Testes:** Jest + Supertest
4. **Deploy:** Docker + Railway

## 🆘 Precisa de Ajuda?

1. Leia [FRONTEND_INTEGRATION.md](FRONTEND_INTEGRATION.md)
2. Verifique [ARCHITECTURE.md](ARCHITECTURE.md)
3. Rode `./diagnose.sh` para diagnosticar problemas
4. Consulte [CHECKLIST.md](CHECKLIST.md) para validar setup

## ⌨️ Comandos Úteis

```bash
# Recriar banco
mysql -u root -p donna_hub < backend/seeds/initial-data.sql

# Ver logs do backend
tail -f backend/logs/error.log

# Resetar JWT_SECRET
openssl rand -base64 32

# Testar conexão MySQL
mysql -u root -p -e "SELECT 1 FROM donna_hub.users;"

# Listar processos usando portas
lsof -i :3001  # Backend
lsof -i :8000  # Frontend
lsof -i :3306  # MySQL
```

## 🎯 Status Atual

| Componente | Status |
|-----------|--------|
| Frontend | ✅ Funcional |
| Backend | ✅ Funcional |
| Banco de Dados | ✅ Pronto |
| Autenticação | ✅ Implementada |
| RBAC | ✅ Implementado |
| Documentação | ✅ Completa |
| Dados Sensíveis | ✅ Removidos |
| Integração FE-BE | 🔄 Próximo passo |

## 💡 Dicas

- Use `nodemon` em desenvolvimento (automata reload)
- Teste com Postman ou Insomnia para APIs
- Use `DevTools` do navegador para debug
- Verifique `.env` se tiver erros de conexão
- Mantenha MySQL rodando sempre

## 📞 Contato

Para dúvidas, consulte a documentação do projeto ou rode:
```bash
./diagnose.sh
```

---

**Versão:** 3.0.0  
**Status:** ✅ Pronto para uso  
**Próxima versão:** Integração completa FE-BE
