const { createClient } = require('@supabase/supabase-js');

let _client = null;

function getSupabase() {
  if (!_client) {
    // Node.js 22+ tem WebSocket nativo (Vercel usa Node 24)
    // Em Node.js 20 local usamos ws via start.js separado
    const opts = { auth: { persistSession: false, autoRefreshToken: false } };
    if (typeof WebSocket === 'undefined') {
      // Node.js < 22: injetar ws
      try { opts.realtime = { transport: require('ws') }; } catch (_) {}
    }
    _client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      opts
    );
  }
  return _client;
}

module.exports = { getSupabase };
