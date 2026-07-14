const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { getSupabase } = require('../lib/supabase');

const router = express.Router();

// Chaves acessíveis apenas por admin/gerente — contenção temporária: qualquer
// domínio que tenha (ou já teve) dados reais sensíveis e não seja config de
// verdade. Um vendedor/colaborador autenticado não pode ler nenhum destes via
// /api/db, mesmo que a dedicada (/api/users, /api/folha, /api/boletos, etc.)
// já aplique RBAC corretamente — essa rota genérica não deve ser mais uma porta.
// TODO: remover junto com /api/db (ver 04 - Decisões de Arquitetura, ADR de
// eliminação do /api/db, vault Donna Hub v3 - Auditoria 2026-07-13)
const RESTRICTED_READ  = new Set([
  'folha', 'users', 'boletos_p', 'boletos_r', 'tasks', 'pedidos_manuais', 'processos', 'entregas',
]);
// Chaves que vendedor pode escrever
const VENDEDOR_WRITE   = new Set(['tasks', 'entregas', 'metas_vendas']);
// Chaves que nenhum usuário pode sobrescrever via /api/db
const IMMUTABLE_KEYS   = new Set([]);

// GET /api/db — lê hub_config do Supabase (filtrado por role)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('hub_config')
      .select('config_key, config_value');

    if (error) return res.status(500).json({ ok: false, msg: 'Erro ao ler dados' });

    const result = {};
    for (const row of data) {
      // Não-admins/gerentes não veem dados financeiros sensíveis
      if (!['admin', 'gerente'].includes(req.user.role) && RESTRICTED_READ.has(row.config_key)) continue;
      try { result[row.config_key] = JSON.parse(row.config_value); }
      catch { result[row.config_key] = row.config_value; }
    }

    return res.json({ ok: true, data: result });
  } catch (err) {
    console.error('[db/get]', err.message);
    return res.status(500).json({ ok: false, msg: 'Erro interno' });
  }
});

// POST /api/db — escreve hub_config no Supabase (RBAC aplicado)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ ok: false, msg: 'Payload inválido' });
    }

    const keys = Object.keys(body);

    // RBAC: vendedores só podem escrever chaves permitidas
    if (!['admin', 'gerente'].includes(req.user.role)) {
      const forbidden = keys.filter(k => !VENDEDOR_WRITE.has(k));
      if (forbidden.length > 0) {
        return res.status(403).json({ ok: false, msg: `Sem permissão para alterar: ${forbidden.join(', ')}` });
      }
    }

    // Nunca persiste senha em texto claro no hub_config
    if (body.users && Array.isArray(body.users)) {
      body.users = body.users.map(({ senha, password, password_hash, ...rest }) => rest);
    }

    const supabase = getSupabase();
    const rows = keys.map(k => ({
      config_key: k,
      config_value: typeof body[k] === 'string' ? body[k] : JSON.stringify(body[k]),
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('hub_config')
      .upsert(rows, { onConflict: 'config_key' });

    if (error) return res.status(500).json({ ok: false, msg: 'Erro ao salvar dados' });

    return res.json({ ok: true });
  } catch (err) {
    console.error('[db/post]', err.message);
    return res.status(500).json({ ok: false, msg: 'Erro interno' });
  }
});

module.exports = router;
