const express = require('express');
const jwt     = require('jsonwebtoken');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/realtime/ticket — emite um token curto (60s) pro relay de tempo real
// autenticar a conexão WebSocket. Não repassa o cookie de sessão (HttpOnly, e
// escopado a hubdonnaunha.com) porque o relay mora em outro domínio (Railway) —
// em vez disso o navegador troca esse ticket assim que abre o WebSocket.
router.get('/ticket', authenticateToken, (req, res) => {
  const ticket = jwt.sign(
    { sub: req.user.id, role: req.user.role, purpose: 'realtime' },
    process.env.JWT_SECRET,
    { expiresIn: '60s' }
  );
  res.json({ ok: true, ticket });
});

module.exports = router;
