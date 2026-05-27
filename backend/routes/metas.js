const express = require('express');
const { getSupabase }       = require('../lib/supabase');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const isUUID = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// GET all metas (com nome do colaborador)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const sb = getSupabase();
    const [metaRes, userRes] = await Promise.all([
      sb.from('metas').select('*').order('mes', { ascending: false }),
      sb.from('rubi_users').select('id, nome'),
    ]);
    if (metaRes.error) throw new Error(metaRes.error.message);

    const userMap = Object.fromEntries((userRes.data || []).map((u) => [u.id, u.nome]));
    const data = (metaRes.data || []).map((m) => ({
      ...m,
      colaborador_nome: userMap[m.colaborador_id] || '',
    }));
    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar metas' });
  }
});

// CREATE meta
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { colaborador_id, mes, meta_valor, realizado } = req.body;
    if (!colaborador_id || !mes || !meta_valor)
      return res.status(400).json({ ok: false, msg: 'Campos obrigatórios faltando' });

    const sb = getSupabase();
    const { error } = await sb.from('metas').insert({
      colaborador_id, mes,
      meta_valor, realizado: realizado || 0,
    });
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Meta criada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao criar meta' });
  }
});

// UPDATE meta
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });

    const { meta_valor, realizado } = req.body;
    const sb = getSupabase();
    const { error } = await sb.from('metas').update({ meta_valor, realizado }).eq('id', id);
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Meta atualizada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao atualizar meta' });
  }
});

module.exports = router;
