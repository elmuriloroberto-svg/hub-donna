const express = require('express');
const db = require('../config/database');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();

// GET all hub entries
router.get('/', authenticateToken, async (req, res) => {
  try {
    const connection = await db.getConnection();
    const [rows] = await connection.query(
      'SELECT id, categoria, titulo, conteudo, meta, ativo, created_by, created_at, updated_at FROM hub_data WHERE ativo = 1 ORDER BY updated_at DESC'
    );
    connection.release();

    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar dados do Hub' });
  }
});

// GET single hub entry by id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await db.getConnection();
    const [rows] = await connection.query(
      'SELECT id, categoria, titulo, conteudo, meta, ativo, created_by, created_at, updated_at FROM hub_data WHERE id = ?',
      [id]
    );
    connection.release();

    if (!rows.length) {
      return res.status(404).json({ ok: false, msg: 'Registro do Hub não encontrado' });
    }

    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar registro do Hub' });
  }
});

// CREATE hub entry
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { categoria, titulo, conteudo, meta } = req.body;
    const created_by = req.user?.id || null;

    if (!titulo || !conteudo) {
      return res.status(400).json({ ok: false, msg: 'Título e conteúdo são obrigatórios' });
    }

    const connection = await db.getConnection();
    await connection.query(
      'INSERT INTO hub_data (categoria, titulo, conteudo, meta, ativo, created_by) VALUES (?, ?, ?, ?, 1, ?)',
      [categoria || 'geral', titulo, conteudo, meta || '', created_by]
    );
    connection.release();

    res.json({ ok: true, msg: 'Informação do Hub salva com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao salvar informação do Hub' });
  }
});

// UPDATE hub entry — apenas admin/gerente
router.put('/:id', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { id } = req.params;
    const { categoria, titulo, conteudo, meta, ativo } = req.body;

    if (!titulo || !conteudo) {
      return res.status(400).json({ ok: false, msg: 'Título e conteúdo são obrigatórios' });
    }

    const connection = await db.getConnection();
    await connection.query(
      'UPDATE hub_data SET categoria = ?, titulo = ?, conteudo = ?, meta = ?, ativo = ? WHERE id = ?',
      [categoria || 'geral', titulo, conteudo, meta || '', ativo ? 1 : 0, id]
    );
    connection.release();

    res.json({ ok: true, msg: 'Informação do Hub atualizada com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao atualizar informação do Hub' });
  }
});

// DELETE hub entry — apenas admin/gerente
router.delete('/:id', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await db.getConnection();
    await connection.query('DELETE FROM hub_data WHERE id = ?', [id]);
    connection.release();

    res.json({ ok: true, msg: 'Informação do Hub removida' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao remover informação do Hub' });
  }
});

module.exports = router;
