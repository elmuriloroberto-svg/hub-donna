const express = require('express');
const { getSupabase }                  = require('../lib/supabase');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();

// GET config (lê de hub_config)
router.get('/', async (req, res) => {
  try {
    const sb = getSupabase();
    const { data, error } = await sb.from('hub_config').select('config_key, config_value');
    if (error) throw new Error(error.message);

    const configObj = {};
    (data || []).forEach((c) => { configObj[c.config_key] = c.config_value; });
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
