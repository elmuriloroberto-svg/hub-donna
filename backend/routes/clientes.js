const express = require('express');
const { getSupabase }              = require('../lib/supabase');
const { authenticateToken }        = require('../middleware/auth');
const { sanitizeStr }              = require('../middleware/security');

const router = express.Router();
const isUUID = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// GET all clientes ativos
router.get('/', authenticateToken, async (req, res) => {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('clientes')
      .select('id, nome, tipo, telefone, email, endereco, cpf_cnpj, obs, ativo')
      .eq('ativo', true)
      .order('nome');
    if (error) throw new Error(error.message);
    res.json({ ok: true, data: data || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar clientes' });
  }
});

// CREATE cliente
router.post('/', authenticateToken, async (req, res) => {
  try {
    const nome     = sanitizeStr(req.body.nome, 150);
    const tipo     = sanitizeStr(req.body.tipo, 50);
    const telefone = sanitizeStr(req.body.telefone, 20);
    const email    = sanitizeStr(req.body.email, 150);
    const endereco = sanitizeStr(req.body.endereco, 255);
    const cpf_cnpj = sanitizeStr(req.body.cpf_cnpj, 20);
    const obs      = sanitizeStr(req.body.obs, 500);

    if (!nome) return res.status(400).json({ ok: false, msg: 'Nome é obrigatório' });

    const sb = getSupabase();
    const { error } = await sb.from('clientes').insert({ nome, tipo, telefone, email, endereco, cpf_cnpj, obs });
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Cliente criado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao criar cliente' });
  }
});

// UPDATE cliente
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });

    const nome     = sanitizeStr(req.body.nome, 150);
    const tipo     = sanitizeStr(req.body.tipo, 50);
    const telefone = sanitizeStr(req.body.telefone, 20);
    const email    = sanitizeStr(req.body.email, 150);
    const endereco = sanitizeStr(req.body.endereco, 255);
    const cpf_cnpj = sanitizeStr(req.body.cpf_cnpj, 20);
    const obs      = sanitizeStr(req.body.obs, 500);
    const ativo    = !!req.body.ativo;

    const sb = getSupabase();
    const { error } = await sb
      .from('clientes')
      .update({ nome, tipo, telefone, email, endereco, cpf_cnpj, obs, ativo })
      .eq('id', id);
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Cliente atualizado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao atualizar cliente' });
  }
});

// DELETE cliente
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });

    const sb = getSupabase();
    const { error } = await sb.from('clientes').delete().eq('id', id);
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Cliente removido' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao remover cliente' });
  }
});

module.exports = router;
