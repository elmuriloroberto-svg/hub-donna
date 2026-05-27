const express = require('express');
const { getSupabase }       = require('../lib/supabase');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET dashboard data
router.get('/', authenticateToken, async (req, res) => {
  try {
    const sb   = getSupabase();
    const hoje = new Date().toISOString().split('T')[0];

    const [bpRes, taskRes, uberRes] = await Promise.all([
      sb.from('boletos_pagar').select('valor').neq('status', 'pago').lte('vencimento', hoje),
      sb.from('tasks').select('id').eq('done', false),
      sb.from('entregas').select('valor_cobrado, valor_uber'),
    ]);

    const valor_vencidos    = (bpRes.data || []).reduce((s, r) => s + parseFloat(r.valor || 0), 0);
    const boletos_vencidos  = (bpRes.data || []).length;
    const tarefas_pendentes = (taskRes.data || []).length;
    const cobrado           = (uberRes.data || []).reduce((s, r) => s + parseFloat(r.valor_cobrado || 0), 0);
    const uber              = (uberRes.data || []).reduce((s, r) => s + parseFloat(r.valor_uber || 0), 0);
    const lucro_uber_mes    = cobrado - uber;

    res.json({
      ok: true,
      data: { valor_vencidos, tarefas_pendentes, boletos_vencidos, lucro_uber_mes, alertas: [] },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar dashboard' });
  }
});

module.exports = router;
