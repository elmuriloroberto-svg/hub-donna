const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'rubi_session';

// Assina um JWT válido e devolve o header Cookie pronto para supertest,
// sem passar por /api/auth/login (evita depender do Supabase real nos testes).
function sessionCookieFor({ id = 1, login = 'teste', nome = 'Teste', role = 'admin' } = {}) {
  const token = jwt.sign({ id, login, nome, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return `${COOKIE_NAME}=${token}`;
}

module.exports = { sessionCookieFor, COOKIE_NAME };
