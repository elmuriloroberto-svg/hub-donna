# ✅ CHECKLIST - Donna Unha Hub v3.0

## 📋 PRÉ-REQUISITOS
- [ ] Node.js 18+ instalado
- [ ] MySQL 8.0+ instalado
- [ ] Python 3 instalado (para servidor HTTP)
- [ ] Git instalado (opcional)
- [ ] Terminal/CMD disponível

## 🏗️ SETUP AUTOMÁTICO (Recomendado)
```bash
chmod +x setup.sh
./setup.sh
```

OU configure manualmente seguindo os passos abaixo:

## 🔧 SETUP MANUAL

### 1. Verificar Dependências
- [ ] Node.js: `node -v` (deve ser v18+)
- [ ] npm: `npm -v` (deve ser v9+)
- [ ] MySQL: `mysql --version` (deve ser 8.0+)
- [ ] Python: `python3 --version` (v3.8+)

### 2. Banco de Dados
```bash
# Criar banco e tabelas
mysql -u root -p < db-schema.sql

# Inserir dados iniciais
mysql -u root -p donna_hub < backend/seeds/initial-data.sql

# Verificar
mysql -u root -p
> USE donna_hub;
> SELECT * FROM users;
```
- [ ] Banco `donna_hub` criado
- [ ] 10 tabelas criadas
- [ ] Dados iniciais inseridos
- [ ] 4 usuários padrão existem

### 3. Backend (Node.js/Express)
```bash
cd backend

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas credenciais MySQL

# Instalar dependências
npm install

# Testar sintaxe
npm run dev
```
- [ ] `backend/.env` configurado
- [ ] `node_modules` criado
- [ ] Porta 3001 disponível
- [ ] Banco MySQL acessível
- [ ] Servidor iniciando sem erros

### 4. Frontend
```bash
# Voltar para diretório raiz
cd ..

# Servidor HTTP
python3 -m http.server 8000
```
- [ ] Arquivo HTML existe: `donna_hub_v3_index (6).html`
- [ ] Arquivo API client existe: `api-client.js`
- [ ] Porta 8000 disponível
- [ ] Servidor HTTP rodando

### 5. Testes Básicos

#### Teste 1: Verificar Frontend
```bash
# No navegador:
http://localhost:8000/donna_hub_v3_index%20%286%29.html
```
- [ ] Login screen carrega
- [ ] Sem números fictícios visíveis
- [ ] Sem credenciais demo visíveis
- [ ] Input fields funcionam

#### Teste 2: Verificar Backend
```bash
curl http://localhost:3001/api/health
# Deve retornar: {"ok":true,"message":"API Donna Unha Hub v3.0"}
```
- [ ] API responde na porta 3001
- [ ] Health check retorna sucesso

#### Teste 3: Autenticação
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"admin","senha":"dona2024","role":"admin"}'

# Deve retornar JWT token
```
- [ ] Login endpoint funciona
- [ ] Token JWT gerado
- [ ] Token no formato correto

#### Teste 4: Autorização
```bash
# Com token de admin
curl -X GET http://localhost:3001/api/users \
  -H "Authorization: Bearer <seu_token>"

