const express = require('express');
const { getSupabase }       = require('../lib/supabase');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const isUUID = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

function nextMonth(mes) {
  const [y, m] = mes.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

// GET /api/boletos/pagar?mes=YYYY-MM
router.get('/pagar', authenticateToken, async (req, res) => {
  try {
    const { mes } = req.query;
    const sb = getSupabase();
    let query = sb
      .from('boletos_pagar')
      .select('id, fornecedor, valor, vencimento, status, obs, categoria, grupo_id, parcela_num, parcela_tot')
      .order('vencimento', { ascending: true });

    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      query = query
        .gte('vencimento', mes + '-01')
        .lt('vencimento', nextMonth(mes) + '-01');
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    res.json({ ok: true, data: data || [] });
  } catch (err) {
    console.error('[boletos/pagar]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar contas a pagar' });
  }
});

// GET /api/boletos/receber
router.get('/receber', authenticateToken, async (req, res) => {
  try {
    const sb = getSupabase();
    const [brRes, cliRes] = await Promise.all([
      sb.from('boletos_receber').select('*').order('vencimento', { ascending: false }),
      sb.from('clientes').select('id, nome'),
    ]);
    if (brRes.error) throw new Error(brRes.error.message);
    const cliMap = Object.fromEntries((cliRes.data || []).map(c => [c.id, c.nome]));
    const data = (brRes.data || []).map(r => ({ ...r, cliente: r.cliente_nome || cliMap[r.cliente_id] || '' }));
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[boletos/receber]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar recebíveis' });
  }
});

// POST /api/boletos/receber — aceita {cliente_nome, pedido, forma_pagamento, valor_total, parcelas:[{valor,vencimento}]}
router.post('/receber', authenticateToken, async (req, res) => {
  try {
    const { cliente_nome, pedido, forma_pagamento, valor_total, parcelas } = req.body;
    if (!cliente_nome) return res.status(400).json({ ok: false, msg: 'Cliente é obrigatório' });

    const sb = getSupabase();
    const { data: cliData } = await sb.from('clientes').select('id').ilike('nome', cliente_nome.trim()).limit(1);
    const cliente_id = cliData?.[0]?.id || null;

    const rows = (Array.isArray(parcelas) && parcelas.length > 0
      ? parcelas
      : [{ valor: valor_total, vencimento: new Date().toISOString().slice(0, 10) }]
    ).map(p => ({
      cliente_id,
      cliente_nome: String(cliente_nome).trim(),
      pedido:        pedido || '',
      forma_pagamento: forma_pagamento || 'PIX',
      valor:         parseFloat(p.valor),
      vencimento:    p.vencimento,
      status:        'pendente',
    }));

    const { error } = await sb.from('boletos_receber').insert(rows);
    if (error) throw new Error(error.message);
    res.json({ ok: true, msg: `${rows.length} parcela(s) salva(s)` });
  } catch (err) {
    console.error('[boletos/receber POST]', err.message);
    res.status(500).json({ ok: false, msg: err.message });
  }
});

// PUT /api/boletos/receber/:id — atualiza status
router.put('/receber/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });
    const { status } = req.body;
    const sb = getSupabase();
    const { error } = await sb.from('boletos_receber').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(error.message);
    res.json({ ok: true, msg: 'Atualizado' });
  } catch (err) {
    console.error('[boletos/receber PUT]', err.message);
    res.status(500).json({ ok: false, msg: err.message });
  }
});

// DELETE /api/boletos/receber/:id
router.delete('/receber/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });
    const sb = getSupabase();
    const { error } = await sb.from('boletos_receber').delete().eq('id', id);
    if (error) throw new Error(error.message);
    res.json({ ok: true, msg: 'Removido' });
  } catch (err) {
    console.error('[boletos/receber DELETE]', err.message);
    res.status(500).json({ ok: false, msg: err.message });
  }
});

// DELETE /api/boletos/pagar/grupo/:grupo_id — remove todas as parcelas do grupo
// IMPORTANT: must be declared before /pagar/:id to avoid route conflict
router.delete('/pagar/grupo/:grupo_id', authenticateToken, async (req, res) => {
  try {
    const { grupo_id } = req.params;
    if (!isUUID(grupo_id)) return res.status(400).json({ ok: false, msg: 'grupo_id inválido' });
    const sb = getSupabase();
    const { error } = await sb.from('boletos_pagar').delete().eq('grupo_id', grupo_id);
    if (error) throw new Error(error.message);
    res.json({ ok: true, msg: 'Conta removida' });
  } catch (err) {
    console.error('[boletos/pagar/grupo]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao remover conta' });
  }
});

// POST /api/boletos/pagar — cria conta(s); aceita objeto único ou array de parcelas
router.post('/pagar', authenticateToken, async (req, res) => {
  try {
    const payload = Array.isArray(req.body) ? req.body : [req.body];
    const rows = payload.map(item => {
      const { fornecedor, valor, vencimento, status, obs, categoria, grupo_id, parcela_num, parcela_tot } = item;
      if (!fornecedor || valor == null || !vencimento)
        throw Object.assign(new Error('Campos obrigatórios: fornecedor, valor, vencimento'), { status: 400 });
      return {
        fornecedor:  String(fornecedor).trim(),
        valor:       parseFloat(valor),
        vencimento,
        status:      status || 'pendente',
        obs:         obs || '',
        categoria:   categoria || 'Geral',
        grupo_id:    grupo_id || undefined,
        parcela_num: parcela_num || 1,
        parcela_tot: parcela_tot || 1,
        created_by:  req.user.id,
      };
    });

    const sb = getSupabase();
    const { error } = await sb.from('boletos_pagar').insert(rows);
    if (error) throw new Error(error.message);
    res.json({ ok: true, msg: `${rows.length} conta(s) criada(s)` });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ ok: false, msg: err.message });
    console.error('[boletos/pagar POST]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao criar conta' });
  }
});

// PUT /api/boletos/pagar/:id — atualiza conta individual (status, campos)
router.put('/pagar/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });
    const { fornecedor, valor, vencimento, status, obs, categoria } = req.body;
    const sb = getSupabase();
    const { error } = await sb
      .from('boletos_pagar')
      .update({ fornecedor, valor, vencimento, status, obs, categoria })
      .eq('id', id);
    if (error) throw new Error(error.message);
    res.json({ ok: true, msg: 'Conta atualizada' });
  } catch (err) {
    console.error('[boletos/pagar PUT]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao atualizar conta' });
  }
});

// DELETE /api/boletos/pagar/:id — remove parcela individual
router.delete('/pagar/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });
    const sb = getSupabase();
    const { error } = await sb.from('boletos_pagar').delete().eq('id', id);
    if (error) throw new Error(error.message);
    res.json({ ok: true, msg: 'Conta removida' });
  } catch (err) {
    console.error('[boletos/pagar DELETE]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao remover conta' });
  }
});

module.exports = router;
