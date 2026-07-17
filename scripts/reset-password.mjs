#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// reset-password.mjs — reset LOCAL e interativo de senha de um usuário do Hub.
//
// Uso:  node scripts/reset-password.mjs   (a partir da RAIZ do projeto)
//   Os valores reais do Supabase estão no .env da raiz; o script também
//   procura backend/.env como fallback. Deps vêm de backend/node_modules.
//
// - Pede username e a nova senha por prompt OCULTO (sem eco no terminal).
// - Valida força mínima (>= 8 chars, sem sequências/padrões triviais).
// - Gera hash bcrypt com o MESMO custo do backend (cost = 10, ver
//   backend/routes/auth.js:114) e faz UPDATE em rubi_users via Supabase REST
//   com as credenciais do .env local (mesma lib do backend: @supabase/postgrest-js).
// - NUNCA imprime a senha nem o hash.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Resolve deps a partir de backend/node_modules (onde o backend as instala)
function req(name) {
  const paths = [
    path.join(ROOT, 'backend', 'node_modules', name),
    path.join(ROOT, 'node_modules', name),
  ];
  for (const p of paths) { try { return require(p); } catch { /* tenta o próximo */ } }
  return require(name); // fallback à resolução padrão
}

const bcrypt = req('bcryptjs');
const { PostgrestClient } = req('@supabase/postgrest-js');

// Carrega .env (procura em backend/.env e depois na raiz)
function loadEnv() {
  const candidates = [path.join(ROOT, 'backend', '.env'), path.join(ROOT, '.env')];
  for (const f of candidates) {
    if (fs.existsSync(f)) {
      try { req('dotenv').config({ path: f }); return f; } catch { /* dotenv opcional */ }
    }
  }
  return null;
}

const BCRYPT_COST = 10;          // == backend/routes/auth.js:114
const TABLE = 'rubi_users';
const MIN_LEN = 8;

// ── prompt de texto normal (username) ───────────────────────────────────────
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

// ── prompt OCULTO (senha) — sem eco no terminal ─────────────────────────────
// Lê byte a byte em raw mode e nunca ecoa o que foi digitado.
function askHidden(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      return reject(new Error('Terminal não-interativo: rode este script direto no seu terminal (TTY), não via pipe/CI.'));
    }
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    let buf = '';
    const CTRL_C = 0x03, CTRL_D = 0x04, LF = 0x0a, CR = 0x0d, BS = 0x08, DEL = 0x7f;
    const onData = (ch) => {
      const code = ch.length ? ch[0] : LF;
      if (code === LF || code === CR || code === CTRL_D) {   // Enter / Ctrl-D → confirma
        stdin.setRawMode(wasRaw); stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(buf);
      } else if (code === CTRL_C) {                          // Ctrl-C → aborta
        stdin.setRawMode(wasRaw); stdin.pause();
        process.stdout.write('\n'); process.exit(130);
      } else if (code === BS || code === DEL) {              // Backspace / Delete
        buf = buf.slice(0, -1);
      } else if (code >= 0x20) {                             // caractere visível; ignora controles
        buf += ch.toString('utf8');
      }
    };
    stdin.on('data', onData);
  });
}

// ── validação de força ──────────────────────────────────────────────────────
function validaSenha(senha) {
  if (senha.length < MIN_LEN) return `Mínimo ${MIN_LEN} caracteres.`;
  const low = senha.toLowerCase();

  // sequências de teclado / numéricas comuns
  const sequencias = ['1234', '2345', '3456', '4567', '5678', '6789', '7890',
                      'abcd', 'qwer', 'asdf', 'zxcv', 'qwerty', '12345', '123456'];
  if (sequencias.some((s) => low.includes(s))) return 'Contém sequência trivial (ex.: 1234, qwerty, abcd).';

  // caractere repetido em série (aaaa, 1111)
  if (/(.)\1{3,}/.test(senha)) return 'Contém caractere repetido em série (ex.: aaaa, 1111).';

  // palavra + números no fim (ex.: senha123, admin2024) — padrão fraco clássico
  if (/^[a-z]{2,}\d{2,4}$/i.test(senha)) return 'Padrão fraco "palavra+números" (ex.: senha123). Misture melhor.';

  // dicionário mínimo de senhas triviais / relacionadas ao sistema
  const triviais = ['password', 'senha', 'admin', 'donna', 'muriloroberto', 'murilo',
                    'hub', 'donnaunha', 'trocar', 'mudar', 'teste', 'welcome', 'iloveyou'];
  if (triviais.some((t) => low === t || low === t + '123' || low.replace(/\d+$/, '') === t)) {
    return 'Baseada em palavra trivial/óbvia. Escolha algo não relacionado ao sistema.';
  }
  return null; // ok
}

async function main() {
  const envFile = loadEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('✖ SUPABASE_URL / SUPABASE_SERVICE_KEY ausentes.' +
      (envFile ? ` Verifique ${envFile}.` : ' Nenhum .env encontrado.'));
    process.exit(1);
  }

  const supabase = new PostgrestClient(`${url}/rest/v1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });

  const username = await ask('Username do usuário: ');
  if (!username) { console.error('✖ Username vazio.'); process.exit(1); }

  // confirma que o usuário existe (sem expor dados sensíveis)
  const { data: found, error: findErr } = await supabase
    .from(TABLE).select('id, username, ativo').eq('username', username).maybeSingle();
  if (findErr) { console.error('✖ Erro ao consultar o banco:', findErr.message); process.exit(1); }
  if (!found) { console.error(`✖ Usuário "${username}" não encontrado em ${TABLE}.`); process.exit(1); }
  if (found.ativo === false) console.warn('⚠ Aviso: este usuário está marcado como inativo (ativo=false).');

  const senha1 = await askHidden('Nova senha (oculta): ');
  const motivo = validaSenha(senha1);
  if (motivo) { console.error('✖ Senha rejeitada:', motivo); process.exit(1); }

  const senha2 = await askHidden('Confirme a nova senha: ');
  if (senha1 !== senha2) { console.error('✖ As senhas não coincidem.'); process.exit(1); }

  const password_hash = await bcrypt.hash(senha1, BCRYPT_COST);

  const { error: updErr } = await supabase
    .from(TABLE).update({ password_hash }).eq('id', found.id);
  if (updErr) { console.error('✖ Erro ao atualizar a senha:', updErr.message); process.exit(1); }

  console.log(`✔ Senha de "${found.username}" atualizada com sucesso (bcrypt cost ${BCRYPT_COST}).`);
  console.log('  As sessões ATIVAS deste usuário continuam válidas até o JWT expirar (JWT_EXPIRE_SECONDS).');
  console.log('  Para derrubá-las imediatamente, rotacione o JWT_SECRET (invalida TODOS os logins).');
}

main().catch((e) => { console.error('✖ Falha inesperada:', e.message); process.exit(1); });
