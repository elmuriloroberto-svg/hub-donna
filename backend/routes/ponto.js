const express    = require('express');
const { createClient } = require('@supabase/supabase-js');
const { getSupabase }  = require('../lib/supabase');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();
const BUCKET = 'ponto-fotos';
const TIPOS  = ['chegada', 'saida_almoco', 'retorno_almoco', 'saida'];

function storage() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

// POST /api/ponto/foto?tipo=chegada&data=YYYY-MM-DD
// Body: raw JPEG — Content-Type: image/jpeg
router.post(
  '/foto',
  authenticateToken,
  express.raw({ type: 'image/*', limit: '300kb' }),
  async (req, res) => {
    try {
      const { tipo, data } = req.query;
      if (!TIPOS.includes(tipo) || !/^\d{4}-\d{2}-\d{2}$/.test(data))
        return res.status(400).json({ ok: false, msg: 'tipo ou data inválidos' });
      if (!req.body?.length)
        return res.status(400).json({ ok: false, msg: 'Imagem vazia' });

      const sb       = storage();
      const filePath = `${req.user.id}/${data.slice(0, 7)}/${data}_${tipo}.jpg`;
      const { error } = await sb.storage
        .from(BUCKET)
        .upload(filePath, req.body, { contentType: 'image/jpeg', upsert: true });
      if (error) throw new Error(error.message);

      res.json({ ok: true, path: filePath });
    } catch (err) {
      console.error('[ponto/foto POST]', err.message);
      res.status(500).json({ ok: false, msg: err.message });
    }
  }
);

// POST /api/ponto/registro — salva horário (com ou sem foto)
router.post('/registro', authenticateToken, async (req, res) => {
  try {
    const { data, tipo, hora, foto_path } = req.body;
    if (!TIPOS.includes(tipo) || !/^\d{4}-\d{2}-\d{2}$/.test(data) || !hora)
      return res.status(400).json({ ok: false, msg: 'data, tipo e hora obrigatórios' });

    const db = getSupabase();
    const { error } = await db.from('folha_ponto').upsert(
      { usuario_id: req.user.id, data, tipo, hora, foto_path: foto_path || null },
      { onConflict: 'usuario_id,data,tipo' }
    );
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err) {
    console.error('[ponto/registro POST]', err.message);
    res.status(500).json({ ok: false, msg: err.message });
  }
});

// GET /api/ponto?data=YYYY-MM-DD[&meu=true]
// Admin sem meu=true → todos os usuários; caso contrário → só o próprio
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { data, meu } = req.query;
    const db = getSupabase();

    let q = db.from('folha_ponto').select('*').order('hora', { ascending: true });
    if (data) q = q.eq('data', data);
    if (req.user.role !== 'admin' || meu === 'true') q = q.eq('usuario_id', req.user.id);

    const [pRes, uRes] = await Promise.all([q, db.from('rubi_users').select('id, nome')]);
    if (pRes.error) throw new Error(pRes.error.message);

    const uMap = Object.fromEntries((uRes.data || []).map(u => [u.id, u.nome]));
    const rows = (pRes.data || []).map(r => ({ ...r, usuario_nome: uMap[r.usuario_id] || '' }));
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('[ponto GET]', err.message);
    res.status(500).json({ ok: false, msg: err.message });
  }
});

// GET /api/ponto/foto-url?path=... — URL assinada, validade 1h (admin only)
router.get('/foto-url', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const { path: fp } = req.query;
    if (!fp) return res.status(400).json({ ok: false, msg: 'path obrigatório' });

    const sb = storage();
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(fp, 3600);
    if (error) throw new Error(error.message);
    res.json({ ok: true, url: data.signedUrl });
  } catch (err) {
    console.error('[ponto/foto-url GET]', err.message);
    res.status(500).json({ ok: false, msg: err.message });
  }
});

module.exports = router;
