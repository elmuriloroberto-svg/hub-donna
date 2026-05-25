const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET all tasks
router.get('/', authenticateToken, async (req, res) => {
  try {
    const connection = await db.getConnection();
    const [tasks] = await connection.query(
      'SELECT t.*, u.nome as collab_nome FROM tasks t JOIN users u ON t.collab_id = u.id ORDER BY t.prazo DESC'
    );
    connection.release();

    res.json({ ok: true, data: tasks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar tarefas' });
  }
});

// CREATE task
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { titulo, descricao, collab_id, prazo, prio, recorrente, intervalo_dias } = req.body;

    if (!titulo || !collab_id) {
      return res.status(400).json({ ok: false, msg: 'Campos obrigatórios faltando' });
    }

    const connection = await db.getConnection();
    await connection.query(
      'INSERT INTO tasks (titulo, descricao, collab_id, prazo, prio, delegado_por_id, recorrente, intervalo_dias, done) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)',
      [titulo, descricao || '', collab_id, prazo || null, prio || 'media', req.user.id, recorrente ? 1 : 0, intervalo_dias || null]
    );
    connection.release();

    res.json({ ok: true, msg: 'Tarefa criada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao criar tarefa' });
  }
});

// UPDATE task
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, descricao, prazo, prio, done } = req.body;

    const connection = await db.getConnection();
    await connection.query(
      'UPDATE tasks SET titulo = ?, descricao = ?, prazo = ?, prio = ?, done = ? WHERE id = ?',
      [titulo, descricao, prazo, prio, done ? 1 : 0, id]
    );
    connection.release();

    res.json({ ok: true, msg: 'Tarefa atualizada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao atualizar tarefa' });
  }
});

// DELETE task
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const connection = await db.getConnection();
    await connection.query('DELETE FROM tasks WHERE id = ?', [id]);
    connection.release();

    res.json({ ok: true, msg: 'Tarefa removida' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao remover tarefa' });
  }
});

module.exports = router;
