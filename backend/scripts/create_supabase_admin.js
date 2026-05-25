/**
 * Cria ou atualiza o usuário admin diretamente no Supabase.
 * Uso: node backend/scripts/create_supabase_admin.js
 *
 * Requer que a tabela rubi_users já exista no Supabase.
 * Se não existir, rode supabase_security_migrate.sql primeiro no SQL Editor.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const WebSocket = require('ws');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { realtime: { transport: WebSocket } }
);

const VALID_ROLES = ['admin', 'gerente', 'vendedor'];

function ask(rl, question, hidden = false) {
  return new Promise((resolve) => {
    if (hidden && process.stdin.isTTY) {
      process.stdout.write(question);
      process.stdin.setRawMode(true);
      let input = '';
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', function handler(ch) {
        if (ch === '\n' || ch === '\r' || ch === '') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', handler);
          process.stdout.write('\n');
          if (ch === '') process.exit(1);
          resolve(input);
        } else if (ch === '') {
          input = input.slice(0, -1);
        } else {
          input += ch;
          process.stdout.write('*');
        }
      });
    } else {
      rl.question(question, resolve);
    }
  });
}

async function main() {
  console.log('\n=== Criar / Atualizar Usuário — Rubi Hub (Supabase) ===\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const username = (await ask(rl, 'Username (login):  ')).trim();
  const nome     = (await ask(rl, 'Nome completo:     ')).trim();
  const senha    = (await ask(rl, 'Senha:             ', true)).trim();
  const role     = (await ask(rl, `Role (${VALID_ROLES.join('/')}): `)).trim();

  rl.close();

  if (!username || !nome || !senha || !role) {
    console.error('\n❌ Todos os campos são obrigatórios.');
    process.exit(1);
  }

  if (!VALID_ROLES.includes(role)) {
    console.error(`\n❌ Role inválido. Use: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }

  if (senha.length < 8) {
    console.error('\n❌ Senha deve ter no mínimo 8 caracteres.');
    process.exit(1);
  }

  console.log('\n⏳ Gerando hash da senha...');
  const password_hash = await bcrypt.hash(senha, 12);

  // Tenta upsert — cria ou atualiza
  const { data, error } = await supabase
    .from('rubi_users')
    .upsert(
      { username, nome, password_hash, role, ativo: true },
      { onConflict: 'username' }
    )
    .select('id, username, role');

  if (error) {
    if (error.message.includes('does not exist') || error.message.includes('schema cache')) {
      console.error('\n❌ Tabela rubi_users não existe ainda!');
      console.error('   Rode o SQL em supabase_security_migrate.sql no Supabase Dashboard primeiro.');
      console.error('   Supabase → SQL Editor → + New query → cole o conteúdo → Run');
    } else {
      console.error('\n❌ Erro ao criar usuário:', error.message);
    }
    process.exit(1);
  }

  console.log(`\n✅ Usuário "${username}" (${role}) criado/atualizado com sucesso!`);
  console.log('   ID:', data?.[0]?.id);
  process.exit(0);
}

main().catch(err => {
  console.error('Erro inesperado:', err.message);
  process.exit(1);
});
