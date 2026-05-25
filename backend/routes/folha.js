const express = require('express');
const db = require('../config/database');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();

// GET all folhas
router.get('/', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const connection = await db.getConnection();
    const [folhas] = await connection.query(
      'SELECT f.*, u.nome as colaborador_nome FROM folha f JOIN users u ON f.colaborador_id = u.id ORDER BY f.mes DESC'
    );
    connection.release();

    res.json({ ok: true, data: folhas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar folhas' });
  }
});

// CREATE folha
router.post('/', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { colaborador_id, mes, salario_base, comissao, bonus, descontos, obs } = req.body;

    if (!colaborador_id || !mes || !salario_base) {
      return res.status(400).json({ ok: false, msg: 'Campos obrigatórios faltando' });
    }

    const total_liquido = (parseFloat(salario_base) || 0) + (parseFloat(comissao) || 0) + (parseFloat(bonus) || 0) - (parseFloat(descontos) || 0);

    const connection = await db.getConnection();
    await connection.query(
      'INSERT INTO folha (colaborador_id, mes, salario_base, comissao, bonus, descontos, total_liquido, obs) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [colaborador_id, mes, salario_base, comissao || 0, bonus || 0, descontos || 0, total_liquido, obs || '']
    );
    connection.release();

    res.json({ ok: true, msg: 'Folha criada', data: { total_liquido } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao criar folha' });
  }
});

// DELETE folha
router.delete('/:id', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { id } = req.params;

    const connection = await db.getConnection();
    await connection.query('DELETE FROM folha WHERE id = ?', [id]);
    connection.release();

    res.json({ ok: true, msg: 'Folha removida' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao remover folha' });
  }
});

module.exports = router;
