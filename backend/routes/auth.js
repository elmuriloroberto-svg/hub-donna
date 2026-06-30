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
    const login = (sanitizeStr(req.body.login, 100) || '').toLowerCase();
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
    setCookie(res, COOKIE_NAME, token, { maxAge: COOKIE_MAX_AGE * 1000 }); // Express expects ms

    // Busca permissoes e tiny_vendor para renderizar a UI corretamente
    const { data: extra } = await supabase
      .from('rubi_users').select('tiny_vendor, permissoes').eq('id', user.id).maybeSingle();

    res.json({
      ok: true,
      user: {
        login: user.username, nome: user.nome, role: user.role,
        tiny_vendor: extra?.tiny_vendor || '',
        permissoes:  extra?.permissoes  || {},
      },
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

// PUT /api/auth/password — troca a própria senha (qualquer usuário autenticado)
router.put('/password', authenticateToken, async (req, res) => {
  try {
    const senha_atual = sanitizeStr(req.body.senha_atual, 128);
    const nova_senha  = sanitizeStr(req.body.nova_senha,  128);

    if (!senha_atual || !nova_senha)
      return res.status(400).json({ ok: false, msg: 'Senha atual e nova senha são obrigatórias' });
    if (nova_senha.length < 8)
      return res.status(400).json({ ok: false, msg: 'Nova senha deve ter no mínimo 8 caracteres' });

    const sb = getSupabase();
    const { data: users } = await sb
      .from('rubi_users')
      .select('id, password_hash')
      .eq('id', req.user.id)
      .limit(1);

    const user = users?.[0];
    if (!user) return res.status(404).json({ ok: false, msg: 'Usuário não encontrado' });

    const senhaCorreta = await bcrypt.compare(senha_atual, user.password_hash);
    if (!senhaCorreta)
      return res.status(401).json({ ok: false, msg: 'Senha atual incorreta' });

    const password_hash = await bcrypt.hash(nova_senha, 10);
    const { error } = await sb
      .from('rubi_users')
      .update({ password_hash })
      .eq('id', req.user.id);

    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Senha alterada com sucesso' });
  } catch (err) {
    console.error('[auth/password]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao alterar senha' });
  }
});

// GET /api/auth/me — restaura sessão após reload de página
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const sb = getSupabase();
    const { data: extra } = await sb
      .from('rubi_users').select('tiny_vendor, permissoes').eq('id', req.user.id).maybeSingle();
    res.json({
      ok: true,
      user: {
        login: req.user.login, nome: req.user.nome, role: req.user.role,
        tiny_vendor: extra?.tiny_vendor || '',
        permissoes:  extra?.permissoes  || {},
      },
    });
  } catch (_) {
    res.json({ ok: true, user: { login: req.user.login, nome: req.user.nome, role: req.user.role, permissoes: {} } });
  }
});

module.exports = router;
