// Helper para definir cookies com as mesmas flags de segurança do MercadoLivre:
// Secure + HttpOnly + SameSite=Strict (usamos Strict, ML usa None por operar cross-domain)
//
// Uso: setCookie(res, 'nome', 'valor', { maxAge: 3600 })
//
// Atualmente o sistema usa JWT via Authorization header (não cookies),
// então este módulo é um ponto de extensão seguro caso cookies sejam adotados.

const isProd = process.env.NODE_ENV === 'production';

function setCookie(res, name, value, options = {}) {
  const defaults = {
    httpOnly: true,          // JavaScript não consegue ler — bloqueia XSS
    secure:   isProd,        // Só trafega em HTTPS em produção
    sameSite: 'strict',      // Bloqueia envio cross-site (CSRF mitigation)
    path:     '/',
  };

  res.cookie(name, value, { ...defaults, ...options });
}

function clearCookie(res, name) {
  res.clearCookie(name, {
    httpOnly: true,
    secure:   isProd,
    sameSite: 'strict',
    path:     '/',
  });
}

module.exports = { setCookie, clearCookie };
