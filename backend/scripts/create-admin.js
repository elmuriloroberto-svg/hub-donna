require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql = require('mysql2/promise');

async function createAdmin() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'donna_hub',
  });

  try {
    const login = 'muriloroberto';
    const senha = 'Flamengosub20$';
    const nome = 'Murilo Roberto';
    const role = 'admin';

    const [existing] = await connection.execute(
      'SELECT id FROM users WHERE login = ?',
      [login]
    );

    if (existing.length > 0) {
      await connection.execute(
        'UPDATE users SET senha = ?, nome = ?, role = ?, ativo = 1 WHERE login = ?',
        [senha, nome, role, login]
      );
      console.log(`Usuário "${login}" atualizado com sucesso.`);
    } else {
      await connection.execute(
        'INSERT INTO users (login, senha, nome, role, ativo) VALUES (?, ?, ?, ?, 1)',
        [login, senha, nome, role]
      );
      console.log(`Usuário "${login}" criado com sucesso.`);
    }

    const [user] = await connection.execute(
      'SELECT id, login, nome, role, ativo FROM users WHERE login = ?',
      [login]
    );
    console.log('Dados salvos:', user[0]);
  } finally {
    await connection.end();
  }
}

createAdmin().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
