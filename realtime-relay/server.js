const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET;

// Mesmas origens aceitas pelo backend principal (backend/app.js) — o navegador
// conecta direto neste relay, então validamos a origem aqui também (defesa
// extra além do ticket).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((o) => o.trim()).filter(Boolean);
const VERCEL_ORIGIN_RE = /^https:\/\/(donna-hub|donnahub[^.]*|donna-[a-z0-9]+-donnaproject)\.vercel\.app$/;
const CUSTOM_DOMAIN_RE = /^https:\/\/(www\.)?hubdonnaunha\.com$/;

function origemPermitida(origin) {
  if (!origin) return true; // conexões sem Origin (ex: teste local via curl/wscat)
  return ALLOWED_ORIGINS.includes(origin) || VERCEL_ORIGIN_RE.test(origin) || CUSTOM_DOMAIN_RE.test(origin);
}

// Tabelas cujas mudanças interessam ao frontend (nomes reais confirmados em backend/routes/*.js)
const TABELAS = [
  'tasks', 'clientes', 'crm_clientes', 'boletos_pagar', 'boletos_receber',
  'metas', 'metas_semanais', 'metas_mensais', 'folha', 'folha_ponto',
  'processos', 'entregas', 'hub_data',
];

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { realtime: { transport: WebSocket } }
);

const clientes = new Set();

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  for (const ws of clientes) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

// Um canal só, assinando todas as tabelas — evita abrir uma conexão Realtime
// por tabela.
const channel = supabase.channel('hub-relay');
for (const tabela of TABELAS) {
  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: tabela },
    (payload) => {
      console.log(`[relay] mudança em ${tabela}: ${payload.eventType}`);
      broadcast({ table: tabela, event: payload.eventType });
    }
  );
}
channel.subscribe((status) => {
  console.log('[relay] status da assinatura Supabase Realtime:', status);
});

const wss = new WebSocket.Server({ port: PORT, verifyClient: ({ origin }, cb) => {
  if (origemPermitida(origin)) return cb(true);
  console.warn('[relay] origem rejeitada:', origin);
  cb(false, 403, 'Origem não permitida');
} });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const ticket = url.searchParams.get('ticket');

  try {
    const payload = jwt.verify(ticket, JWT_SECRET);
    if (payload.purpose !== 'realtime') throw new Error('ticket com propósito inválido');
  } catch (err) {
    console.warn('[relay] ticket inválido, fechando conexão:', err.message);
    ws.close(4001, 'Ticket inválido ou expirado');
    return;
  }

  clientes.add(ws);
  console.log(`[relay] cliente conectado (${clientes.size} ativo(s))`);

  ws.on('close', () => {
    clientes.delete(ws);
    console.log(`[relay] cliente desconectado (${clientes.size} ativo(s))`);
  });
});

console.log(`[relay] WebSocket ouvindo na porta ${PORT}`);
