/**
 * syncCrm.js — Sincroniza dados do CRM (Tiny) para o Supabase
 *
 * Chamado pelo cron diário às 3h em server.js.
 * Também pode ser acionado manualmente via GET /api/tiny/sync-crm (admin).
 */

const { getSupabase } = require('../lib/supabase');

const BATCH_SIZE = 500;

async function syncCrmToSupabase(buildCrmTemp) {
  const inicio = Date.now();
  console.log('[syncCrm] Iniciando sync CRM → Supabase...');

  try {
    const data     = await buildCrmTemp(0);
    const clientes = data?.clientes || [];

    if (!clientes.length) {
      console.warn('[syncCrm] Nenhum cliente retornado pelo Tiny — sync abortado.');
      return { ok: false, msg: 'Nenhum cliente' };
    }

    const agora = new Date().toISOString();
    const rows  = clientes.map(c => ({
      nome:            c.nome,
      celular:         c.celular  || '',
      telefone:        c.telefone || '',
      telefones:       c.telefones || [],
      ultimo_pedido:   c.ultimo_pedido || null,
      dias_sem:        c.dias_sem  ?? null,
      temperatura:     c.temperatura,
      qtd_pedidos:     c.qtd_pedidos,
      ticket_medio:    c.ticket_medio,
      frequencia_dias: c.frequencia_dias ?? null,
      total:           c.total,
      atualizado_em:   agora,
    }));

    const supabase = getSupabase();
    let erros = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const lote = rows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('crm_clientes')
        .upsert(lote, { onConflict: 'nome' });
      if (error) {
        erros++;
        console.error(`[syncCrm] Erro lote ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);
      }
    }

    const duracao = Math.round((Date.now() - inicio) / 1000);
    if (erros === 0) {
      console.log(`[syncCrm] ✓ ${clientes.length} clientes sincronizados em ${duracao}s.`);
    } else {
      console.warn(`[syncCrm] Finalizado com ${erros} lote(s) com erro. ${clientes.length} clientes processados em ${duracao}s.`);
    }

    return { ok: erros === 0, total: clientes.length, duracao_s: duracao, erros };
  } catch (e) {
    console.error('[syncCrm] Erro fatal:', e.message);
    return { ok: false, msg: e.message };
  }
}

module.exports = { syncCrmToSupabase };
