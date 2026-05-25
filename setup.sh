#!/bin/bash

# 🚀 Script de Setup Rápido - Donna Unha Hub v3.0
# Automatiza o setup completo

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  🚀 SETUP RÁPIDO - Donna Unha Hub v3.0                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. Verificar Node.js
echo -e "${YELLOW}1. Verificando Node.js...${NC}"
if ! command -v node &> /dev/null; then
  echo "❌ Node.js não instalado!"
  echo "   Instale em: https://nodejs.org"
  exit 1
fi
echo -e "${GREEN}✓${NC} Node.js $(node -v)"
echo ""

# 2. Verificar MySQL
echo -e "${YELLOW}2. Verificando MySQL...${NC}"
if ! command -v mysql &> /dev/null; then
  echo "❌ MySQL não instalado!"
  echo "   Instale em: https://dev.mysql.com/downloads/mysql/"
  exit 1
fi
echo -e "${GREEN}✓${NC} MySQL $(mysql --version)"
echo ""

# 3. Instalar dependências Node
echo -e "${YELLOW}3. Instalando dependências Node.js...${NC}"
cd backend
if [ ! -d "node_modules" ]; then
  npm install --silent
  echo -e "${GREEN}✓${NC} Dependências instaladas"
else
  echo -e "${GREEN}✓${NC} Dependências já instaladas"
fi
cd ..
echo ""

# 4. Configurar .env
echo -e "${YELLOW}4. Configurando variáveis de ambiente...${NC}"
if [ ! -f "backend/.env" ]; then
  cp backend/.env.example backend/.env
  echo -e "${GREEN}✓${NC} Arquivo .env criado"
  echo "   Edite com suas credenciais MySQL"
else
  echo -e "${GREEN}✓${NC} Arquivo .env já existe"
fi
echo ""

# 5. Setup banco de dados
echo -e "${YELLOW}5. Setup do banco de dados...${NC}"
read -p "   Seu usuário MySQL (padrão: root): " MYSQL_USER
MYSQL_USER=${MYSQL_USER:-root}

read -sp "   Sua senha MySQL: " MYSQL_PASS
echo ""

# Testar conexão
if mysql -u "$MYSQL_USER" -p"$MYSQL_PASS" -e "SELECT 1" &>/dev/null; then
  echo -e "${GREEN}✓${NC} Conexão MySQL OK"
  
  # Verificar se banco existe
  if mysql -u "$MYSQL_USER" -p"$MYSQL_PASS" -e "USE donna_hub" &>/dev/null; then
    echo "   Banco 'donna_hub' já existe"
    read -p "   Deseja recriar? (s/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Ss]$ ]]; then
      mysql -u "$MYSQL_USER" -p"$MYSQL_PASS" -e "DROP DATABASE donna_hub"
      mysql -u "$MYSQL_USER" -p"$MYSQL_PASS" < db-schema.sql
      echo -e "${GREEN}✓${NC} Banco recriado"
    fi
  else
    mysql -u "$MYSQL_USER" -p"$MYSQL_PASS" < db-schema.sql
    echo -e "${GREEN}✓${NC} Banco criado"
  fi
  
  # Seed inicial
  mysql -u "$MYSQL_USER" -p"$MYSQL_PASS" donna_hub < backend/seeds/initial-data.sql
  echo -e "${GREEN}✓${NC} Dados iniciais inseridos"
else
  echo "❌ Conexão MySQL falhou!"
  echo "   Verifique suas credenciais"
  exit 1
fi
echo ""

# 6. Atualizar .env com credenciais
echo -e "${YELLOW}6. Atualizando .env...${NC}"
sed -i.bak "s/DB_USER=.*/DB_USER=$MYSQL_USER/" backend/.env
sed -i.bak "s/DB_PASSWORD=.*/DB_PASSWORD=$MYSQL_PASS/" backend/.env
rm -f backend/.env.bak
echo -e "${GREEN}✓${NC} .env atualizado"
echo ""

# 7. Gerar JWT_SECRET
echo -e "${YELLOW}7. Gerando JWT_SECRET...${NC}"
JWT_SECRET=$(openssl rand -base64 32)
sed -i.bak "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" backend/.env
rm -f backend/.env.bak
echo -e "${GREEN}✓${NC} JWT_SECRET gerado"
echo ""

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  ✅ SETUP COMPLETO!                                           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "🚀 Para iniciar o sistema:"
echo ""
echo "  Terminal 1 (Backend):"
echo "    cd backend && npm run dev"
echo ""
echo "  Terminal 2 (Frontend):"
echo "    python3 -m http.server 8000"
echo ""
echo "  Acesse: http://localhost:8000/donna_hub_v3_index%20%286%29.html"
echo ""
echo "📝 Credenciais:"
echo "  Admin: admin / dona2024"
echo "  Gerente: gerente / gerente123"
echo "  Vendedor: vendedor1 / vend123"
echo ""
