# Integração Frontend-Backend

Guia para integrar o frontend HTML com o backend Node.js/Express.

## 1. Incluir API Client

Adicionar no `<head>` do HTML, ANTES do seu script principal:

```html
<script src="api-client.js"></script>
```

## 2. Atualizar função gasRun()

Substituir a lógica do `gasRun()` para usar a API:

```javascript
async function gasRun(fn, ...args) {
  try {
    const response = await API.request('POST', `/custom/${fn}`, { args });
    return response.data;
  } catch (err) {
    showToast('Erro: ' + err.message);
    return null;
  }
}
```

Ou chamar os métodos específicos da API:

```javascript
// Antes (localStorage)
const users = loadUsers();  // Retorna S.users

// Depois (API)
const result = await API.getUsers();
const users = result.data;
```

## 3. Atualizar handleLogin()

```javascript
async function handleLogin() {
  const user = document.getElementById('inp-user').value.trim();
  const pass = document.getElementById('inp-pass').value.trim();
  const role = document.getElementById('inp-role').value;

  if (!user || !pass || !role) {
    showLoginErr('Preencha todos os campos');
    return;
  }

  showSpinner('login-spin', true);

  try {
    const result = await API.login(user, pass, role);
    
    API.setToken(result.token);
    S.user = result.user;
    
    // Carregar dados do servidor
    await loadAllData();
    
    showLoginScreen(false);
  } catch (err) {
    showLoginErr(err.message);
  } finally {
    showSpinner('login-spin', false);
  }
}
```

## 4. Atualizar funções de CRUD

### Antes (localStorage)
```javascript
function addUser() {
  const nome = document.getElementById('new-nome').value.trim();
  const role = document.getElementById('new-role').value;
  
  if (!nome || !role) {
    showToast('Preencha os campos');
    return;
  }
  
  S.users.push({ id: Date.now(), nome, role, ativo: true });
  saveLocalData();
  renderUsers();
}
```

### Depois (API)
```javascript
async function addUser() {
  const nome = document.getElementById('new-nome').value.trim();
  const role = document.getElementById('new-role').value;
  const login = document.getElementById('new-login').value.trim();
  const senha = document.getElementById('new-senha').value.trim();
  
  if (!nome || !role || !login || !senha) {
    showToast('Preencha todos os campos');
    return;
  }
  
  try {
    await API.createUser(login, senha, nome, role);
    showToast('Usuário criado com sucesso');
    
    // Recarregar lista
    const result = await API.getUsers();
    S.users = result.data;
    renderUsers();
    closeUserModal();
  } catch (err) {
    showToast('Erro: ' + err.message);
  }
}
```

## 5. Atualizar loadLocalData()

```javascript
async function loadAllData() {
  try {
    // Carregar em paralelo
    const [users, clientes, boletos, tasks, metas, dashboard] = await Promise.all([
      API.getUsers().catch(() => ({ data: [] })),
      API.getClientes().catch(() => ({ data: [] })),
      API.getBoletoPagar().catch(() => ({ data: [] })),
      API.getTasks().catch(() => ({ data: [] })),
      API.getMetas().catch(() => ({ data: [] })),
      API.getDashboard().catch(() => ({ data: {} }))
    ]);

    S.users = users.data || [];
    S.clientes = clientes.data || [];
    S.boletos_pagar = boletos.data || [];
    S.tarefas = tasks.data || [];
    S.metas = metas.data || [];

    // Renderizar UI
    loadDashboard();
    renderUsers();
    renderClientes();
  } catch (err) {
    console.error('Erro ao carregar dados:', err);
  }
}
```

## 6. Tratamento de Erros e Autenticação

Interceptar 401 para logout automático:

```javascript
// Adicionar ao api-client.js
async request(method, endpoint, body = null) {
  // ... código anterior ...

  try {
    const response = await fetch(...);
    const data = await response.json();

    if (response.status === 401) {
      // Token expirado
      localStorage.removeItem('token');
      this.token = null;
      showLoginScreen(true);
      showToast('Sessão expirada. Faça login novamente.');
      return;
    }

    if (!response.ok) {
      throw new Error(data.msg || `Erro ${response.status}`);
    }

    return data;
  } catch (err) {
    // ...
  }
}
```

## 7. Configurar .env do Backend

```env
NODE_ENV=development
PORT=3001
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=sua_senha
DB_NAME=donna_hub
JWT_SECRET=sua_chave_super_secreta
JWT_EXPIRE=7d
```

## 8. Executar Backend

```bash
cd backend
npm install
npm run dev  # Desenvolvimento com nodemon
```

O frontend estará disponível em `http://localhost:3001`

## 9. Remover localStorage

Após validar que tudo funciona com a API, remover as funções de localStorage:

```javascript
// REMOVER (deprecated)
function saveLocalData() { /* ... */ }
function loadLocalData() { /* ... */ }
function dbGet() { /* ... */ }
function dbSet() { /* ... */ }
```

## Checklist de Migração

- [ ] Incluir `api-client.js`
- [ ] Banco MySQL criado e rodando
- [ ] Backend Node.js instalado e rodando
- [ ] `handleLogin()` atualizado para chamar API
- [ ] `loadAllData()` carrega da API
- [ ] `addUser()` cria via API
- [ ] `addCliente()` cria via API
- [ ] Dashboard carrega dados reais
- [ ] Testes em 3 navegadores
- [ ] Logout remove token
- [ ] 401 redireciona para login

## Troubleshooting

### "CORS error"
- Verificar se `cors()` está em `server.js`
- URL do API_BASE está correta?

### "Token inválido"
- Verificar `JWT_SECRET` em `.env`
- Token não está sendo enviado no header

### "Conexão recusada"
- Backend está rodando? (`npm run dev`)
- Porta correta? (3001)

### "Credenciais inválidas"
- Usuário existe no banco? (`SELECT * FROM users;`)
- Role está correto (admin/gerente/vendedor)?
- Senha está armazenada em plaintext? (implementar bcrypt depois)
