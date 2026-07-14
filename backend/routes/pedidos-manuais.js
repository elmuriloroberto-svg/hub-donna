const express = require('express');
const { getSupabase }                  = require('../lib/supabase');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();
const isUUID = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// GET /api/pedidos-manuais
router.get('/', authenticateToken, async (req, res) => {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('pedidos_manuais')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    res.json({ ok: true, data: data || [] });
  } catch (err) {
    console.error('[pedidos-manuais GET]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar pedidos manuais' });
  }
});

// POST /api/pedidos-manuais — adiciona item à lista
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { produto, qtd, obs } = req.body;
    if (!produto) return res.status(400).json({ ok: false, msg: 'Produto é obrigatório' });

    const sb = getSupabase();
    const { data, error } = await sb
      .from('pedidos_manuais')
      .insert({ produto, qtd: parseInt(qtd) || 1, obs: obs || '' })
      .select()
      .single();
    if (error) throw new Error(error.message);

    res.json({ ok: true, data });
  } catch (err) {
    console.error('[pedidos-manuais POST]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao adicionar item' });
  }
});

// PUT /api/pedidos-manuais/:id — marca/desmarca como pedido (só admin)
router.put('/:id', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });

    const pedido = !!req.body.pedido;
    const sb = getSupabase();
    const { error } = await sb
      .from('pedidos_manuais')
      .update({ pedido, pedido_em: pedido ? new Date().toISOString() : null, pedido_por: pedido ? req.user.id : null })
      .eq('id', id);
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Item atualizado' });
  } catch (err) {
    console.error('[pedidos-manuais PUT]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao atualizar item' });
  }
});

// DELETE /api/pedidos-manuais/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });
    const sb = getSupabase();
    const { error } = await sb.from('pedidos_manuais').delete().eq('id', id);
    if (error) throw new Error(error.message);
    res.json({ ok: true, msg: 'Item removido' });
  } catch (err) {
    console.error('[pedidos-manuais DELETE]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao remover item' });
  }
});

module.exports = router;
