const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET all entregas
router.get('/', authenticateToken, async (req, res) => {
  try {
    const connection = await db.getConnection();
    const [entregas] = await connection.query(
      'SELECT e.*, c.nome as cliente_nome FROM entregas e LEFT JOIN clientes c ON e.cliente_id = c.id ORDER BY e.data DESC'
    );
    connection.release();

    res.json({ ok: true, data: entregas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar entregas' });
  }
});

// GET resumo Uber
router.get('/resumo/uber', authenticateToken, async (req, res) => {
  try {
    const connection = await db.getConnection();
    const [result] = await connection.query(
      'SELECT COUNT(*) as total_entregas, SUM(valor_cobrado) as total_cobrado, SUM(valor_uber) as total_uber FROM entregas'
    );
    connection.release();

    const data = result[0] || { total_entregas: 0, total_cobrado: 0, total_uber: 0 };
    const total_lucro = (parseFloat(data.total_cobrado) || 0) - (parseFloat(data.total_uber) || 0);

    res.json({ ok: true, data: { ...data, total_lucro } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar resumo Uber' });
  }
});

// CREATE entrega
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { data, cliente_id, descricao, valor_cobrado, valor_uber, obs } = req.body;

    if (!data || !valor_cobrado || !valor_uber) {
      return res.status(400).json({ ok: false, msg: 'Campos obrigatórios faltando' });
    }

    const connection = await db.getConnection();
    await connection.query(
      'INSERT INTO entregas (data, cliente_id, descricao, valor_cobrado, valor_uber, status, obs) VALUES (?, ?, ?, ?, ?, "realizada", ?)',
      [data, cliente_id || null, descricao || '', valor_cobrado, valor_uber, obs || '']
    );
    connection.release();

    res.json({ ok: true, msg: 'Entrega registrada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao criar entrega' });
  }
});

// DELETE entrega
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const connection = await db.getConnection();
    await connection.query('DELETE FROM entregas WHERE id = ?', [id]);
    connection.release();

    res.json({ ok: true, msg: 'Entrega removida' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao remover entrega' });
  }
});

module.exports = router;
