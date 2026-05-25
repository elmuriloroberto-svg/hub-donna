const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'rubi_session';

const authenticateToken = (req, res, next) => {
  // Cookie HttpOnly (primary — immune to XSS, never accessible from JavaScript)
  const cookieToken = req.cookies?.[COOKIE_NAME];
  // Authorization header (fallback — for dev tools and backward compat during transition)
  const bearerToken = req.headers['authorization']?.startsWith('Bearer ')
    ? req.headers['authorization'].slice(7)
    : null;
  const token = cookieToken || bearerToken;

  if (!token) {
    return res.status(401).json({ ok: false, msg: 'Não autenticado. Faça login.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(401).json({ ok: false, msg: 'Sessão expirada. Faça login novamente.' });
    }
    req.user = user;
    next();
  });
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, msg: 'Acesso negado' });
    }
    next();
  };
};

module.exports = { authenticateToken, authorize };
