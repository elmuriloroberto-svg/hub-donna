const express = require('express');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const db      = require('../config/database');
const { sanitizeStr } = require('../middleware/security');
const { setCookie, clearCookie } = require('../middleware/cookies');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const COOKIE_NAME = 'rubi_session';
const COOKIE_MAX_AGE = parseInt(process.env.JWT_EXPIRE_SECONDS || String(8 * 60 * 60));

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const login = sanitizeStr(req.body.login, 100);
    const senha = sanitizeStr(req.body.senha, 128);

    if (!login || !senha) {
      return res.status(400).json({ ok: false, msg: 'Credenciais inválidas' });
    }

    const connection = await db.getConnection();
    // Role NÃO vem do cliente — vem exclusivamente do banco de dados
    const [rows] = await connection.query(
      'SELECT id, login, nome, role, senha, ativo FROM users WHERE login = ? LIMIT 1',
      [login]
    );
    connection.release();

    const INVALID = { ok: false, msg: 'Usuário ou senha incorretos' };

    if (!rows || rows.length === 0) {
      // Constante de tempo para evitar timing oracle de enumeração de usuários
      await bcrypt.compare('_dummy_', '$2a$12$invalidhashinvalidhashinvalidhashOK123456789012');
      return res.status(401).json(INVALID);
    }

    const user = rows[0];

    if (!user.ativo) {
      return res.status(401).json({ ok: false, msg: 'Usuário inativo. Contate o administrador.' });
    }

    const passwordMatch = await bcrypt.compare(senha, user.senha);
    if (!passwordMatch) {
      return res.status(401).json(INVALID);
    }

    const token = jwt.sign(
      { id: user.id, login: user.login, nome: user.nome, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: COOKIE_MAX_AGE }
    );

    // JWT emitido como cookie HttpOnly — JavaScript não consegue ler, bloqueia XSS
    setCookie(res, COOKIE_NAME, token, { maxAge: COOKIE_MAX_AGE });

    // Role retornado no body para o frontend renderizar a UI correta
    // Token NÃO é retornado no body — ele só existe no cookie
    res.json({
      ok: true,
      user: { login: user.login, nome: user.nome, role: user.role },
    });
  } catch (err) {
    console.error('[auth/login]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro interno. Tente novamente.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearCookie(res, COOKIE_NAME);
  res.json({ ok: true });
});

// GET /api/auth/me — retorna usuário da sessão (útil após reload de página)
router.get('/me', authenticateToken, (req, res) => {
  res.json({
    ok: true,
    user: { login: req.user.login, nome: req.user.nome, role: req.user.role },
  });
});

module.exports = router;
