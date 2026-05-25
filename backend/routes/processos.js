const express = require('express');
const db = require('../config/database');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();

// GET all processos
router.get('/', authenticateToken, async (req, res) => {
  try {
    const connection = await db.getConnection();
    const [processos] = await connection.query(
      'SELECT p.*, u.nome as autor_nome FROM processos p LEFT JOIN users u ON p.autor_id = u.id ORDER BY p.titulo'
    );
    connection.release();

    res.json({ ok: true, data: processos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar processos' });
  }
});

// CREATE processo
router.post('/', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { titulo, categoria, conteudo } = req.body;

    if (!titulo || !conteudo) {
      return res.status(400).json({ ok: false, msg: 'Campos obrigatórios faltando' });
    }

    const hoje = new Date().toISOString().split('T')[0];
    const connection = await db.getConnection();
    await connection.query(
      'INSERT INTO processos (titulo, categoria, conteudo, autor_id, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)',
      [titulo, categoria || '', conteudo, req.user.id, hoje, hoje]
    );
    connection.release();

    res.json({ ok: true, msg: 'Processo criado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao criar processo' });
  }
});

// UPDATE processo
router.put('/:id', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, categoria, conteudo } = req.body;
    const hoje = new Date().toISOString().split('T')[0];

    const connection = await db.getConnection();
    await connection.query(
      'UPDATE processos SET titulo = ?, categoria = ?, conteudo = ?, atualizado_em = ? WHERE id = ?',
      [titulo, categoria, conteudo, hoje, id]
    );
    connection.release();

    res.json({ ok: true, msg: 'Processo atualizado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao atualizar processo' });
  }
});

// DELETE processo
router.delete('/:id', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { id } = req.params;

    const connection = await db.getConnection();
    await connection.query('DELETE FROM processos WHERE id = ?', [id]);
    connection.release();

    res.json({ ok: true, msg: 'Processo removido' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao remover processo' });
  }
});

module.exports = router;
