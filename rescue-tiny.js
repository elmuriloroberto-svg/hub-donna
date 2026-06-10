/**
 * rescue-tiny.js — Script de Resgate de Emergência — Tiny ERP API
 *
 * Uso:
 *   1. Preencha TINY_TOKEN e CPF_CNPJ abaixo antes de rodar.
 *   2. node rescue-tiny.js
 *
 * Requer: Node.js >= 14 (sem dependências externas — usa https nativo)
 */

// ─── CONFIGURAÇÃO — PREENCHA ANTES DE RODAR ───────────────────────────────────
const TINY_TOKEN   = 'SEU_TOKEN_AQUI';   // token da API Tiny ERP
const CPF_CNPJ     = 'SEU_CPF_AQUI';    // CPF sem pontuação, ex: "12345678901"

// Payload do contato a ser recriado
const CONTATO_PAYLOAD = {
  nome:         'Murilo Roberto',
  cpf_cnpj:     CPF_CNPJ,
  tipo_pessoa:  'F',                     // F = Física | J = Jurídica
  tipo:         'C',                     // C = Cliente  (a API aceita só um tipo por inclusão;
                                         // Vendedor é perfil interno — veja nota abaixo)
  situacao:     'A',                     // A = Ativo
};
// NOTA: O Tiny ERP não permite definir "Vendedor" via API de contatos — esse papel
// é atribuído manualmente no painel em Configurações > Usuários/Vendedores.
// Este script recria o perfil de Cliente. Após rodar, vincule o usuário como
// Vendedor diretamente no painel do Tiny.
// ─────────────────────────────────────────────────────────────────────────────

const https        = require('https');
const querystring  = require('querystring');

const BASE_URL = 'api.tiny.com.br';
const SLEEP_MS = 300; // pausa entre requisições para evitar rate limit

// ─── Helper: requisição POST para a API Tiny ──────────────────────────────────
function tinyPost(endpoint, extraParams = {}) {
  return new Promise((resolve, reject) => {
    const body = querystring.stringify({
      token:   TINY_TOKEN,
      formato: 'JSON',
      ...extraParams,
    });

    const options = {
      hostname: BASE_URL,
      path:     `/api2/${endpoint}`,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Resposta inválida de ${endpoint}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── PASSO 1: Recriar o contato master ────────────────────────────────────────
async function recriarContato() {
  console.log('\n[PASSO 1] Recriando contato "Murilo Roberto"...');

  const payload = { contato: JSON.stringify({ contato: CONTATO_PAYLOAD }) };
  const res = await tinyPost('contato.incluir.php', payload);

  const status = res?.retorno?.status;
  if (status !== 'OK') {
    const erros = res?.retorno?.erros?.map((e) => e.erro).join(', ') || JSON.stringify(res);
    throw new Error(`Falha ao incluir contato: ${erros}`);
  }

  const novoId = res.retorno?.registros?.registro?.id || res.retorno?.registros?.[0]?.registro?.id;
  console.log(`[OK] Contato criado com ID: ${novoId}`);
  return novoId;
}

// ─── PASSO 2: Verificar pedidos vinculados ao CPF ─────────────────────────────
async function verificarPedidos(novoContatoId) {
  console.log('\n[PASSO 2] Buscando pedidos vinculados ao CPF...');

  await sleep(SLEEP_MS);

  // Busca por CPF/CNPJ do contato
  const resCpf = await tinyPost('pedidos.pesquisa.php', {
    pesquisa: JSON.stringify({ cpf: CPF_CNPJ }),
  });

  const pedidosCpf = resCpf?.retorno?.pedidos || [];
  console.log(`  → Pedidos encontrados pelo CPF: ${pedidosCpf.length}`);

  // Busca pedidos que ainda estejam sob o nome "Julia Santos" (nome fantasma)
  await sleep(SLEEP_MS);
  const resNome = await tinyPost('pedidos.pesquisa.php', {
    pesquisa: JSON.stringify({ nome: 'Julia Santos' }),
  });

  const pedidosNome = resNome?.retorno?.pedidos || [];
  console.log(`  → Pedidos ainda com nome "Julia Santos": ${pedidosNome.length}`);

  const todosPedidos = [...pedidosCpf, ...pedidosNome];

  // Deduplicar por id
  const unicos = Object.values(
    todosPedidos.reduce((acc, p) => {
      const id = p.pedido?.id || p.id;
      if (id) acc[id] = p;
      return acc;
    }, {})
  );

  console.log(`\n[RESUMO] Contato recriado com ID: ${novoContatoId}. Encontrados ${unicos.length} pedidos vinculados a este CPF no histórico.`);

  return unicos;
}

// ─── PASSO 3 (OPCIONAL — COMENTADO): Atualizar nome do contato nos pedidos ─────
// Descomente e chame updatePedidos(pedidos, novoContatoId) apenas se necessário.
// A API Tiny geralmente recalcula o nome do contato pelo CPF após recriar o perfil.
//
// async function updatePedidos(pedidos, novoContatoId) {
//   console.log(`\n[PASSO 3] Atualizando ${pedidos.length} pedidos com novo ID de contato...`);
//
//   for (const item of pedidos) {
//     const pedidoId = item.pedido?.numero || item.numero;
//     if (!pedidoId) continue;
//
//     await sleep(SLEEP_MS);
//
//     const payload = {
//       pedido: JSON.stringify({
//         pedido: {
//           numero:  pedidoId,
//           cliente: {
//             id:   novoContatoId,
//             nome: CONTATO_PAYLOAD.nome,
//           },
//         },
//       }),
//     };
//
//     const res = await tinyPost('pedido.alterar.php', payload);
//     const status = res?.retorno?.status;
//
//     if (status === 'OK') {
//       console.log(`  [OK] Pedido #${pedidoId} atualizado.`);
//     } else {
//       const erro = res?.retorno?.erros?.map((e) => e.erro).join(', ') || JSON.stringify(res);
//       console.warn(`  [WARN] Pedido #${pedidoId} — falha: ${erro}`);
//     }
//   }
//
//   console.log('[PASSO 3] Concluído.');
// }

// ─── MAIN ──────────────────────────────────────────────────────────────────────
(async () => {
  if (TINY_TOKEN === 'SEU_TOKEN_AQUI' || CPF_CNPJ === 'SEU_CPF_AQUI') {
    console.error('[ERRO] Preencha TINY_TOKEN e CPF_CNPJ no topo do arquivo antes de rodar.');
    process.exit(1);
  }

  try {
    const novoId = await recriarContato();
    await sleep(SLEEP_MS);
    const pedidos = await verificarPedidos(novoId);

    // Para rodar o Passo 3, descomente a linha abaixo:
    // await updatePedidos(pedidos, novoId);

    console.log('\n[CONCLUÍDO] Resgate finalizado. Verifique o painel do Tiny para confirmar.');
    console.log('            Lembre-se de vincular "Murilo Roberto" como Vendedor manualmente no painel.');
  } catch (err) {
    console.error('\n[ERRO FATAL]', err.message);
    process.exit(1);
  }
})();
