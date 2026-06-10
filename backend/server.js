// .env fica na raiz do projeto (um nível acima de backend/)
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('dotenv').config(); // fallback: se houver .env local no backend/
const app    = require('./app');
const cron   = require('node-cron');
const tinyRouter             = require('./routes/tiny');
const { syncCrmToSupabase }  = require('./jobs/syncCrm');

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Donna Unha Hub rodando em http://localhost:${PORT}`);
});

// Sync CRM diário às 03:00 (America/Sao_Paulo = UTC-3)
// Puxa todos os contatos + pedidos do Tiny, cruza os dados e persiste no Supabase.
cron.schedule('0 3 * * *', async () => {
  console.log('[cron] 03:00 — Iniciando sync diário do CRM...');
  await syncCrmToSupabase(tinyRouter._buildCrmTemp);
}, { timezone: 'America/Sao_Paulo' });

console.log('[cron] Sync CRM agendado para 03:00 (America/Sao_Paulo).');
