const { PostgrestClient } = require('@supabase/postgrest-js');

let _client = null;

function getSupabase() {
  if (!_client) {
    const url = `${process.env.SUPABASE_URL}/rest/v1`;
    const key  = process.env.SUPABASE_SERVICE_KEY;
    _client = new PostgrestClient(url, {
      headers: {
        apikey:        key,
        Authorization: `Bearer ${key}`,
      },
    });
  }
  return _client;
}

module.exports = { getSupabase };
