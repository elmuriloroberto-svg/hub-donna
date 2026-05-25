# Donna Unha Hub v3.0
Sistema de gestão integrado para negócio de beleza

## Estrutura do Projeto

```
donna_hub_v3_index_organizado/
├── donna_hub_v3_index (6).html      # Frontend SPA (HTML5 + Vanilla JS)
├── api-client.js                     # Cliente HTTP para chamar backend
├── db-schema.sql                     # Schema MySQL
├── database-model.md                 # Documentação do modelo
├── FRONTEND_INTEGRATION.md           # Guia de integração
├── backend/                          # Node.js + Express
│   ├── server.js
│   ├── package.json
│   ├── .env.example
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
└── ...
```

## Setup Rápido

### 1. Frontend
```bash
python3 -m http.server 8000
# Acesso: http://localhost:8000/donna_hub_v3_index\ \(6\).html
```

### 2. Backend
```bash
cd backend
cp .env.example .env
npm install
npm run dev
# Acesso: http://localhost:3001
```

### 3. Banco de Dados
```bash
mysql -u root -p < db-schema.sql
mysql -u root -p donna_hub < backend/seeds/initial-data.sql
```

## Features

✅ Autenticação JWT
✅ RBAC (admin/gerente/vendedor)
✅ 10 módulos de gestão (Usuários, Clientes, Boletos, Tarefas, Metas, Processos, Entregas, Folha, Configuração, Dashboard)
✅ Persistência MySQL
✅ API RESTful completa
✅ Frontend responsivo
✅ Temas escuros suportados
✅ Impressão (Boletos, Etiquetas)
✅ Integração com Tiny ERP (API bridge)

## Tecnologias

- **Frontend**: HTML5, CSS3, Vanilla JavaScript ES6+
- **Backend**: Node.js, Express.js
- **Banco**: MySQL 8.0+
- **Autenticação**: JWT
- **Hashing**: bcryptjs (a implementar)
- **HTTP**: Fetch API

## Dados Sensíveis

❌ REMOVIDOS da tela de login:
- Demo credentials (donna123)
- Quick-login buttons
- Números fictícios de faturamento/pedidos

## Próximas Etapas

1. [ ] Integração frontend ↔ backend (ver `FRONTEND_INTEGRATION.md`)
2. [ ] Implementar hashing bcrypt para senhas
3. [ ] Rate limiting e validação de input
4. [ ] Testes automatizados (Jest)
5. [ ] CI/CD (GitHub Actions)
6. [ ] Deploy (Railway, Render, AWS)
7. [ ] Backup automático de banco
8. [ ] Logs e monitoring
9. [ ] Mobile app (React Native ou Flutter)
10. [ ] Integração com Stripe para pagamentos

## Contato & Suporte

Desenvolvido por Murilo para Donna Unha Hub
