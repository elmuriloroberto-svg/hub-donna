const express = require('express');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const db      = require('../config/database');
const { sanitizeStr } = require('../middleware/security');

const router = express.Router();

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const login = sanitizeStr(req.body.login, 100);
    const senha = sanitizeStr(req.body.senha, 128);
    const role  = sanitizeStr(req.body.role,  50);

    if (!login || !senha || !role) {
      return res.status(400).json({ ok: false, msg: 'Credenciais inválidas' });
    }

    const connection = await db.getConnection();
    const [rows] = await connection.query(
      'SELECT id, login, nome, role, senha, ativo FROM users WHERE login = ? AND role = ? LIMIT 1',
      [login, role]
    );
    connection.release();

    // Resposta genérica em todos os casos de falha — evita enumeração de usuários
    const INVALID = { ok: false, msg: 'Credenciais inválidas' };

    if (!rows || rows.length === 0) {
      return res.status(401).json(INVALID);
    }

    const user = rows[0];

    if (!user.ativo) {
      return res.status(401).json({ ok: false, msg: 'Usuário inativo' });
    }

    const passwordMatch = await bcrypt.compare(senha, user.senha);
    if (!passwordMatch) {
      return res.status(401).json(INVALID);
    }

    const token = jwt.sign(
      { id: user.id, login: user.login, nome: user.nome, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.json({
      ok: true,
      token,
      user: { login: user.login, nome: user.nome, role: user.role },
    });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ ok: false, msg: 'Erro no servidor' });
  }
});

module.exports = router;
