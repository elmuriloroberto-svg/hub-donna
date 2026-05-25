const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET dashboard data
router.get('/', authenticateToken, async (req, res) => {
  try {
    const connection = await db.getConnection();

    const hoje = new Date().toISOString().split('T')[0];

    // Boletos vencidos
    const [vencidos] = await connection.query(
      'SELECT SUM(valor) as total FROM boletos_pagar WHERE status != "pago" AND vencimento <= ?',
      [hoje]
    );

    // Tarefas pendentes
    const [tasks] = await connection.query('SELECT COUNT(*) as count FROM tasks WHERE done = 0');

    // Boletos vencidos count
    const [boletosCount] = await connection.query(
      'SELECT COUNT(*) as count FROM boletos_pagar WHERE status != "pago" AND vencimento <= ?',
      [hoje]
    );

    // Lucro Uber
    const [uber] = await connection.query(
      'SELECT SUM(valor_cobrado) as cobrado, SUM(valor_uber) as uber FROM entregas'
    );

    connection.release();

    const valor_vencidos = vencidos[0]?.total || 0;
    const tarefas_pendentes = tasks[0]?.count || 0;
    const boletos_vencidos = boletosCount[0]?.count || 0;
    const lucro_uber_mes = (parseFloat(uber[0]?.cobrado) || 0) - (parseFloat(uber[0]?.uber) || 0);

    res.json({
      ok: true,
      data: {
        valor_vencidos,
        tarefas_pendentes,
        boletos_vencidos,
        lucro_uber_mes,
        alertas: []
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar dashboard' });
  }
});

module.exports = router;