# Deve retornar lista de usuários
```
- [ ] Authorization header aceito
- [ ] Token validado
- [ ] Dados retornados

#### Teste 5: RBAC
```bash
# Tentar acessar com role vendedor deve ser negado para certas rotas
```
- [ ] Admin pode acessar tudo
- [ ] Gerente pode acessar administrativo
- [ ] Vendedor tem acesso limitado

## 🔐 Segurança

- [ ] Dados sensíveis removidos da UI
- [ ] Credenciais demo removidas
- [ ] JWT_SECRET configurado em .env
- [ ] .env não está no Git (verificar .gitignore)
- [ ] Senha em plaintext no seed (implementar bcryptjs depois)
- [ ] CORS configurado corretamente

## 📊 Validações Técnicas

- [ ] JavaScript syntax valid: `node --check donna_hub_v3_index\ \(6\).html`
- [ ] MySQL schema válido
- [ ] Express server inicia sem erros
- [ ] API client sem erros de sintaxe
- [ ] Todas as rotas cadastradas

## 🧪 Testes Funcionais

### Login
- [ ] Login com admin/dona2024 funciona
- [ ] Login com gerente/gerente123 funciona
- [ ] Login com vendedor1/vend123 funciona
- [ ] Login com senha errada falha
- [ ] Login com role errado falha

### Dashboard
- [ ] Dashboard carrega dados (vencidos, tarefas, etc.)
- [ ] Números mudam conforme dados no banco
- [ ] Sem números fictícios

### Usuários
- [ ] Listar usuários funciona (admin/gerente)
- [ ] Criar usuário funciona (admin)
- [ ] Editar usuário funciona (admin)
- [ ] Deletar usuário funciona (admin)
- [ ] Vendedor não pode criar usuários

### Clientes
- [ ] Listar clientes funciona
- [ ] Criar cliente funciona
- [ ] Editar cliente funciona
- [ ] Deletar cliente funciona
- [ ] Busca de clientes funciona

### Boletos
- [ ] Listar boletos a pagar funciona
- [ ] Listar recebíveis funciona
- [ ] Criar boleto funciona
- [ ] Status de boleto pode ser alterado

### Tarefas
- [ ] Criar tarefa funciona
- [ ] Atribuir a colaborador funciona
- [ ] Marcar como concluída funciona
- [ ] Tarefas aparecem no dashboard

## 📱 Responsividade

- [ ] Interface funciona em desktop (1920px)
- [ ] Interface funciona em tablet (768px)
- [ ] Interface funciona em mobile (375px)
- [ ] Temas escuros funcionam

## 🖨️ Funcionalidades Especiais

- [ ] Impressão de boletos funciona
- [ ] Impressão de etiquetas funciona
- [ ] PDF gerado corretamente

## 📝 Documentação

- [ ] README.md completo
- [ ] ARCHITECTURE.md com diagramas
- [ ] FRONTEND_INTEGRATION.md com passos
- [ ] CHANGELOG.md atualizado
- [ ] backend/README.md completo
- [ ] Comentários no código

## 🚀 Deploy (Opcional)

- [ ] Docker container criado
- [ ] docker-compose.yml para orquestração
- [ ] GitHub Actions CI/CD configurado
- [ ] Variáveis de produção em .env.production
- [ ] HTTPS configurado
- [ ] Domínio apontando para servidor

## 🔄 Integração Contínua

- [ ] Testes unitários (Jest)
- [ ] Testes de integração (Supertest)
- [ ] Linting (ESLint)
- [ ] Coverage > 80%

## ✨ Features Adicionais (Nice to Have)

- [ ] Notificações em tempo real (WebSocket)
- [ ] Temas personalizáveis
- [ ] Multi-idioma
- [ ] Modo offline
- [ ] Backup automático
- [ ] Logging de auditoria

## 📞 Troubleshooting

### Erro: "EADDRINUSE"
- [ ] Porta já em uso
- [ ] Solução: mude a porta em .env

### Erro: "Cannot connect to MySQL"
- [ ] MySQL não está rodando
- [ ] Credenciais erradas em .env
- [ ] Solução: verificar com `mysql -u root -p`

### Erro: "Invalid token"
- [ ] JWT_SECRET não bate
- [ ] Token expirado
- [ ] Solução: fazer login novamente

### Erro: "403 Forbidden"
- [ ] Usuário não tem permissão
- [ ] Role incorreto
- [ ] Solução: usar conta com role apropriado

### Erro: "CORS error"
- [ ] CORS não está configurado
- [ ] URL do frontend não autorizada
- [ ] Solução: verificar server.js

## ✅ Conclusão

- [ ] Todos os testes passaram
- [ ] Documentação completa
- [ ] Sistema pronto para integração completa
- [ ] Dados sensíveis removidos
- [ ] Backend funcional

**Status**: ✅ Sistema v3.0 testado e validado!

---

Data de Conclusão: _____________
Testado por: _____________
Observações: _____________
