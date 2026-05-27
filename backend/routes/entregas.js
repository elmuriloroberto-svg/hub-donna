const express = require('express');
const { getSupabase }       = require('../lib/supabase');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const isUUID = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// GET all entregas (com nome do cliente)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const sb = getSupabase();
    const [eRes, cRes] = await Promise.all([
      sb.from('entregas').select('*').order('data', { ascending: false }),
      sb.from('clientes').select('id, nome'),
    ]);
    if (eRes.error) throw new Error(eRes.error.message);

    const cliMap = Object.fromEntries((cRes.data || []).map((c) => [c.id, c.nome]));
    const data = (eRes.data || []).map((e) => ({ ...e, cliente_nome: cliMap[e.cliente_id] || '' }));
    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar entregas' });
  }
});

// GET resumo Uber (soma em JS)
router.get('/resumo/uber', authenticateToken, async (req, res) => {
  try {
    const sb = getSupabase();
    const { data, error } = await sb.from('entregas').select('valor_cobrado, valor_uber');
    if (error) throw new Error(error.message);

    const total_entregas = (data || []).length;
    const total_cobrado  = (data || []).reduce((s, r) => s + parseFloat(r.valor_cobrado || 0), 0);
    const total_uber     = (data || []).reduce((s, r) => s + parseFloat(r.valor_uber || 0), 0);
    const total_lucro    = total_cobrado - total_uber;
    res.json({ ok: true, data: { total_entregas, total_cobrado, total_uber, total_lucro } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar resumo Uber' });
  }
});

// CREATE entrega
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { data: dataEntrega, cliente_id, descricao, valor_cobrado, valor_uber, obs } = req.body;
    if (!dataEntrega || !valor_cobrado || !valor_uber)
      return res.status(400).json({ ok: false, msg: 'Campos obrigatórios faltando' });

    const sb = getSupabase();
    const { error } = await sb.from('entregas').insert({
      data: dataEntrega,
      cliente_id: cliente_id || null,
      descricao: descricao || '',
      valor_cobrado, valor_uber,
      status: 'realizada',
      obs: obs || '',
    });
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Entrega registrada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao criar entrega' });
  }
});

// DELETE entrega
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });

    const sb = getSupabase();
    const { error } = await sb.from('entregas').delete().eq('id', id);
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Entrega removida' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao remover entrega' });
  }
});

module.exports = router;
