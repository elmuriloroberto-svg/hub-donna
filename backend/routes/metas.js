const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET all metas
router.get('/', authenticateToken, async (req, res) => {
  try {
    const connection = await db.getConnection();
    const [metas] = await connection.query(
      'SELECT m.*, u.nome as colaborador_nome FROM metas m JOIN users u ON m.colaborador_id = u.id ORDER BY m.mes DESC'
    );
    connection.release();

    res.json({ ok: true, data: metas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar metas' });
  }
});

// CREATE meta
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { colaborador_id, mes, meta_valor, realizado } = req.body;

    if (!colaborador_id || !mes || !meta_valor) {
      return res.status(400).json({ ok: false, msg: 'Campos obrigatórios faltando' });
    }

    const connection = await db.getConnection();
    await connection.query(
      'INSERT INTO metas (colaborador_id, mes, meta_valor, realizado) VALUES (?, ?, ?, ?)',
      [colaborador_id, mes, meta_valor, realizado || 0]
    );
    connection.release();

    res.json({ ok: true, msg: 'Meta criada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao criar meta' });
  }
});

// UPDATE meta
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { meta_valor, realizado } = req.body;

    const connection = await db.getConnection();
    await connection.query(
      'UPDATE metas SET meta_valor = ?, realizado = ? WHERE id = ?',
      [meta_valor, realizado, id]
    );
    connection.release();

    res.json({ ok: true, msg: 'Meta atualizada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao atualizar meta' });
  }
});

module.exports = router;
