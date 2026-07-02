const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const cookieParser = require('cookie-parser');
const path         = require('path');
const { randomUUID } = require('crypto');

const { apiLimiter, authLimiter } = require('./middleware/security');

const authRoutes      = require('./routes/auth');
const dbRoutes        = require('./routes/db');
const tinyRoutes      = require('./routes/tiny');
const usersRoutes     = require('./routes/users');
const clientesRoutes  = require('./routes/clientes');
const boletosRoutes   = require('./routes/boletos');
const tasksRoutes     = require('./routes/tasks');
const metasRoutes     = require('./routes/metas');
const processosRoutes = require('./routes/processos');
const entregasRoutes  = require('./routes/entregas');
const folhaRoutes     = require('./routes/folha');
const pontoRoutes     = require('./routes/ponto');
const configRoutes    = require('./routes/config');
const dashboardRoutes = require('./routes/dashboard');
const hubRoutes       = require('./routes/hub');
const chatRoutes      = require('./routes/chat');

const app    = express();
const isProd = process.env.NODE_ENV === 'production';

// Vercel (and most proxies) set X-Forwarded-For — trust the first proxy so
// express-rate-limit can read the real client IP without throwing a ValidationError.
app.set('trust proxy', 1);

// ── Origens permitidas via CORS ──────────────────────────────────────────────
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [];

if (!isProd) {
  ALLOWED_ORIGINS.push(
    'http://localhost:3001',
    'http://localhost:5173',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:5173'
  );
}

// Aceita qualquer URL de deploy do projeto donna-hub no Vercel (deploy único e alias).
// Padrões: donna-hub.vercel.app, donnahub*.vercel.app, donna-*-donnaproject.vercel.app
const VERCEL_ORIGIN_RE = /^https:\/\/(donna-hub|donnahub[^.]*|donna-[a-z0-9]+-donnaproject)\.vercel\.app$/;

// ── [ML-1] X-Request-ID — rastreabilidade de logs (igual ao x-request-id do ML) ──
app.use((req, res, next) => {
  const id = randomUUID();
  req.requestId = id;
  res.setHeader('x-request-id', id);
  next();
});

// ── [ML-2] Helmet — bloco completo de headers de segurança ───────────────────
// Configurado para espelhar exatamente os headers enviados pelo MercadoLivre
app.use(
  helmet({
    // HSTS: 2 anos (63072000 s), subdomínios e preload — igual ao ML
    hsts: {
      maxAge: 63072000,
      includeSubDomains: true,
      preload: true,
    },

    // [ML-3] Referrer-Policy: no-referrer-when-downgrade (igual ao ML)
    referrerPolicy: { policy: 'no-referrer-when-downgrade' },

    // [ML-4] X-DNS-Prefetch-Control: on — ML ativa para performance
    dnsPrefetchControl: { allow: true },

    // [ML-5] X-Download-Options: noopen — bloqueia abertura direta de downloads no IE
    ieNoOpen: true,

    // [ML-6] X-Permitted-Cross-Domain-Policies: none — bloqueia Flash/PDF cross-domain
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },

    // [ML-7] X-Content-Type-Options: nosniff
    noSniff: true,

    // [ML-8] X-XSS-Protection: 1; mode=block (legado, mas ML ainda envia)
    xssFilter: true,

    // [ML-9] Content-Security-Policy — adaptado para o frontend do Hub
    // ML usa nonce + strict-dynamic. Usamos 'self' como base para o sistema interno.
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        scriptSrc:   ["'self'", "'unsafe-inline'"],  // unsafe-inline necessário para o HTML inline
        styleSrc:    ["'self'", "'unsafe-inline'"],
        imgSrc:      ["'self'", "data:", "https:"],
        connectSrc:  ["'self'"],
        fontSrc:     ["'self'", "data:", "https:"],
        objectSrc:   ["'none'"],                     // bloqueia Flash e plugins (igual ML: object-src 'none')
        mediaSrc:    ["'self'"],
        frameSrc:    ["'none'"],                     // bloqueia iframes de terceiros
        frameAncestors: ["'none'"],                  // bloqueia o sistema de ser embutido em iframes
        baseUri:     ["'none'"],                     // previne injeção de tag <base> (igual ML: base-uri 'none')
        formAction:  ["'self'"],
      },
    },
  })
);

// ── [ML-10] CORS ─────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      if (VERCEL_ORIGIN_RE.test(origin)) return cb(null, true);
      cb(Object.assign(new Error('Origem não permitida por CORS'), { status: 403 }));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// ── [ML-11] Limite de payload ─────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
// Cookie parser — necessário para req.cookies (leitura do JWT HttpOnly)
app.use(cookieParser());

// ── Arquivos estáticos ────────────────────────────────────────────────────────
// dotfiles: 'deny' impede acesso a .env e similares via HTTP
app.use(express.static(path.join(__dirname, '../'), { index: false, dotfiles: 'deny' }));

// ── [ML-12] noCache — Cache-Control: no-store nas rotas sensíveis ─────────────
// ML envia "Cache-Control: private, max-age=0, no-cache, no-store, must-revalidate"
// em páginas autenticadas. Aplicamos o mesmo nas rotas de auth e usuários.
const noCache = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};

// ── Health check (sem rate limit nem cache) ───────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'API Donna Unha Hub v3.0' });
});

// ── Rotas ─────────────────────────────────────────────────────────────────────
app.use('/api/auth',      authLimiter, noCache, authRoutes);
app.use('/api/db',        apiLimiter,  noCache, dbRoutes);
app.use('/api/tiny',      apiLimiter,  tinyRoutes);
app.use('/api/users',     apiLimiter,  noCache, usersRoutes);
app.use('/api/clientes',  apiLimiter,  clientesRoutes);
app.use('/api/boletos',   apiLimiter,  boletosRoutes);
app.use('/api/tasks',     apiLimiter,  tasksRoutes);
app.use('/api/metas',     apiLimiter,  metasRoutes);
app.use('/api/processos', apiLimiter,  processosRoutes);
app.use('/api/entregas',  apiLimiter,  entregasRoutes);
app.use('/api/folha',     apiLimiter,  folhaRoutes);
app.use('/api/ponto',     apiLimiter,  pontoRoutes);
app.use('/api/config',    apiLimiter,  configRoutes);
app.use('/api/dashboard', apiLimiter,  dashboardRoutes);
app.use('/api/hub',       apiLimiter,  hubRoutes);
app.use('/api/chat',      apiLimiter,  chatRoutes);

// ── Migração temporária (remover após executar uma vez) ───────────────────────
app.get('/api/_migrate_dias_validos', async (req, res) => {
  const secret = req.query.secret;
  if (secret !== 'donna2026mig') return res.status(403).json({ ok: false });
  try {
    const { Client } = require('pg');
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    await client.query('ALTER TABLE metas_semanais ADD COLUMN IF NOT EXISTS dias_validos TEXT;');
    await client.end();
    res.json({ ok: true, msg: 'dias_validos adicionado' });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

// ── Frontend fallback ─────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../donna_hub_v3_index (6).html'));
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ ok: false, msg: 'Rota não encontrada' });
});

// ── Tratamento global de erros ────────────────────────────────────────────────
// NUNCA expõe stack trace em produção — loga completo só no servidor
// Inclui o x-request-id no log para correlação (prática do ML)
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(`[ERRO] id=${req.requestId} ${req.method} ${req.originalUrl} →`, err.stack || err.message);
  res.status(err.status || 500).json({
    ok:  false,
    msg: isProd ? 'Erro interno do servidor.' : err.message,
  });
});

module.exports = app;
