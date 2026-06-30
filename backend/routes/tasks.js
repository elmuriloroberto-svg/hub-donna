const express = require('express');
const { getSupabase }       = require('../lib/supabase');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const isUUID = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// GET /api/tasks — all tasks with joined collab + delegado names
router.get('/', authenticateToken, async (req, res) => {
  try {
    const sb = getSupabase();
    const [taskRes, userRes] = await Promise.all([
      sb.from('tasks')
        .select('*')
        .order('data_inicio', { ascending: true, nullsFirst: false }),
      sb.from('rubi_users').select('id, nome, username'),
    ]);
    if (taskRes.error) throw new Error(taskRes.error.message);

    const userMap = Object.fromEntries((userRes.data || []).map(u => [u.id, u]));
    const data = (taskRes.data || []).map(t => ({
      ...t,
      collab_nome:        userMap[t.collab_id]?.nome     || '',
      collab_login:       userMap[t.collab_id]?.username || '',
      delegado_por_nome:  userMap[t.delegado_por_id]?.nome || '',
    }));
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[tasks GET]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar tarefas' });
  }
});

// POST /api/tasks — creates task(s)
// When para_todos=true: creates one task per non-admin active user
// Accepts collab_id (UUID) or collab_login (string) — backend resolves UUID
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { titulo, descricao, emoji, collab_id, collab_login, data_inicio, data_fim, prio, para_todos } = req.body;
    if (!titulo) return res.status(400).json({ ok: false, msg: 'Título obrigatório' });

    const sb = getSupabase();
    let collabIds = [];

    if (para_todos) {
      const { data: users } = await sb
        .from('rubi_users').select('id').eq('ativo', true).neq('role', 'admin');
      collabIds = (users || []).map(u => u.id);
      if (!collabIds.length)
        return res.status(400).json({ ok: false, msg: 'Nenhum colaborador activo encontrado' });
    } else if (collab_id && isUUID(collab_id)) {
      collabIds = [collab_id];
    } else if (collab_login) {
      const { data: u } = await sb
        .from('rubi_users').select('id').eq('username', collab_login).maybeSingle();
      if (!u) return res.status(400).json({ ok: false, msg: `Colaborador "${collab_login}" não encontrado` });
      collabIds = [u.id];
    } else {
      return res.status(400).json({ ok: false, msg: 'Colaborador obrigatório' });
    }

    const rows = collabIds.map(cid => ({
      titulo,
      descricao:       descricao || '',
      emoji:           emoji     || '',
      collab_id:       cid,
      data_inicio:     data_inicio || null,
      data_fim:        data_fim    || null,
      prio:            prio        || 'media',
      para_todos:      !!para_todos,
      done:            false,
      delegado_por_id: req.user.id,
    }));

    const { error } = await sb.from('tasks').insert(rows);
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: `${rows.length} tarefa(s) criada(s)` });
  } catch (err) {
    console.error('[tasks POST]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao criar tarefa' });
  }
});

// PUT /api/tasks/:id — update task fields
// If done is being set: backend auto-fills concluido_por and concluido_em from req.user
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });

    const { titulo, descricao, emoji, data_inicio, data_fim, prio, done } = req.body;
    const update = {};
    if (titulo     !== undefined) update.titulo     = titulo;
    if (descricao  !== undefined) update.descricao  = descricao;
    if (emoji      !== undefined) update.emoji      = emoji;
    if (data_inicio !== undefined) update.data_inicio = data_inicio;
    if (data_fim   !== undefined) update.data_fim   = data_fim;
    if (prio       !== undefined) update.prio       = prio;
    if (done !== undefined) {
      update.done = !!done;
      update.concluido_por = done ? (req.user.nome || req.user.login || '') : null;
      update.concluido_em  = done ? new Date().toISOString() : null;
    }

    const sb = getSupabase();
    const { error } = await sb.from('tasks').update(update).eq('id', id);
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Tarefa atualizada', concluido_por: update.concluido_por || null });
  } catch (err) {
    console.error('[tasks PUT]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao atualizar tarefa' });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });
    const sb = getSupabase();
    const { error } = await sb.from('tasks').delete().eq('id', id);
    if (error) throw new Error(error.message);
    res.json({ ok: true, msg: 'Tarefa removida' });
  } catch (err) {
    console.error('[tasks DELETE]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao remover tarefa' });
  }
});

module.exports = router;
