const express = require('express');
const { getSupabase }       = require('../lib/supabase');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const isUUID = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

function nextMonth(mes) {
  const [y, m] = mes.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

// GET /api/entregas?mes=YYYY-MM
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { mes } = req.query;
    const sb = getSupabase();
    let query = sb
      .from('entregas')
      .select('id, data, num_venda, forma_envio, valor_cobrado, valor_uber, obs, status')
      .order('data', { ascending: false });

    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      query = query
        .gte('data', mes + '-01')
        .lt('data', nextMonth(mes) + '-01');
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    res.json({ ok: true, data: data || [] });
  } catch (err) {
    console.error('[entregas GET]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar entregas' });
  }
});

// POST /api/entregas — registra nova entrega
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { data: dataEntrega, num_venda, forma_envio, valor_cobrado, valor_uber, obs } = req.body;
    if (!dataEntrega || valor_cobrado == null || valor_uber == null)
      return res.status(400).json({ ok: false, msg: 'Campos obrigatórios: data, valor_cobrado, valor_uber' });

    const cobrado = parseFloat(valor_cobrado);
    const custo   = parseFloat(valor_uber);
    if (isNaN(cobrado) || isNaN(custo) || cobrado < 0 || custo < 0)
      return res.status(400).json({ ok: false, msg: 'Valores inválidos' });

    const sb = getSupabase();
    const { error } = await sb.from('entregas').insert({
      data:         dataEntrega,
      num_venda:    num_venda || '',
      forma_envio:  forma_envio || 'uber',
      valor_cobrado: cobrado,
      valor_uber:   custo,
      status:       'realizada',
      obs:          obs || '',
    });
    if (error) throw new Error(error.message);
    res.json({ ok: true, msg: 'Entrega registrada' });
  } catch (err) {
    console.error('[entregas POST]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao criar entrega' });
  }
});

// DELETE /api/entregas/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });
    const sb = getSupabase();
    const { error } = await sb.from('entregas').delete().eq('id', id);
    if (error) throw new Error(error.message);
    res.json({ ok: true, msg: 'Entrega removida' });
  } catch (err) {
    console.error('[entregas DELETE]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao remover entrega' });
  }
});

module.exports = router;
