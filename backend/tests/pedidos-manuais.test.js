const request = require('supertest');
const { sessionCookieFor } = require('./helpers');

jest.mock('../lib/supabase', () => ({ getSupabase: jest.fn() }));
const { getSupabase } = require('../lib/supabase');
const app = require('../app');

const ITEM_ID = '11111111-1111-1111-1111-111111111111';

afterEach(() => jest.clearAllMocks());

describe('GET /api/pedidos-manuais', () => {
  it('sem sessão → 401', async () => {
    const res = await request(app).get('/api/pedidos-manuais');
    expect(res.status).toBe(401);
  });

  it('com sessão, lista os itens', async () => {
    getSupabase.mockReturnValue({
      from: () => ({
        select: () => ({
          order: () => Promise.resolve({
            data: [{ id: ITEM_ID, produto: 'Esmalte', qtd: 3, obs: '', pedido: false, pedido_em: null, created_at: '2026-07-13T00:00:00Z' }],
            error: null,
          }),
        }),
      }),
    });
    const res = await request(app).get('/api/pedidos-manuais').set('Cookie', sessionCookieFor({ role: 'vendedor' }));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].produto).toBe('Esmalte');
  });
});

describe('POST /api/pedidos-manuais', () => {
  it('sem sessão → 401', async () => {
    const res = await request(app).post('/api/pedidos-manuais').send({ produto: 'Lixa' });
    expect(res.status).toBe(401);
  });

  it('sem produto → 400', async () => {
    const res = await request(app).post('/api/pedidos-manuais').set('Cookie', sessionCookieFor()).send({});
    expect(res.status).toBe(400);
  });

  it('qualquer perfil autenticado pode adicionar item', async () => {
    getSupabase.mockReturnValue({
      from: () => ({
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: { id: ITEM_ID, produto: 'Lixa', qtd: 1, obs: '' }, error: null }),
          }),
        }),
      }),
    });
    const res = await request(app)
      .post('/api/pedidos-manuais')
      .set('Cookie', sessionCookieFor({ role: 'vendedor' }))
      .send({ produto: 'Lixa', qtd: 1 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('PUT /api/pedidos-manuais/:id — marcar como pedido', () => {
  it('vendedor recebe 403 (só admin pode marcar)', async () => {
    const res = await request(app)
      .put(`/api/pedidos-manuais/${ITEM_ID}`)
      .set('Cookie', sessionCookieFor({ role: 'vendedor' }))
      .send({ pedido: true });
    expect(res.status).toBe(403);
  });

  it('admin consegue marcar como pedido', async () => {
    const update = jest.fn().mockReturnValue({ eq: () => Promise.resolve({ error: null }) });
    getSupabase.mockReturnValue({ from: () => ({ update }) });
    const res = await request(app)
      .put(`/api/pedidos-manuais/${ITEM_ID}`)
      .set('Cookie', sessionCookieFor({ role: 'admin' }))
      .send({ pedido: true });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ pedido: true }));
  });

  it('ID inválido → 400', async () => {
    const res = await request(app)
      .put('/api/pedidos-manuais/nao-e-uuid')
      .set('Cookie', sessionCookieFor({ role: 'admin' }))
      .send({ pedido: true });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/pedidos-manuais/:id', () => {
  it('sem sessão → 401', async () => {
    const res = await request(app).delete(`/api/pedidos-manuais/${ITEM_ID}`);
    expect(res.status).toBe(401);
  });

  it('com sessão, remove o item', async () => {
    const del = jest.fn().mockReturnValue({ eq: () => Promise.resolve({ error: null }) });
    getSupabase.mockReturnValue({ from: () => ({ delete: del }) });
    const res = await request(app)
      .delete(`/api/pedidos-manuais/${ITEM_ID}`)
      .set('Cookie', sessionCookieFor({ role: 'vendedor' }));
    expect(res.status).toBe(200);
  });
});
