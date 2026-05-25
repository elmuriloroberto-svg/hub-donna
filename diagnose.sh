#!/bin/bash

# 🔍 Script de Diagnóstico - Donna Unha Hub v3.0
# Verifica se tudo está configurado corretamente

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  🔍 DIAGNÓSTICO - Donna Unha Hub v3.0                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check() {
  if [ $1 -eq 0 ]; then
    echo -e "${GREEN}✓${NC} $2"
  else
    echo -e "${RED}✗${NC} $2"
  fi
}

warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

# 1. Verificar Node.js
echo "1️⃣  Verificando Node.js..."
if command -v node &> /dev/null; then
  NODE_V=$(node -v)
  check 0 "Node.js instalado: $NODE_V"
else
  check 1 "Node.js NÃO instalado"
  warn "Instale Node.js 18+: https://nodejs.org"
fi
echo ""

# 2. Verificar npm
echo "2️⃣  Verificando npm..."
if command -v npm &> /dev/null; then
  NPM_V=$(npm -v)
  check 0 "npm instalado: $NPM_V"
else
  check 1 "npm NÃO instalado"
fi
echo ""

# 3. Verificar MySQL
echo "3️⃣  Verificando MySQL..."
if command -v mysql &> /dev/null; then
  MYSQL_V=$(mysql --version)
  check 0 "MySQL instalado: $MYSQL_V"
else
  check 1 "MySQL NÃO instalado"
  warn "Instale MySQL 8.0+: https://dev.mysql.com/downloads/mysql/"
fi
echo ""

# 4. Verificar Python (para servidor HTTP)
echo "4️⃣  Verificando Python..."
if command -v python3 &> /dev/null; then
  PYTHON_V=$(python3 --version)
  check 0 "Python3 instalado: $PYTHON_V"
else
  check 1 "Python3 NÃO instalado (opcional)"
fi
echo ""

# 5. Verificar arquivos do projeto
echo "5️⃣  Verificando arquivos do projeto..."
FILES=(
  "donna_hub_v3_index (6).html"
  "api-client.js"
  "db-schema.sql"
  "database-model.md"
  "FRONTEND_INTEGRATION.md"
  "ARCHITECTURE.md"
  "CHANGELOG.md"
  "backend/server.js"
  "backend/package.json"
  "backend/.env.example"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    check 0 "Arquivo existe: $file"
  else
    check 1 "Arquivo FALTANDO: $file"
  fi
done
echo ""

# 6. Verificar backend setup
echo "6️⃣  Verificando setup do backend..."
if [ -d "backend/node_modules" ]; then
  check 0 "node_modules existe (dependências instaladas)"
else
  warn "Dependências NÃO instaladas"
  echo "   Execute: cd backend && npm install"
fi

if [ -f "backend/.env" ]; then
  check 0 "Arquivo .env configurado"
else
  check 1 "Arquivo .env FALTANDO"
  warn "Execute: cd backend && cp .env.example .env && nano .env"
fi
echo ""

# 7. Verificar banco de dados
echo "7️⃣  Verificando banco de dados MySQL..."
read -p "  Verificar se banco 'donna_hub' existe? (s/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Ss]$ ]]; then
  # Pedir credenciais
  read -p "  MySQL user (padrão: root): " MYSQL_USER
  MYSQL_USER=${MYSQL_USER:-root}
  
  if mysql -u "$MYSQL_USER" -e "SELECT 1 FROM donna_hub.users LIMIT 1;" &>/dev/null; then
    check 0 "Banco 'donna_hub' acessível"
    # Contar tabelas
    TABLES=$(mysql -u "$MYSQL_USER" -se "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'donna_hub'")
    echo "   $TABLES tabelas encontradas"
  else
    check 1 "Banco 'donna_hub' NÃO acessível"
    warn "Crie o banco: mysql -u root -p < db-schema.sql"
  fi
fi
echo ""

# 8. Verificar portas
echo "8️⃣  Verificando portas disponíveis..."
if ! lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null ; then
  check 0 "Porta 3001 disponível (backend)"
else
  check 1 "Porta 3001 JÁ ESTÁ EM USO"
  warn "Algo já está rodando na porta 3001"
fi

if ! lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null ; then
  check 0 "Porta 8000 disponível (frontend)"
else
  check 1 "Porta 8000 JÁ ESTÁ EM USO"
  warn "Algo já está rodando na porta 8000"
fi

if ! lsof -Pi :3306 -sTCP:LISTEN -t >/dev/null ; then
  check 1 "Porta 3306 DISPONÍVEL (MySQL não está rodando)"
  warn "Inicie MySQL: mysql.server start (Mac) ou sudo systemctl start mysql (Linux)"
else
  check 0 "Porta 3306 em uso (MySQL rodando)"
fi
echo ""

# 9. Resumo
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  📋 PRÓXIMOS PASSOS                                           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "1. Certifique-se que MySQL está rodando:"
echo "   macOS:  mysql.server start"
echo "   Linux:  sudo systemctl start mysql"
echo "   Windows: Inicie MySQL via Services"
echo ""
echo "2. Configure o banco de dados:"
echo "   mysql -u root -p < db-schema.sql"
echo "   mysql -u root -p donna_hub < backend/seeds/initial-data.sql"
echo ""
echo "3. Configure variáveis de ambiente:"
echo "   cd backend"
echo "   cp .env.example .env"
echo "   nano .env"
echo ""
echo "4. Instale dependências Node:"
echo "   cd backend"
echo "   npm install"
echo ""
echo "5. Inicie o servidor backend:"
echo "   npm run dev"
echo ""
echo "6. Em outro terminal, inicie frontend:"
echo "   python3 -m http.server 8000"
echo ""
echo "7. Acesse no navegador:"
echo "   http://localhost:8000/donna_hub_v3_index%20%286%29.html"
echo ""
echo "Credenciais padrão:"
echo "  Admin: admin / dona2024"
echo "  Gerente: gerente / gerente123"
echo "  Vendedor: vendedor1 / vend123"
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  📚 Documentação Útil                                         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "1. FRONTEND_INTEGRATION.md - Passo-a-passo da integração"
echo "2. ARCHITECTURE.md - Diagrama de arquitetura"
echo "3. backend/README.md - Documentação do backend"
echo "4. CHANGELOG.md - O que mudou nesta versão"
echo ""
echo "✅ Diagnóstico completo!"
