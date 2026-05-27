const express  = require('express');
const bcrypt   = require('bcryptjs');
const { getSupabase }              = require('../lib/supabase');
const { authenticateToken, authorize } = require('../middleware/auth');
const { sanitizeStr }              = require('../middleware/security');

const router = express.Router();
const VALID_ROLES = ['admin', 'gerente', 'vendedor', 'colaborador'];
const isUUID = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// GET all users
router.get('/', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('rubi_users')
      .select('id, username, nome, role, ativo, created_at')
      .order('nome');
    if (error) throw new Error(error.message);
    // expose as "login" para compatibilidade com o frontend
    const users = (data || []).map((u) => ({ ...u, login: u.username }));
    res.json({ ok: true, data: users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao buscar usuários' });
  }
});

// CREATE user
router.post('/', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const login = sanitizeStr(req.body.login, 100);
    const senha = sanitizeStr(req.body.senha, 128);
    const nome  = sanitizeStr(req.body.nome, 150);
    const role  = sanitizeStr(req.body.role, 50);

    if (!login || !senha || !nome || !role)
      return res.status(400).json({ ok: false, msg: 'Campos obrigatórios faltando' });
    if (!VALID_ROLES.includes(role))
      return res.status(400).json({ ok: false, msg: 'Role inválido' });
    if (senha.length < 8)
      return res.status(400).json({ ok: false, msg: 'Senha deve ter no mínimo 8 caracteres' });

    const sb = getSupabase();
    const { data: existing } = await sb.from('rubi_users').select('id').eq('username', login);
    if (existing && existing.length > 0)
      return res.status(400).json({ ok: false, msg: 'Login já existe' });

    const password_hash = await bcrypt.hash(senha, 10);
    const { error } = await sb.from('rubi_users').insert({ username: login, password_hash, nome, role });
    if (error) throw new Error(error.message);

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
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });

    const nome  = sanitizeStr(req.body.nome, 150);
    const role  = sanitizeStr(req.body.role, 50);
    const ativo = !!req.body.ativo;

    if (!nome || !role) return res.status(400).json({ ok: false, msg: 'Nome e role são obrigatórios' });
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ ok: false, msg: 'Role inválido' });

    const sb = getSupabase();
    const { error } = await sb.from('rubi_users').update({ nome, role, ativo }).eq('id', id);
    if (error) throw new Error(error.message);

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
    if (!isUUID(id)) return res.status(400).json({ ok: false, msg: 'ID inválido' });

    const sb = getSupabase();
    // impede deletar admins
    const { data: user } = await sb.from('rubi_users').select('role').eq('id', id).single();
    if (user?.role === 'admin')
      return res.status(403).json({ ok: false, msg: 'Não é possível remover um admin' });

    const { error } = await sb.from('rubi_users').delete().eq('id', id);
    if (error) throw new Error(error.message);

    res.json({ ok: true, msg: 'Usuário removido' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: 'Erro ao remover usuário' });
  }
});

module.exports = router;
