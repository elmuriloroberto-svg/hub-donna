# Donna Hub — Relay de Tempo Real

Servidor Node pequeno e sempre ligado que ouve mudanças no Supabase (via
service key) e avisa o navegador em tempo real, sem precisar clicar em
"Sincronizar". Roda separado da Vercel porque funções serverless não mantêm
conexões WebSocket abertas por muito tempo.

Não expõe dados nem credenciais do Supabase ao navegador — só manda avisos
tipo `{table:'tasks', event:'INSERT'}`. O navegador continua buscando os
dados de verdade pela API normal do Hub (`/api/tasks`, etc.), que já cuida de
quem pode ver o quê.

## Rodar localmente

```
cd realtime-relay
npm install
cp .env.example .env   # preencher com os mesmos valores do backend/.env
npm start
```

## Deploy no Railway

1. Criar um novo projeto no Railway, conectar este repositório
2. Configurar o **root directory** do serviço como `realtime-relay/` (ele não
   deve tentar rodar o `backend/` nem o resto do repo)
3. Definir as variáveis de ambiente (mesmas do `.env.example`):
   `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET`
   (`JWT_SECRET` precisa ser **idêntico** ao usado no backend Vercel, senão os
   tickets não validam)
4. O Railway expõe automaticamente uma URL pública `wss://<algo>.up.railway.app`
   — pegar essa URL e configurar no frontend (ver `donna_hub_v3_index (6).html`,
   constante `REALTIME_RELAY_URL`)
5. Rodar `supabase_realtime_publication.sql` no SQL Editor do Supabase (uma
   vez só) — sem isso o relay conecta mas nunca recebe nenhum evento

**Importante:** se um dia trocar o domínio do relay (ex: sair de
`*.up.railway.app` pra um domínio próprio), também precisa atualizar o
`connectSrc` do Content-Security-Policy em `backend/app.js` — hoje ele só
libera explicitamente `*.up.railway.app`, e sem isso o navegador bloqueia a
conexão WebSocket silenciosamente (por CSP, não por erro de rede).

## Se o relay cair

O Hub não trava nem mostra erro — só volta a se comportar como antes
(sincronização manual pelo botão 🔄, ou trocando de aba). É só uma melhoria
aditiva, não uma dependência crítica.
