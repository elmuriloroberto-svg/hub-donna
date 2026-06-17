const express = require('express');
const { getSupabase }                  = require('../lib/supabase');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();
const isUUID = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// GET /api/folha — all records with joined colaborador_nome
router.get('/', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const sb = getSupabase();
    const [fRes, uRes] = await Promise.all([
      sb.from('folha').select('*').order('mes', { ascending: false }),
      sb.from('rubi_users').select('id, nome, login'),
    ]);
    if (fRes.error) throw new Error(fRes.error.message);

    const userMap = Object.fromEntries((uRes.data || []).map((u) => [u.id, u]));
    const data = (fRes.data || []).map((f) => ({
      ...f,
      colaborador_nome:  userMap[f.colaborador_id]?.nome  || '',
      colaborador_login: userMap[f.colaborador_id]?.login || '',
    }));
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[folha GET]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar folhas' });
  }
});

// POST /api/folha — create payroll record
// Accepts colaborador_id (UUID) OR collab_login (string)
router.post('/', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const {
      colaborador_id, collab_login,
      mes, tipo,
      dias_uteis, faltas, dias_trabalhados,
      salario_base, comissao, bonus, descontos,
      vt, vr, adiantamento,
      meta_valor, meta_realizado, fgts,
      total_liquido, obs,
    } = req.body;

    if (!mes) return res.status(400).json({ ok: false, msg: 'Mês obrigatório' });
    if (!salario_base && salario_base !== 0)
      return res.status(400).json({ ok: false, msg: 'Salário base obrigatório' });

    const sb = getSupabase();
    let collabId = colaborador_id;

    if (!collabId && collab_login) {
      const { data: u } = await sb
        .from('rubi_users').select('id').eq('login', collab_login).maybeSingle();
      if (!u) return res.status(400).json({ ok: false, msg: `Colaborador "${collab_login}" não encontrado` });
      collabId = u.id;
    }
    if (!collabId) return res.status(400).json({ ok: false, msg: 'Colaborador obrigatório' });

    const liq = total_liquido != null
      ? parseFloat(total_liquido)
      : (parseFloat(salario_base) || 0) + (parseFloat(comissao) || 0) + (parseFloat(bonus) || 0)
        - (parseFloat(descontos) || 0) - (parseFloat(adiantamento) || 0);

    const { error } = await sb.from('folha').insert({
      colaborador_id: collabId,
      mes,
      tipo:            tipo || 'clt',
      dias_uteis:      parseInt(dias_uteis)    || 0,
      faltas:          parseInt(faltas)         || 0,
      dias_trabalhados:parseInt(dias_trabalhados)|| 0,
      salario_base:    parseFloat(salario_base) || 0,
      comissao:        parseFloat(comissao)     || 0,
      bonus:           parseFloat(bonus)        || 0,
      descontos:       parseFloat(descontos)    || 0,
      vt:              parseFloat(vt)           || 0,
      vr:              parseFloat(vr)           || 0,
      adiantamento:    parseFloat(adiantamento) || 0,
      meta_valor:      parseFloat(meta_valor)   || 0,
      meta_realizado:  parseFloat(meta_realizado)||0,
      fgts:            parseFloat(fgts)         || 0,
      total_liquido:   liq,
      obs:             obs || '',
    });
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Folha criada', data: { total_liquido: liq } });
  } catch (err) {
    console.error('[folha POST]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao criar folha' });
  }
});

// DELETE /api/folha/:id
router.delete('/:id', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });

    const sb = getSupabase();
    const { error } = await sb.from('folha').delete().eq('id', id);
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Folha removida' });
  } catch (err) {
    console.error('[folha DELETE]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao remover folha' });
  }
});

module.exports = router;
