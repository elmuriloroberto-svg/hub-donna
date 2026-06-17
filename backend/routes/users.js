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
      .select('id, username, nome, role, ativo, created_at, tiny_vendor, permissoes')
      .order('nome');
    if (error) throw new Error(error.message);
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
    const login = (sanitizeStr(req.body.login, 100) || '').toLowerCase();
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
    const tiny_vendor = sanitizeStr(req.body.tiny_vendor, 150) || '';
    const { error } = await sb.from('rubi_users').insert({ username: login, password_hash, nome, role, tiny_vendor });
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

    const nome        = sanitizeStr(req.body.nome, 150);
    const role        = sanitizeStr(req.body.role, 50);
    const tiny_vendor = sanitizeStr(req.body.tiny_vendor, 150) || '';
    const ativo       = !!req.body.ativo;
    const permissoes  = req.body.permissoes || {};

    if (!nome || !role) return res.status(400).json({ ok: false, msg: 'Nome e role são obrigatórios' });
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ ok: false, msg: 'Role inválido' });
    if (typeof permissoes !== 'object' || Array.isArray(permissoes))
      return res.status(400).json({ ok: false, msg: 'permissoes deve ser um objeto' });

    const sb = getSupabase();

    // Troca de senha opcional
    const update = { nome, role, ativo, tiny_vendor, permissoes };
    if (req.body.nova_senha) {
      const nova = sanitizeStr(req.body.nova_senha, 128);
      if (nova.length < 8) return res.status(400).json({ ok: false, msg: 'Senha mínima 8 chars' });
      update.password_hash = await require('bcryptjs').hash(nova, 10);
    }

    const { error } = await sb.from('rubi_users').update(update).eq('id', id);
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
