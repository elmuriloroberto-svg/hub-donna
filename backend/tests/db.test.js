const request = require('supertest');
const { sessionCookieFor } = require('./helpers');

jest.mock('../lib/supabase', () => ({ getSupabase: jest.fn() }));
const { getSupabase } = require('../lib/supabase');
const app = require('../app');

// Mesmo conteúdo que a auditoria de 2026-07-13 achou vazando em /api/config —
// usado aqui para provar que /api/db não é mais a mesma porta pro mesmo vazamento.
const HUB_CONFIG_ROWS = [
  { config_key: 'custos_fixos', config_value: '22.18' },
  { config_key: 'taxa_cartao', config_value: '6' },
  { config_key: 'clientes', config_value: '[{"nome":"Maria"}]' },
  { config_key: 'users', config_value: '[{"login":"murilo"}]' },
  { config_key: 'boletos_p', config_value: '[{"fornecedor":"x"}]' },
  { config_key: 'boletos_r', config_value: '[{"cliente":"y"}]' },
  { config_key: 'tasks', config_value: '[{"titulo":"z"}]' },
  { config_key: 'pedidos_manuais', config_value: '[{"cliente":"w"}]' },
  { config_key: 'folha', config_value: '[{"salario":1000}]' },
  { config_key: 'processos', config_value: '[{"nome":"p"}]' },
  { config_key: 'entregas', config_value: '[{"endereco":"e"}]' },
];

const RESTRICTED = ['users', 'folha', 'boletos_p', 'boletos_r', 'tasks', 'pedidos_manuais', 'processos', 'entregas'];

beforeEach(() => {
  getSupabase.mockReturnValue({
    from: () => ({ select: () => Promise.resolve({ data: HUB_CONFIG_ROWS, error: null }) }),
  });
});
afterEach(() => jest.clearAllMocks());

describe('GET /api/db — contenção por perfil (Fase 2, passo 3)', () => {
  it('sem sessão → 401', async () => {
    const res = await request(app).get('/api/db');
    expect(res.status).toBe(401);
  });

  it.each(['vendedor', 'colaborador'])('perfil %s não vê nenhum domínio restrito', async (role) => {
    const res = await request(app).get('/api/db').set('Cookie', sessionCookieFor({ role }));
    expect(res.status).toBe(200);
    const keys = Object.keys(res.body.data);
    for (const restricted of RESTRICTED) expect(keys).not.toContain(restricted);
    // config/clientes continuam liberados — não fazem parte do vazamento
    expect(keys).toEqual(expect.arrayContaining(['custos_fixos', 'taxa_cartao', 'clientes']));
  });

  it.each(['admin', 'gerente'])('perfil %s continua vendo todos os domínios', async (role) => {
    const res = await request(app).get('/api/db').set('Cookie', sessionCookieFor({ role }));
    expect(res.status).toBe(200);
    const keys = Object.keys(res.body.data);
    for (const restricted of RESTRICTED) expect(keys).toContain(restricted);
  });
});
