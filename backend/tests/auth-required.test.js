const request = require('supertest');

jest.mock('../lib/supabase', () => ({ getSupabase: jest.fn() }));
const app = require('../app');

// Toda rota de domínio deve recusar acesso sem sessão. Só as exceções abaixo
// (login/logout/health) podem responder sem cookie — qualquer outra rota
// nova em /api/* precisa ser adicionada aqui e continuar exigindo 401.
// Ver auditoria P0 2026-07-13 (/api/config vazando sem autenticação).
const PROTECTED_ROUTES = [
  ['get', '/api/db'],
  ['get', '/api/users'],
  ['get', '/api/clientes'],
  ['get', '/api/boletos/pagar'],
  ['get', '/api/boletos/receber'],
  ['get', '/api/tasks'],
  ['get', '/api/metas'],
  ['get', '/api/metas/semana'],
  ['get', '/api/metas/mensal'],
  ['get', '/api/processos'],
  ['get', '/api/entregas'],
  ['get', '/api/folha'],
  ['get', '/api/ponto'],
  ['get', '/api/config'],
  ['post', '/api/config'],
  ['get', '/api/dashboard'],
  ['get', '/api/hub'],
  ['post', '/api/chat'],
  ['get', '/api/realtime/ticket'],
  ['get', '/api/tiny/semana'],
  ['get', '/api/tiny/dashboard'],
  ['get', '/api/auth/me'],
  ['put', '/api/auth/password'],
];

const PUBLIC_ROUTES = [
  ['get', '/api/health'],
  ['post', '/api/auth/login'],
  ['post', '/api/auth/logout'],
];

describe('todas as rotas /api/* exigem sessão, exceto as públicas explícitas', () => {
  it.each(PROTECTED_ROUTES)('%s %s → 401 sem cookie de sessão', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
  });

  it.each(PUBLIC_ROUTES)('%s %s → nunca 401 (rota pública)', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).not.toBe(401);
  });
});
