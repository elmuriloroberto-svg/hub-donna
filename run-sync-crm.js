require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { syncCrmFull } = require('./backend/jobs/syncCrm');

console.log('=== SYNC CRM FULL ===');
console.log('Isso pode levar 15-20 minutos. Não feche o terminal.');
console.log('');

syncCrmFull()
  .then(result => {
    console.log('');
    console.log('=== CONCLUÍDO ===');
    console.log(`Total: ${result.total} contatos`);
    console.log(`Erros: ${result.erros}`);
    console.log(`Duração: ${result.duracao_s}s (${Math.round(result.duracao_s / 60)}min)`);
    process.exit(0);
  })
  .catch(e => {
    console.error('ERRO FATAL:', e.message);
    process.exit(1);
  });
