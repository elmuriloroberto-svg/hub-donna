const { PostgrestClient } = require('@supabase/postgrest-js');

// ── Guard read-only de preview ────────────────────────────────────────────────
// Ver ADR: "Donna Hub — ADR Supabase Preview Separado" (Fase 1).
// Quando PREVIEW_READONLY === '1' (setado SÓ no escopo Preview global da Vercel,
// NUNCA em Production), bloqueia escritas (insert/update/delete/upsert) ANTES de
// tocar o banco, devolvendo um erro no formato do Supabase — que as rotas já
// tratam (`const { error } = await ...; if (error) throw`) e propagam pra UI.
// Leituras (.select e demais) passam intactas.
// AJUSTE 1 do ADR: a condição é o flag SOZINHO — NÃO usar NODE_ENV (na Vercel ele
// vem 'production' até no preview, o que desligaria o guard).
const PREVIEW_READONLY = process.env.PREVIEW_READONLY === '1';

const WRITE_METHODS = ['insert', 'update', 'delete', 'upsert'];
const BLOCK_MSG = 'Escrita bloqueada em ambiente de preview (read-only)';

// Resultado que uma escrita bloqueada devolve. Precisa ser:
//  - awaitável (thenable) → resolve com { data:null, error:{message} }
//  - encadeável → .select()/.eq()/.single()/.maybeSingle()/.onConflict()... devolvem
//    o próprio objeto, pra suportar padrões como .insert(...).select().single().
function blockedResult() {
  const payload = { data: null, error: { message: BLOCK_MSG } };
  const proxy = new Proxy({}, {
    get(_target, prop) {
      // thenable: torna o objeto awaitável, resolvendo com o erro do guard
      if (prop === 'then')    return (resolve) => Promise.resolve(payload).then(resolve);
      if (prop === 'catch')   return () => proxy;
      if (prop === 'finally') return (cb) => { if (cb) cb(); return proxy; };
      // qualquer método de encadeamento (.select/.eq/.single/.maybeSingle/
      // .onConflict/.order/.limit…) devolve o PRÓPRIO proxy, mantendo a cadeia
      // awaitável em qualquer ponto.
      return () => proxy;
    },
  });
  return proxy;
}

// Envolve o objeto retornado por client.from(table): intercepta os métodos de
// escrita quando em read-only; tudo o mais (select e afins) passa direto.
function guardFrom(builder) {
  return new Proxy(builder, {
    get(target, prop) {
      if (WRITE_METHODS.includes(prop)) {
        return () => blockedResult();
      }
      const val = target[prop];
      return typeof val === 'function' ? val.bind(target) : val;
    },
  });
}

let _client = null;

function getSupabase() {
  if (!_client) {
    const url = `${process.env.SUPABASE_URL}/rest/v1`;
    const key  = process.env.SUPABASE_SERVICE_KEY;
    const client = new PostgrestClient(url, {
      headers: {
        apikey:        key,
        Authorization: `Bearer ${key}`,
      },
    });

    if (PREVIEW_READONLY) {
      // Wrapper: intercepta apenas .from(table) pra envolver o builder; o resto
      // do client (rpc etc.) passa direto.
      _client = new Proxy(client, {
        get(target, prop) {
          if (prop === 'from') {
            return (table) => guardFrom(target.from(table));
          }
          const val = target[prop];
          return typeof val === 'function' ? val.bind(target) : val;
        },
      });
    } else {
      _client = client;
    }
  }
  return _client;
}

module.exports = { getSupabase };
