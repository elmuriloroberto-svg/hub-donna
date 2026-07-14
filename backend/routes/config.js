const express = require('express');
const { getSupabase }                  = require('../lib/supabase');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();

// Única lista de chaves que o frontend efetivamente consome desta rota.
// Nunca devolver o objeto/tabela hub_config completo — ver auditoria P0 2026-07-13.
const PUBLIC_CONFIG_KEYS = ['custos_fixos', 'taxa_cartao'];

// GET config (lê de hub_config, filtrado por whitelist — requer sessão)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('hub_config')
      .select('config_key, config_value')
      .in('config_key', PUBLIC_CONFIG_KEYS);
    if (error) throw new Error(error.message);

    // Segunda camada de filtro: mesmo que a query acima mude no futuro,
    // a resposta nunca inclui chave fora da whitelist.
    const configObj = {};
    (data || []).forEach((c) => {
      if (PUBLIC_CONFIG_KEYS.includes(c.config_key)) configObj[c.config_key] = c.config_value;
    });
    res.json({ ok: true, data: configObj });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar config' });
  }
});

// SET config (upsert em hub_config)
router.post('/', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ ok: false, msg: 'Chave é obrigatória' });

    const sb = getSupabase();
    const { error } = await sb
      .from('hub_config')
      .upsert({ config_key: key, config_value: value, updated_at: new Date().toISOString() }, { onConflict: 'config_key' });
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Configuração salva' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao salvar configuração' });
  }
});

module.exports = router;
