const express = require('express');
const { getSupabase }       = require('../lib/supabase');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();
const isUUID = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const GERAL_SENTINEL = '__GERAL__';

function semanaAtual() {
  const hoje = new Date();
  const diaDaSemana = hoje.getDay(); // 0=Dom, 1=Seg...
  const diffParaSeg = diaDaSemana === 0 ? -6 : 1 - diaDaSemana;
  const seg = new Date(hoje);
  seg.setDate(hoje.getDate() + diffParaSeg);
  seg.setHours(0, 0, 0, 0);
  const dom = new Date(seg);
  dom.setDate(seg.getDate() + 6);
  return {
    inicio: seg.toISOString().split('T')[0],
    fim:    dom.toISOString().split('T')[0],
  };
}

// GET /api/metas/semana — metas cujo período cobre hoje (ou data_inicio passada via ?inicio=)
router.get('/semana', authenticateToken, async (req, res) => {
  try {
    const hoje = req.query.inicio || new Date().toISOString().split('T')[0];
    const sb = getSupabase();

    // Retorna metas onde data_inicio <= hoje <= data_fim
    const { data: rows, error } = await sb.from('metas_semanais').select('*')
      .lte('data_inicio', hoje)
      .gte('data_fim', hoje);
    if (error) throw new Error(error.message);

    let data = rows || [];

    // vendedor vê a meta geral da loja + a própria meta individual (fuzzy por nome)
    if (req.user.role === 'vendedor') {
      const nome = (req.user.nome || req.user.login || '').toLowerCase().trim();
      data = data.filter((m) =>
        m.tipo === 'geral' || m.vendedor_nome.toLowerCase().includes(nome)
      );
    }

    // Meta geral sempre primeiro, depois individuais em ordem alfabética
    data.sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo === 'geral' ? -1 : 1;
      return a.vendedor_nome.localeCompare(b.vendedor_nome, 'pt-BR');
    });

    // Retorna também as datas reais do período encontrado (para o frontend buscar Tiny com as datas certas)
    const primeiro = data[0];
    const periodo = primeiro
      ? { inicio: primeiro.data_inicio, fim: primeiro.data_fim }
      : semanaAtual();

    res.json({ ok: true, data, semana: periodo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar metas semanais' });
  }
});

// POST /api/metas/semana — salva/atualiza meta da semana (admin e gerente)
// Aceita data_inicio e data_fim customizados no body; padrão = semana atual
router.post('/semana', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { tipo: tipoRaw, vendedor_nome, meta_valor, bonus_por_dez_porcento, data_inicio, data_fim } = req.body;
    const tipo = tipoRaw === 'geral' ? 'geral' : 'individual';

    let vendedorFinal = GERAL_SENTINEL;
    if (tipo === 'individual') {
      if (!vendedor_nome || !vendedor_nome.trim())
        return res.status(400).json({ ok: false, msg: 'Vendedor e meta são obrigatórios' });
      vendedorFinal = vendedor_nome.trim();
    }
    if (meta_valor == null || meta_valor === '')
      return res.status(400).json({ ok: false, msg: 'Vendedor e meta são obrigatórios' });

    const metaNum  = parseFloat(meta_valor);
    const bonusNum = parseFloat(bonus_por_dez_porcento) || 0;
    if (isNaN(metaNum) || metaNum <= 0)
      return res.status(400).json({ ok: false, msg: 'Meta deve ser um valor positivo' });

    // Usa as datas enviadas ou calcula a semana atual
    const semana = semanaAtual();
    const inicio = (data_inicio && /^\d{4}-\d{2}-\d{2}$/.test(data_inicio)) ? data_inicio : semana.inicio;
    const fim    = (data_fim    && /^\d{4}-\d{2}-\d{2}$/.test(data_fim))    ? data_fim    : semana.fim;

    if (fim < inicio)
      return res.status(400).json({ ok: false, msg: 'Data fim não pode ser antes da data início' });

    const sb = getSupabase();
    const { error } = await sb.from('metas_semanais').upsert(
      {
        vendedor_nome: vendedorFinal,
        tipo,
        meta_valor:    metaNum,
        bonus_por_dez_porcento: bonusNum,
        data_inicio:   inicio,
        data_fim:      fim,
        created_by:    req.user.id || null,
        updated_at:    new Date().toISOString(),
      },
      { onConflict: 'vendedor_nome,data_inicio' }
    );
    if (error) throw new Error(error.message);

    res.json({
      ok: true,
      msg: tipo === 'geral' ? 'Meta geral da loja salva!' : 'Meta semanal salva!',
      periodo: { inicio, fim },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao salvar meta semanal' });
  }
});

// ── Meta Mensal (Supabase) ────────────────────────────────────────────────────
// Substitui o armazenamento no localStorage — dados ficam acessíveis a todos os devices.

