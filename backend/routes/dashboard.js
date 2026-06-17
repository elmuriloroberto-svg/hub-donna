const express = require('express');
const { getSupabase }       = require('../lib/supabase');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/dashboard — alertas unificados para o dashboard
// Retorna: boletos a vencer (7 dias), eventos do calendário hoje/amanhã
router.get('/', authenticateToken, async (req, res) => {
  try {
    const sb   = getSupabase();
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const em7  = new Date(hoje); em7.setDate(em7.getDate() + 7);
    const fmt  = d => d.toISOString().slice(0, 10);

    const [bpRes, evData] = await Promise.all([
      sb.from('boletos_pagar')
        .select('id, fornecedor, valor, vencimento')
        .eq('status', 'pendente')
        .lte('vencimento', fmt(em7))
        .order('vencimento'),

      // Eventos calendário hoje + amanhã — fallback silencioso se tabela não existir
      sb.from('calendario_eventos')
        .select('id, titulo, emoji, data_inicio, cor')
        .gte('data_inicio', fmt(hoje))
        .lt('data_inicio', fmt(new Date(hoje.getTime() + 2 * 86400000)))
        .order('data_inicio')
        .then(r => r.data || [])
        .catch(() => []),
    ]);

    const boletos = (bpRes.data || []).map(b => {
      const dias = Math.round((new Date(b.vencimento + 'T00:00:00') - hoje) / 86400000);
      return {
        ...b,
        dias_para_vencer: dias,
        nivel: dias < 0 ? 'danger' : dias === 0 ? 'danger' : dias <= 3 ? 'warn' : 'info',
      };
    });

    res.json({
      ok: true,
      data: {
        boletos,
        boletos_vencidos: boletos.filter(b => b.dias_para_vencer < 0).length,
        valor_vencidos:   boletos.filter(b => b.dias_para_vencer < 0)
                                 .reduce((s, b) => s + parseFloat(b.valor || 0), 0),
        eventos_hoje: evData,
      },
    });
  } catch (err) {
    console.error('[dashboard]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar dados do dashboard' });
  }
});

module.exports = router;
