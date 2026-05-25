const express = require('express');
const db      = require('../config/database');
const { authenticateToken }          = require('../middleware/auth');
const { sanitizeStr, isPositiveInt } = require('../middleware/security');

const router = express.Router();

// GET all clientes
router.get('/', authenticateToken, async (req, res) => {
  try {
    const connection = await db.getConnection();
    const [clientes] = await connection.query(
      'SELECT id, nome, tipo, telefone, email, endereco, cpf_cnpj, obs, ativo FROM clientes WHERE ativo = 1 ORDER BY nome'
    );
    connection.release();
    res.json({ ok: true, data: clientes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar clientes' });
  }
});

// CREATE cliente
router.post('/', authenticateToken, async (req, res) => {
  try {
    const nome      = sanitizeStr(req.body.nome, 150);
    const tipo      = sanitizeStr(req.body.tipo, 50);
    const telefone  = sanitizeStr(req.body.telefone, 20);
    const email     = sanitizeStr(req.body.email, 150);
    const endereco  = sanitizeStr(req.body.endereco, 255);
    const cpf_cnpj  = sanitizeStr(req.body.cpf_cnpj, 20);
    const obs       = sanitizeStr(req.body.obs, 500);

    if (!nome) {
      return res.status(400).json({ ok: false, msg: 'Nome é obrigatório' });
    }

    const connection = await db.getConnection();
    await connection.query(
      'INSERT INTO clientes (nome, tipo, telefone, email, endereco, cpf_cnpj, obs, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
      [nome, tipo, telefone, email, endereco, cpf_cnpj, obs]
    );
    connection.release();

    res.json({ ok: true, msg: 'Cliente criado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao criar cliente' });
  }
});

// UPDATE cliente
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isPositiveInt(id)) {
      return res.status(400).json({ ok: false, msg: 'ID inválido' });
    }

    const nome      = sanitizeStr(req.body.nome, 150);
    const tipo      = sanitizeStr(req.body.tipo, 50);
    const telefone  = sanitizeStr(req.body.telefone, 20);
    const email     = sanitizeStr(req.body.email, 150);
    const endereco  = sanitizeStr(req.body.endereco, 255);
    const cpf_cnpj  = sanitizeStr(req.body.cpf_cnpj, 20);
    const obs       = sanitizeStr(req.body.obs, 500);
    const ativo     = req.body.ativo ? 1 : 0;

    const connection = await db.getConnection();
    await connection.query(
      'UPDATE clientes SET nome = ?, tipo = ?, telefone = ?, email = ?, endereco = ?, cpf_cnpj = ?, obs = ?, ativo = ? WHERE id = ?',
      [nome, tipo, telefone, email, endereco, cpf_cnpj, obs, ativo, id]
    );
    connection.release();

    res.json({ ok: true, msg: 'Cliente atualizado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao atualizar cliente' });
  }
});

// DELETE cliente
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isPositiveInt(id)) {
      return res.status(400).json({ ok: false, msg: 'ID inválido' });
    }

    const connection = await db.getConnection();
    await connection.query('DELETE FROM clientes WHERE id = ?', [id]);
    connection.release();

    res.json({ ok: true, msg: 'Cliente removido' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao remover cliente' });
  }
});

module.exports = router;
