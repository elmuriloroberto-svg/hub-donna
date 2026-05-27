const express = require('express');
const { getSupabase }       = require('../lib/supabase');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const isUUID = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// GET boletos pagar
router.get('/pagar', authenticateToken, async (req, res) => {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('boletos_pagar')
      .select('id, fornecedor, valor, vencimento, status, obs')
      .order('vencimento', { ascending: false });
    if (error) throw new Error(error.message);
    res.json({ ok: true, data: data || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar boletos' });
  }
});

// GET boletos receber
router.get('/receber', authenticateToken, async (req, res) => {
  try {
    const sb = getSupabase();
    const [brRes, cliRes] = await Promise.all([
      sb.from('boletos_receber').select('*').order('vencimento', { ascending: false }),
      sb.from('clientes').select('id, nome'),
    ]);
    if (brRes.error) throw new Error(brRes.error.message);

    const cliMap = Object.fromEntries((cliRes.data || []).map((c) => [c.id, c.nome]));
    const data = (brRes.data || []).map((r) => ({ ...r, cliente: cliMap[r.cliente_id] || '' }));
    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar recebíveis' });
  }
});

// CREATE boleto pagar
router.post('/pagar', authenticateToken, async (req, res) => {
  try {
    const { fornecedor, valor, vencimento, status, obs } = req.body;
    if (!fornecedor || !valor || !vencimento)
      return res.status(400).json({ ok: false, msg: 'Campos obrigatórios faltando' });

    const sb = getSupabase();
    const { error } = await sb.from('boletos_pagar').insert({
      fornecedor, valor, vencimento,
      status: status || 'pendente',
      obs: obs || '',
      created_by: req.user.id,
    });
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Boleto criado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao criar boleto' });
  }
});

// UPDATE boleto pagar
router.put('/pagar/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });

    const { fornecedor, valor, vencimento, status, obs } = req.body;
    const sb = getSupabase();
    const { error } = await sb
      .from('boletos_pagar')
      .update({ fornecedor, valor, vencimento, status, obs })
      .eq('id', id);
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Boleto atualizado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao atualizar boleto' });
  }
});

// DELETE boleto pagar
router.delete('/pagar/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });

    const sb = getSupabase();
    const { error } = await sb.from('boletos_pagar').delete().eq('id', id);
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Boleto removido' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao remover boleto' });
  }
});

module.exports = router;
