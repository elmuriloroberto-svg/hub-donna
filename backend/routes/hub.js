const express = require('express');
const { getSupabase }                  = require('../lib/supabase');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();
const isUUID = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// GET all hub entries
router.get('/', authenticateToken, async (req, res) => {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('hub_data')
      .select('id, categoria, titulo, conteudo, meta, ativo, created_by, created_at, updated_at')
      .eq('ativo', true)
      .order('updated_at', { ascending: false });
    if (error) throw new Error(error.message);
    res.json({ ok: true, data: data || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar dados do Hub' });
  }
});

// GET single hub entry
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });

    const sb = getSupabase();
    const { data, error } = await sb.from('hub_data').select('*').eq('id', id).single();
    if (error) return res.status(404).json({ ok: false, msg: 'Registro do Hub não encontrado' });
    res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar registro do Hub' });
  }
});

// CREATE hub entry
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { categoria, titulo, conteudo, meta } = req.body;
    if (!titulo || !conteudo)
      return res.status(400).json({ ok: false, msg: 'Título e conteúdo são obrigatórios' });

    const sb = getSupabase();
    const { error } = await sb.from('hub_data').insert({
      categoria: categoria || 'geral', titulo, conteudo,
      meta: meta || '', created_by: req.user?.id || null,
    });
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Informação do Hub salva com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao salvar informação do Hub' });
  }
});

// UPDATE hub entry
router.put('/:id', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });

    const { categoria, titulo, conteudo, meta, ativo } = req.body;
    if (!titulo || !conteudo)
      return res.status(400).json({ ok: false, msg: 'Título e conteúdo são obrigatórios' });

    const sb = getSupabase();
    const { error } = await sb
      .from('hub_data')
      .update({ categoria: categoria || 'geral', titulo, conteudo, meta: meta || '', ativo: !!ativo })
      .eq('id', id);
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Informação do Hub atualizada com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao atualizar informação do Hub' });
  }
});

// DELETE hub entry
router.delete('/:id', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });

    const sb = getSupabase();
    const { error } = await sb.from('hub_data').delete().eq('id', id);
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Informação do Hub removida' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao remover informação do Hub' });
  }
});

module.exports = router;
