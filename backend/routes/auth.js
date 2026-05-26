const express = require('express');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const { getSupabase }      = require('../lib/supabase');
const { sanitizeStr }      = require('../middleware/security');
const { setCookie, clearCookie } = require('../middleware/cookies');
const { authenticateToken }      = require('../middleware/auth');

const router = express.Router();

const COOKIE_NAME    = 'rubi_session';
const COOKIE_MAX_AGE = parseInt(process.env.JWT_EXPIRE_SECONDS || String(24 * 60 * 60));

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const login = sanitizeStr(req.body.login, 100);
    const senha = sanitizeStr(req.body.senha, 128);

    if (!login || !senha) {
      return res.status(400).json({ ok: false, msg: 'Credenciais inválidas' });
    }

    const INVALID = { ok: false, msg: 'Usuário ou senha incorretos' };

    // Busca o usuário pelo username — role NÃO vem do cliente
    const supabase = getSupabase();
    const { data: users, error } = await supabase
      .from('rubi_users')
      .select('id, username, nome, role, password_hash, ativo')
      .eq('username', login)
      .limit(1);

    if (error) {
      console.error('[auth/login] supabase error:', error.message);
      return res.status(500).json({ ok: false, msg: 'Erro interno. Tente novamente.' });
    }

    const user = users?.[0];

    if (!user) {
      // Constante de tempo — evita timing oracle de enumeração de usuários
      await bcrypt.compare('_dummy_', '$2a$12$invalidhashinvalidhashinvalidhashOK12345678');
      return res.status(401).json(INVALID);
    }

    if (!user.ativo) {
      return res.status(401).json({ ok: false, msg: 'Usuário inativo. Contate o administrador.' });
    }

    const passwordMatch = await bcrypt.compare(senha, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json(INVALID);
    }

    const token = jwt.sign(
      { id: user.id, login: user.username, nome: user.nome, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: COOKIE_MAX_AGE }
    );

    // JWT em cookie HttpOnly — JavaScript não consegue ler, bloqueia XSS
    setCookie(res, COOKIE_NAME, token, { maxAge: COOKIE_MAX_AGE });

    // Token NÃO retornado no body — só role/nome para renderizar a UI
    res.json({
      ok: true,
      user: { login: user.username, nome: user.nome, role: user.role },
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

// GET /api/auth/me — restaura sessão após reload de página
router.get('/me', authenticateToken, (req, res) => {
  res.json({
    ok: true,
    user: { login: req.user.login, nome: req.user.nome, role: req.user.role },
  });
});

module.exports = router;
