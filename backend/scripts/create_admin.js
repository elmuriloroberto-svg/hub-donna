/**
 * Cria ou redefine a senha do usuário admin no banco MySQL.
 * Uso: node backend/scripts/create_admin.js
 *
 * O script pergunta: login, nome, senha (entrada oculta), role.
 * A senha é hasheada com bcrypt antes de ir ao banco.
 */
require('dotenv').config();
const bcrypt   = require('bcryptjs');
const readline = require('readline');
const db       = require('../config/database');

const VALID_ROLES = ['admin', 'gerente', 'colaborador'];

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
  console.log('\n=== Criar / Atualizar Usuário — Rubi Hub ===\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const login = (await ask(rl, 'Login:    ')).trim();
  const nome  = (await ask(rl, 'Nome:     ')).trim();
  const senha = (await ask(rl, 'Senha:    ', true)).trim();
  const role  = (await ask(rl, `Role (${VALID_ROLES.join('/')}): `)).trim();

  rl.close();

  if (!login || !nome || !senha || !role) {
    console.error('❌ Todos os campos são obrigatórios.');
    process.exit(1);
  }

  if (!VALID_ROLES.includes(role)) {
    console.error(`❌ Role inválido. Use: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }

  if (senha.length < 8) {
    console.error('❌ Senha deve ter no mínimo 8 caracteres.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(senha, 12);

  const conn = await db.getConnection();
  const [existing] = await conn.query('SELECT id FROM users WHERE login = ?', [login]);

  if (existing.length > 0) {
    await conn.query(
      'UPDATE users SET nome = ?, senha = ?, role = ?, ativo = 1 WHERE login = ?',
      [nome, hash, role, login]
    );
    console.log(`\n✅ Usuário "${login}" atualizado com sucesso.`);
  } else {
    await conn.query(
      'INSERT INTO users (login, senha, nome, role, ativo) VALUES (?, ?, ?, ?, 1)',
      [login, hash, nome, role]
    );
    console.log(`\n✅ Usuário "${login}" criado com sucesso.`);
  }

  conn.release();
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
