const express = require('express');
const { getSupabase }       = require('../lib/supabase');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const isUUID = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// GET all tasks (com nome do colaborador)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const sb = getSupabase();
    const [taskRes, userRes] = await Promise.all([
      sb.from('tasks').select('*').order('prazo', { ascending: false }),
      sb.from('rubi_users').select('id, nome'),
    ]);
    if (taskRes.error) throw new Error(taskRes.error.message);

    const userMap = Object.fromEntries((userRes.data || []).map((u) => [u.id, u.nome]));
    const data = (taskRes.data || []).map((t) => ({ ...t, collab_nome: userMap[t.collab_id] || '' }));
    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar tarefas' });
  }
});

// CREATE task
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { titulo, descricao, collab_id, prazo, prio, recorrente, intervalo_dias } = req.body;
    if (!titulo || !collab_id)
      return res.status(400).json({ ok: false, msg: 'Campos obrigatórios faltando' });

    const sb = getSupabase();
    const { error } = await sb.from('tasks').insert({
      titulo,
      descricao: descricao || '',
      collab_id,
      prazo: prazo || null,
      prio: prio || 'media',
      delegado_por_id: req.user.id,
      recorrente: !!recorrente,
      intervalo_dias: intervalo_dias || null,
    });
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Tarefa criada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao criar tarefa' });
  }
});

// UPDATE task
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });

    const { titulo, descricao, prazo, prio, done } = req.body;
    const sb = getSupabase();
    const { error } = await sb
      .from('tasks')
      .update({ titulo, descricao, prazo, prio, done: !!done })
      .eq('id', id);
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Tarefa atualizada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao atualizar tarefa' });
  }
});

// DELETE task
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });

    const sb = getSupabase();
    const { error } = await sb.from('tasks').delete().eq('id', id);
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Tarefa removida' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao remover tarefa' });
  }
});

module.exports = router;
