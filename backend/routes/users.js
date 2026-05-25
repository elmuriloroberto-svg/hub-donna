const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../config/database');
const { authenticateToken, authorize } = require('../middleware/auth');
const { sanitizeStr, isPositiveInt }   = require('../middleware/security');

const router = express.Router();
const VALID_ROLES = ['admin', 'gerente', 'colaborador'];

// GET all users
router.get('/', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const connection = await db.getConnection();
    const [users] = await connection.query(
      'SELECT id, login, nome, role, ativo, created_at FROM users ORDER BY nome'
    );
    connection.release();
    res.json({ ok: true, data: users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar usuários' });
  }
});

// CREATE user — senha é hasheada com bcrypt antes de ir ao banco
router.post('/', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const login = sanitizeStr(req.body.login, 100);
    const senha = sanitizeStr(req.body.senha, 128);
    const nome  = sanitizeStr(req.body.nome, 150);
    const role  = sanitizeStr(req.body.role, 50);

    if (!login || !senha || !nome || !role) {
      return res.status(400).json({ ok: false, msg: 'Campos obrigatórios faltando' });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ ok: false, msg: 'Role inválido' });
    }

    if (senha.length < 8) {
      return res.status(400).json({ ok: false, msg: 'Senha deve ter no mínimo 8 caracteres' });
    }

    const connection = await db.getConnection();
    const [existing] = await connection.query('SELECT id FROM users WHERE login = ?', [login]);

    if (existing && existing.length > 0) {
      connection.release();
      return res.status(400).json({ ok: false, msg: 'Login já existe' });
    }

    const hashedSenha = await bcrypt.hash(senha, 12);

    await connection.query(
      'INSERT INTO users (login, senha, nome, role, ativo) VALUES (?, ?, ?, ?, 1)',
      [login, hashedSenha, nome, role]
    );
    connection.release();

    res.json({ ok: true, msg: 'Usuário criado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao criar usuário' });
  }
});

// UPDATE user
router.put('/:id', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!isPositiveInt(id)) {
      return res.status(400).json({ ok: false, msg: 'ID inválido' });
    }

    const nome  = sanitizeStr(req.body.nome, 150);
    const role  = sanitizeStr(req.body.role, 50);
    const ativo = req.body.ativo ? 1 : 0;

    if (!nome || !role) {
      return res.status(400).json({ ok: false, msg: 'Nome e role são obrigatórios' });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ ok: false, msg: 'Role inválido' });
    }

    const connection = await db.getConnection();
    await connection.query(
      'UPDATE users SET nome = ?, role = ?, ativo = ? WHERE id = ?',
      [nome, role, ativo, id]
    );
    connection.release();

    res.json({ ok: true, msg: 'Usuário atualizado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao atualizar usuário' });
  }
});

// DELETE user (protege admins)
router.delete('/:id', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!isPositiveInt(id)) {
      return res.status(400).json({ ok: false, msg: 'ID inválido' });
    }

    const connection = await db.getConnection();
    await connection.query('DELETE FROM users WHERE id = ? AND role != "admin"', [id]);
    connection.release();

    res.json({ ok: true, msg: 'Usuário removido' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao remover usuário' });
  }
});

module.exports = router;
