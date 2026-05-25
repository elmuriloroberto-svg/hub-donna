# Deploy no Vercel com banco de dados gratuito

Este projeto agora está preparado para deploy no Vercel como frontend + API.

## O que foi configurado
- `vercel.json` para servir o frontend estático e as rotas `/api/*`
- `api/index.js` para rodar o backend Express como função serverless
- `backend/app.js` separa a aplicação Express da execução local
- `package.json` na raiz para permitir deploy no Vercel

## Banco de dados gratuito recomendado
Use um serviço gratuito de MySQL compatível, como:
- PlanetScale (https://planetscale.com)
- Neon ou Supabase (PostgreSQL) - se quiser migrar depois

### Sugestão rápida: PlanetScale
1. Crie uma conta gratuita no PlanetScale
2. Crie um database
3. Gere uma branch de deploy e copie a string de conexão
4. Configure as variáveis de ambiente no Vercel:
   - `DB_HOST`
   - `DB_PORT`
   - `DB_USER`
   - `DB_PASSWORD`
   - `DB_NAME`
   - `JWT_SECRET`

## Variáveis de ambiente no Vercel
No dashboard do Vercel, adicione:
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `JWT_SECRET`
- `PORT` (opcional, padrão 3001)

## Deploy
1. Faça login no Vercel
2. Conecte o repositório Git ou faça upload do projeto
3. O Vercel usa `vercel.json` para deploy automático
4. Após deploy, o frontend estará disponível pelo domínio Vercel
5. A API estará em `https://<seu-site>.vercel.app/api/health`

## Observação
O Vercel não oferece banco MySQL diretamente; use um serviço externo gratuito como PlanetScale ou Supabase.
