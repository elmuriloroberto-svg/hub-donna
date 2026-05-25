const rateLimit = require('express-rate-limit');

// Limite geral: 100 req / 15 min por IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, msg: 'Muitas requisições. Tente novamente em 15 minutos.' },
});

// Limite restritivo para autenticação: 10 tentativas / 15 min (anti brute-force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, msg: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
});

// Limpa e trunca strings de entrada
const sanitizeStr = (val, maxLen = 255) => {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
};

// Valida IDs de rota — deve ser um inteiro positivo
const isPositiveInt = (val) => {
  const n = Number(val);
  return Number.isInteger(n) && n > 0;
};

module.exports = { apiLimiter, authLimiter, sanitizeStr, isPositiveInt };
