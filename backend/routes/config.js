const express = require('express');
const db = require('../config/database');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();

// GET config
router.get('/', async (req, res) => {
  try {
    const connection = await db.getConnection();
    const [configs] = await connection.query('SELECT config_key, config_value FROM config');
    connection.release();

    const configObj = {};
    configs.forEach(c => {
      configObj[c.config_key] = c.config_value;
    });

    res.json({ ok: true, data: configObj });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar config' });
  }
});

// SET config
router.post('/', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { key, value } = req.body;

    if (!key) {
      return res.status(400).json({ ok: false, msg: 'Chave é obrigatória' });
    }

    const connection = await db.getConnection();
    await connection.query(
      'INSERT INTO config (config_key, config_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_value = ?',
      [key, value, value]
    );
    connection.release();

    res.json({ ok: true, msg: 'Configuração salva' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao salvar configuração' });
  }
});

module.exports = router;