// GET /api/metas/mensal?mes=YYYY-MM
router.get('/mensal', authenticateToken, async (req, res) => {
  const { mes } = req.query;
  if (!mes || !/^\d{4}-\d{2}$/.test(mes))
    return res.status(400).json({ ok: false, msg: 'Parâmetro mes (YYYY-MM) obrigatório' });
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('metas_mensais')
      .select('*')
      .eq('mes', mes)
      .maybeSingle();
    if (error) throw new Error(error.message);
    res.json({ ok: true, data: data || null });
  } catch (err) {
    res.status(500).json({ ok: false, msg: err.message });
  }
});

// POST /api/metas/mensal — cria ou atualiza (admin only)
router.post('/mensal', authenticateToken, authorize('admin'), async (req, res) => {
  const { mes, meta_total, super_pct = 10 } = req.body;
  if (!mes || !meta_total)
    return res.status(400).json({ ok: false, msg: 'Campos obrigatórios: mes, meta_total' });

  const total = parseFloat(meta_total);
  const spct  = parseFloat(super_pct);
  if (isNaN(total) || total <= 0)
    return res.status(400).json({ ok: false, msg: 'meta_total deve ser positivo' });

  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('metas_mensais')
      .upsert({
        mes,
        meta_total:  total,
        super_pct:   isNaN(spct) ? 10 : spct,
        alterado_por: req.user.id || null,
        alterado_em:  new Date().toISOString(),
      }, { onConflict: 'mes' })
      .select()
      .single();
    if (error) throw new Error(error.message);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, msg: err.message });
  }
});

// GET /api/metas — all individual metas with joined colaborador_nome
router.get('/', authenticateToken, async (req, res) => {
  try {
    const sb = getSupabase();
    const [metaRes, userRes] = await Promise.all([
      sb.from('metas').select('*').order('mes', { ascending: false }),
      sb.from('rubi_users').select('id, nome, username'),
    ]);
    if (metaRes.error) throw new Error(metaRes.error.message);

    const userMap = Object.fromEntries((userRes.data || []).map((u) => [u.id, u]));
    const data = (metaRes.data || []).map((m) => ({
      ...m,
      colaborador_nome:  userMap[m.colaborador_id]?.nome     || m.collab_login || '',
      colaborador_login: userMap[m.colaborador_id]?.username || m.collab_login || '',
    }));
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[metas GET]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar metas' });
  }
});

// POST /api/metas — admin/gerente only; accepts collab_login OR colaborador_id
router.post('/', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { colaborador_id, collab_login, mes, meta_valor, realizado } = req.body;
    if (!mes || meta_valor == null)
      return res.status(400).json({ ok: false, msg: 'Campos obrigatórios: mes, meta_valor' });

    const sb = getSupabase();
    let collabId = colaborador_id;
    let login    = collab_login || '';

    if (!collabId && collab_login) {
      const { data: u } = await sb
        .from('rubi_users').select('id, username').eq('username', collab_login).maybeSingle();
      if (!u) return res.status(400).json({ ok: false, msg: `Colaborador "${collab_login}" não encontrado` });
      collabId = u.id;
      login    = u.username;
    }
    if (!collabId) return res.status(400).json({ ok: false, msg: 'Colaborador obrigatório' });

    const { error } = await sb.from('metas').insert({
      colaborador_id: collabId,
      collab_login:   login,
      mes,
      meta_valor:  parseFloat(meta_valor) || 0,
      realizado:   parseFloat(realizado)  || 0,
      criado_por:  req.user.nome || req.user.login || '',
      criado_em:   new Date().toISOString(),
    });
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Meta criada' });
  } catch (err) {
    console.error('[metas POST]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao criar meta' });
  }
});

// PUT /api/metas/:id — admin/gerente only; records audit who+when
router.put('/:id', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });

    const { meta_valor, realizado } = req.body;
    const update = { atualizado_por: req.user.nome || req.user.login || '', atualizado_em: new Date().toISOString() };
    if (meta_valor != null) update.meta_valor = parseFloat(meta_valor) || 0;
    if (realizado  != null) update.realizado  = parseFloat(realizado)  || 0;

    const sb = getSupabase();
    const { error } = await sb.from('metas').update(update).eq('id', id);
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Meta atualizada' });
  } catch (err) {
    console.error('[metas PUT]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao atualizar meta' });
  }
});

// DELETE /api/metas/:id — admin/gerente only
router.delete('/:id', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });

    const sb = getSupabase();
    const { error } = await sb.from('metas').delete().eq('id', id);
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Meta removida' });
  } catch (err) {
    console.error('[metas DELETE]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao remover meta' });
  }
});

module.exports = router;
