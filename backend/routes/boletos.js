const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET boletos pagar
router.get('/pagar', authenticateToken, async (req, res) => {
  try {
    const connection = await db.getConnection();
    const [boletos] = await connection.query(
      'SELECT id, fornecedor, valor, vencimento, status, obs FROM boletos_pagar ORDER BY vencimento DESC'
    );
    connection.release();

    res.json({ ok: true, data: boletos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar boletos' });
  }
});

// GET boletos receber
router.get('/receber', authenticateToken, async (req, res) => {
  try {
    const connection = await db.getConnection();
    const [boletos] = await connection.query(
      'SELECT br.id, c.nome as cliente, br.valor, br.vencimento, br.status, br.pedido FROM boletos_receber br LEFT JOIN clientes c ON br.cliente_id = c.id ORDER BY br.vencimento DESC'
    );
    connection.release();

    res.json({ ok: true, data: boletos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar recebíveis' });
  }
});

// CREATE boleto pagar
router.post('/pagar', authenticateToken, async (req, res) => {
  try {
    const { fornecedor, valor, vencimento, status, obs } = req.body;

    if (!fornecedor || !valor || !vencimento) {
      return res.status(400).json({ ok: false, msg: 'Campos obrigatórios faltando' });
    }

    const connection = await db.getConnection();
    await connection.query(
      'INSERT INTO boletos_pagar (fornecedor, valor, vencimento, status, obs, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [fornecedor, valor, vencimento, status || 'pendente', obs || '', req.user.id]
    );
    connection.release();

    res.json({ ok: true, msg: 'Boleto criado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao criar boleto' });
  }
});

// UPDATE boleto pagar
router.put('/pagar/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { fornecedor, valor, vencimento, status, obs } = req.body;

    const connection = await db.getConnection();
    await connection.query(
      'UPDATE boletos_pagar SET fornecedor = ?, valor = ?, vencimento = ?, status = ?, obs = ? WHERE id = ?',
      [fornecedor, valor, vencimento, status, obs, id]
    );
    connection.release();

    res.json({ ok: true, msg: 'Boleto atualizado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao atualizar boleto' });
  }
});

// DELETE boleto pagar
router.delete('/pagar/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const connection = await db.getConnection();
    await connection.query('DELETE FROM boletos_pagar WHERE id = ?', [id]);
    connection.release();

    res.json({ ok: true, msg: 'Boleto removido' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao remover boleto' });
  }
});

module.exports = router;
