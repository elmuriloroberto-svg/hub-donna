const request = require('supertest');
const { sessionCookieFor } = require('./helpers');

jest.mock('../lib/supabase', () => ({ getSupabase: jest.fn() }));
const { getSupabase } = require('../lib/supabase');
const app = require('../app');

describe('GET /api/config', () => {
  afterEach(() => jest.clearAllMocks());

  it('sem sessão retorna 401 e não consulta o banco', async () => {
    const res = await request(app).get('/api/config');

    expect(res.status).toBe(401);
    expect(getSupabase).not.toHaveBeenCalled();
  });

  it('com sessão válida, devolve somente a whitelist mesmo se o banco tiver mais chaves', async () => {
    // Simula hub_config contendo dados legados sensíveis (users, folha, boletos...).
    // A rota deve devolver só custos_fixos/taxa_cartao — nunca a tabela inteira.
    const inMock = jest.fn().mockResolvedValue({
      data: [
        { config_key: 'custos_fixos', config_value: '22.18' },
        { config_key: 'taxa_cartao', config_value: '6' },
        { config_key: 'users', config_value: '[{"login":"murilo"}]' },
        { config_key: 'folha', config_value: '[{"salario":1000}]' },
      ],
      error: null,
    });
    getSupabase.mockReturnValue({
      from: () => ({ select: () => ({ in: inMock }) }),
    });

    const res = await request(app)
      .get('/api/config')
      .set('Cookie', sessionCookieFor({ role: 'vendedor' }));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Object.keys(res.body.data).sort()).toEqual(['custos_fixos', 'taxa_cartao']);
    expect(res.body.data.users).toBeUndefined();
    expect(res.body.data.folha).toBeUndefined();
    // A whitelist também deve ser aplicada na própria query ao Supabase.
    expect(inMock).toHaveBeenCalledWith('config_key', ['custos_fixos', 'taxa_cartao']);
  });

  it('não envia dados em cache (Cache-Control: no-store)', async () => {
    getSupabase.mockReturnValue({
      from: () => ({ select: () => ({ in: jest.fn().mockResolvedValue({ data: [], error: null }) }) }),
    });

    const res = await request(app)
      .get('/api/config')
      .set('Cookie', sessionCookieFor());

    expect(res.headers['cache-control']).toMatch(/no-store/);
  });
});

describe('POST /api/config', () => {
  it('sem sessão retorna 401', async () => {
    const res = await request(app).post('/api/config').send({ key: 'custos_fixos', value: '10' });
    expect(res.status).toBe(401);
  });

  it('perfil sem permissão (vendedor) recebe 403', async () => {
    const res = await request(app)
      .post('/api/config')
      .set('Cookie', sessionCookieFor({ role: 'vendedor' }))
      .send({ key: 'custos_fixos', value: '10' });

    expect(res.status).toBe(403);
  });
});
