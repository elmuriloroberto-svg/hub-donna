const express = require('express');
const { getSupabase }                  = require('../lib/supabase');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();
const isUUID = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// GET all processos (com nome do autor)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const sb = getSupabase();
    const [pRes, uRes] = await Promise.all([
      sb.from('processos').select('*').order('titulo'),
      sb.from('rubi_users').select('id, nome'),
    ]);
    if (pRes.error) throw new Error(pRes.error.message);

    const userMap = Object.fromEntries((uRes.data || []).map((u) => [u.id, u.nome]));
    const data = (pRes.data || []).map((p) => ({ ...p, autor_nome: userMap[p.autor_id] || '' }));
    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar processos' });
  }
});

// CREATE processo
router.post('/', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { titulo, categoria, conteudo } = req.body;
    if (!titulo || !conteudo)
      return res.status(400).json({ ok: false, msg: 'Campos obrigatórios faltando' });

    const hoje = new Date().toISOString().split('T')[0];
    const sb = getSupabase();
    const { error } = await sb.from('processos').insert({
      titulo, categoria: categoria || '', conteudo,
      autor_id: req.user.id, criado_em: hoje, atualizado_em: hoje,
    });
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Processo criado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao criar processo' });
  }
});

// UPDATE processo
router.put('/:id', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });

    const { titulo, categoria, conteudo } = req.body;
    const hoje = new Date().toISOString().split('T')[0];
    const sb = getSupabase();
    const { error } = await sb
      .from('processos')
      .update({ titulo, categoria, conteudo, atualizado_em: hoje })
      .eq('id', id);
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Processo atualizado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao atualizar processo' });
  }
});

// DELETE processo
router.delete('/:id', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });

    const sb = getSupabase();
    const { error } = await sb.from('processos').delete().eq('id', id);
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Processo removido' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao remover processo' });
  }
});

module.exports = router;
