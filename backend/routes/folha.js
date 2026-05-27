const express = require('express');
const { getSupabase }                  = require('../lib/supabase');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();
const isUUID = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// GET all folhas (com nome do colaborador)
router.get('/', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const sb = getSupabase();
    const [fRes, uRes] = await Promise.all([
      sb.from('folha').select('*').order('mes', { ascending: false }),
      sb.from('rubi_users').select('id, nome'),
    ]);
    if (fRes.error) throw new Error(fRes.error.message);

    const userMap = Object.fromEntries((uRes.data || []).map((u) => [u.id, u.nome]));
    const data = (fRes.data || []).map((f) => ({
      ...f,
      colaborador_nome: userMap[f.colaborador_id] || '',
    }));
    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar folhas' });
  }
});

// CREATE folha
router.post('/', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { colaborador_id, mes, salario_base, comissao, bonus, descontos, obs } = req.body;
    if (!colaborador_id || !mes || !salario_base)
      return res.status(400).json({ ok: false, msg: 'Campos obrigatórios faltando' });

    const total_liquido =
      (parseFloat(salario_base) || 0) +
      (parseFloat(comissao) || 0) +
      (parseFloat(bonus) || 0) -
      (parseFloat(descontos) || 0);

    const sb = getSupabase();
    const { error } = await sb.from('folha').insert({
      colaborador_id, mes, salario_base,
      comissao: comissao || 0,
      bonus: bonus || 0,
      descontos: descontos || 0,
      total_liquido,
      obs: obs || '',
    });
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Folha criada', data: { total_liquido } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao criar folha' });
  }
});

// DELETE folha
router.delete('/:id', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });

    const sb = getSupabase();
    const { error } = await sb.from('folha').delete().eq('id', id);
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Folha removida' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao remover folha' });
  }
});

module.exports = router;
