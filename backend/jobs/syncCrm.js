/**
 * syncCrm.js — Sincroniza dados do CRM (Tiny) para o Supabase
 *
 * syncCrmFull: busca TODOS os contatos com detalhe completo (celular + fone).
 *              Roda no cron das 3h no servidor local. Leva ~15-20min mas é background.
 *
 * syncCrmToSupabase: sync rápido usando _buildCrmTemp (sem detalhe individual).
 *                    Usado como fallback quando o Geral não tem dados no Supabase.
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');
const { getSupabase } = require('../lib/supabase');

const ROWS_CACHE_FILE = path.join(__dirname, '../../.crm-rows-cache.json');

const BATCH_SIZE  = 500;
const SLEEP_MS    = 320; // entre chamadas ao Tiny — respeita rate limit
const sleep = ms => new Promise(r => setTimeout(r, ms));

function tinyGet(endpoint, params = {}) {
  const token = process.env.TINY_TOKEN;
  const qs = new URLSearchParams({ token, formato: 'json', ...params }).toString();
  return new Promise((resolve, reject) => {
    const req = https.get(`https://api.tiny.com.br/api2/${endpoint}?${qs}`, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Resposta inválida de ${endpoint}`)); }
      });
    }).on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('Tiny timeout')); });
  });
}

function bestPhone(c) {
  const candidates = [c.celular, c.fone, c.telefone, c.tel, c.mobile]
    .filter(Boolean)
    .map(v => String(v).trim());
  const fones = c.fones || c.Fones;
  if (Array.isArray(fones)) {
    for (const f of fones) {
      if (typeof f === 'string') candidates.push(f.trim());
      else if (f?.fone?.numero) candidates.push(String(f.fone.numero).trim());
      else if (f?.numero)       candidates.push(String(f.numero).trim());
      else if (f?.fone)         candidates.push(String(f.fone).trim());
    }
  }
  const seen = new Set();
  return candidates
    .filter(v => {
      const d = v.replace(/\D/g, '');
      if (d.length < 8 || seen.has(d)) return false;
      seen.add(d); return true;
    })
    .sort((a, b) => b.replace(/\D/g, '').length - a.replace(/\D/g, '').length);
}

function parseDateBR(str) {
  if (!str) return null;
  const p = str.split('/');
  if (p.length !== 3) return null;
  return new Date(`${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`);
}
function formatDateBR(d) {
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
const normName = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
function classifyTemp(d) {
  if (d === null || d > 45) return 'congelado';
  if (d <= 15) return 'quente';
  if (d <= 30) return 'morno';
  return 'frio';
}

// ── Passo 1: lista todos os IDs de contatos ───────────────────────────────────
// 3 tentativas com backoff por página para sobreviver a rate limits do Tiny.
async function fetchAllContactIds() {
  const ids = [];
  for (let pag = 1; ; pag++) {
    let r = null;
    for (let t = 1; t <= 3; t++) {
      r = await tinyGet('contatos.pesquisa.php', { pagina: pag });
      if (r?.retorno?.status === 'OK') break;
      console.warn(`[syncCrm] IDs pág ${pag} tentativa ${t} falhou — aguardando ${t * 2}s`);
      await sleep(t * 2000);
    }
    if (r?.retorno?.status !== 'OK') {
      console.warn(`[syncCrm] IDs pág ${pag} desistiu após 3 tentativas — parando.`);
      break;
    }
    const items = (r.retorno.contatos || []).map(c => c.contato);
    if (!items.length) break;
    for (const c of items) if (c.id) ids.push(String(c.id));
    const totalPags = parseInt(r.retorno.numero_paginas || 1);
    if (pag >= totalPags) break;
    await sleep(SLEEP_MS);
  }
  return ids;
}

// ── Passo 2: busca detalhe completo de cada contato (lento, ~15-20min) ────────
async function fetchContactDetails(ids) {
  const map = {}; // id → { celular, telefone, telefones, nome, cpf_cnpj }
  let ok = 0, err = 0;
  for (let i = 0; i < ids.length; i++) {
    try {
      const r = await tinyGet('contato.obter.php', { id: ids[i] });
      const c = r?.retorno?.contato;
      if (c) {
        const phones = bestPhone(c);
        map[ids[i]] = {
          nome:      (c.nome || '').trim(),
          cpf_cnpj:  c.cpf_cnpj || '',
          celular:   phones[0] || '',
          telefone:  phones[1] || phones[0] || '',
          telefones: phones,
        };
        ok++;
      }
    } catch { err++; }
    if ((i + 1) % 100 === 0) {
      console.log(`[syncCrm] contatos: ${i + 1}/${ids.length} | ok:${ok} err:${err}`);
    }
    await sleep(SLEEP_MS);
  }
  console.log(`[syncCrm] detalhes concluídos: ${ok} ok, ${err} erros`);
  return map;
}

// ── Passo 3: histórico de pedidos (2 anos) ────────────────────────────────────
async function fetchOrderHistory() {
  const de = new Date(); de.setFullYear(de.getFullYear() - 10);
  const clienteMap = {};
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  function processar(pedidos) {
    for (const item of pedidos) {
      const p    = item.pedido || item;
      const nome = (p.nome || '').trim();
      if (!nome || nome.toLowerCase() === 'consumidor final' || nome.toLowerCase() === 'cliente padrão') continue;
      const dt  = parseDateBR(p.data_pedido);
      const val = parseFloat(p.valor) || 0;
      if (!clienteMap[nome]) clienteMap[nome] = { primeiro: null, ultimo: null, qtd: 0, total: 0, id_contato: null, cpf_cnpj: null };
      if (dt) {
        if (!clienteMap[nome].primeiro || dt < clienteMap[nome].primeiro) clienteMap[nome].primeiro = dt;
        if (!clienteMap[nome].ultimo   || dt > clienteMap[nome].ultimo)   clienteMap[nome].ultimo   = dt;
      }
      clienteMap[nome].qtd++;
      clienteMap[nome].total += val;
      if (!clienteMap[nome].id_contato) {
        const pid = p.id_contato || p.cliente?.id;
        if (pid) clienteMap[nome].id_contato = String(pid);
      }
      if (!clienteMap[nome].cpf_cnpj && p.cpf_cnpj) clienteMap[nome].cpf_cnpj = p.cpf_cnpj;
    }
  }

  // Página 1 primeiro para descobrir o total de páginas
  let firstR = null;
  for (let t = 1; t <= 3; t++) {
    try { firstR = await tinyGet('pedidos.pesquisa.php', { dataInicial: formatDateBR(de), pagina: 1 }); break; }
    catch { await sleep(500 * t); }
  }
  if (!firstR?.retorno?.pedidos?.length) return [];
  processar(firstR.retorno.pedidos);

  const totalPags = parseInt(firstR.retorno.numero_paginas) || 1;

  // Busca da última página para a segunda — Tiny ordena do mais antigo ao mais novo.
  // Em caso de rate-limit, preserva os pedidos recentes em vez dos históricos.
  for (let pag = totalPags; pag >= 2; pag--) {
    let r = null;
    for (let t = 1; t <= 3; t++) {
      try { r = await tinyGet('pedidos.pesquisa.php', { dataInicial: formatDateBR(de), pagina: pag }); break; }
      catch { await sleep(500 * t); }
    }
    if (!r?.retorno?.pedidos?.length) break;
    processar(r.retorno.pedidos);
    await sleep(SLEEP_MS);
  }
  // Converte para array com metadados calculados
  return Object.entries(clienteMap).map(([nome, c]) => {
    const diasSem = c.ultimo ? Math.round((hoje - c.ultimo) / 86400000) : null;
    const freq    = (c.qtd > 1 && c.primeiro && c.ultimo && c.primeiro < c.ultimo)
      ? Math.round((c.ultimo - c.primeiro) / 86400000 / (c.qtd - 1)) : null;
    const ultimoISO = c.ultimo ? c.ultimo.toISOString().slice(0, 10) : null;
    const isoToBR   = iso => { if (!iso) return '—'; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; };
    return { nome, id_contato: c.id_contato, cpf_cnpj: c.cpf_cnpj, ultimo_pedido: isoToBR(ultimoISO), dias_sem: diasSem, qtd: c.qtd, total: c.total, frequencia_dias: freq };
  });
}

// ── Sync completo (usado pelo cron local — busca celular via detalhe) ──────────
async function syncCrmFull() {
  const inicio = Date.now();
  console.log('[syncCrm] === SYNC COMPLETO INICIADO ===');

  // 1. IDs dos contatos
  console.log('[syncCrm] Buscando IDs de contatos...');
  const ids = await fetchAllContactIds();
  console.log(`[syncCrm] ${ids.length} contatos encontrados.`);

  // 2. Histórico de pedidos PRIMEIRO — enquanto o rate limit está zerado.
  //    fetchContactDetails faz 2000+ chamadas individuais e esgota a cota do Tiny;
  //    se fetchOrderHistory rodar depois, pega zero resultados.
  console.log('[syncCrm] Buscando histórico de pedidos (10 anos)...');
  const hist = await fetchOrderHistory();
  console.log(`[syncCrm] ${hist.length} clientes com pedidos encontrados.`);

  // 3. Detalhes individuais (celular real) — pode ser parcialmente rate-limitado,
  //    mas o histórico já está salvo acima.
  console.log('[syncCrm] Buscando detalhes de cada contato (pode levar 15-20min)...');
  const detalhes = await fetchContactDetails(ids);

  // Indexa histórico por id_contato, cpf, nome normalizado
  const histById   = {};
  const histByCpf  = {};
  const histByName = {};
  for (const h of hist) {
    if (h.id_contato) histById[h.id_contato] = h;
    const cpf = (h.cpf_cnpj || '').replace(/\D/g, '');
    if (cpf.length >= 11) histByCpf[cpf] = h;
    histByName[normName(h.nome)] = h;
  }

  // 4. Junta contatos + histórico
  const hoje  = new Date(); hoje.setHours(0, 0, 0, 0);
  const agora = new Date().toISOString();
  const rows  = [];

  for (const id of ids) {
    const det = detalhes[id];
    if (!det) continue;
    const cpf = (det.cpf_cnpj || '').replace(/\D/g, '');
    const h   = histById[id]
             || (cpf.length >= 11 ? histByCpf[cpf] : null)
             || histByName[normName(det.nome)]
             || null;

    let diasSem = h?.dias_sem ?? null;
    // Recalcula diasSem se tiver data
    if (h?.ultimo_pedido && h.ultimo_pedido !== '—') {
      const dt = parseDateBR(h.ultimo_pedido);
      if (dt) diasSem = Math.round((hoje - dt) / 86400000);
    }

    rows.push({
      nome:            det.nome,
      celular:         det.celular  || '',
      telefone:        det.telefone || '',
      telefones:       det.telefones || [],
      ultimo_pedido:   h?.ultimo_pedido || '—',
      dias_sem:        diasSem,
      temperatura:     classifyTemp(diasSem),
      qtd_pedidos:     h?.qtd     || 0,
      ticket_medio:    (h && h.qtd > 0) ? Math.round(h.total / h.qtd * 100) / 100 : 0,
      frequencia_dias: h?.frequencia_dias ?? null,
      total:           h?.total   || 0,
      atualizado_em:   agora,
    });
  }

  // 5. Deduplica por nome — nomes duplicados causam erro no PostgreSQL upsert.
  const seenNomes = new Set();
  const rowsDedup = rows.filter(r => {
    if (seenNomes.has(r.nome)) return false;
    seenNomes.add(r.nome);
    return true;
  });
  if (rowsDedup.length < rows.length) {
    console.log(`[syncCrm] Dedup: ${rows.length} → ${rowsDedup.length} (${rows.length - rowsDedup.length} duplicados removidos)`);
  }

  // Salva em arquivo local — se o upsert falhar, permite retentar sem refazer o fetch
  try {
    fs.writeFileSync(ROWS_CACHE_FILE, JSON.stringify(rowsDedup));
    console.log(`[syncCrm] Dados salvos em cache local (${rowsDedup.length} registros).`);
  } catch (e) {
    console.warn('[syncCrm] Não foi possível salvar cache local:', e.message);
  }

  // 6. Upsert no Supabase
  console.log(`[syncCrm] Upserting ${rowsDedup.length} contatos no Supabase...`);
  const supabase = getSupabase();
  let erros = 0;
  for (let i = 0; i < rowsDedup.length; i += BATCH_SIZE) {
    const { error } = await supabase
      .from('crm_clientes')
      .upsert(rowsDedup.slice(i, i + BATCH_SIZE), { onConflict: 'nome' });
    if (error) { erros++; console.error(`[syncCrm] Erro lote ${Math.floor(i/BATCH_SIZE)+1}:`, error.message); }
  }

  const duracao = Math.round((Date.now() - inicio) / 1000);
  console.log(`[syncCrm] === CONCLUÍDO: ${rows.length} contatos | ${erros} erros | ${duracao}s (${Math.round(duracao/60)}min) ===`);
  return { ok: erros === 0, total: rows.length, duracao_s: duracao, erros };
}

// ── Sync rápido (fallback — usa _buildCrmTemp, sem detalhe individual) ─────────
async function syncCrmToSupabase(buildCrmTemp) {
  const inicio = Date.now();
  console.log('[syncCrm] Iniciando sync rápido CRM → Supabase...');
  try {
    const data     = await buildCrmTemp(0);
    const clientes = data?.clientes || [];
    if (!clientes.length) return { ok: false, msg: 'Nenhum cliente' };

    const agora = new Date().toISOString();
    const rows  = clientes.map(c => ({
      nome:            c.nome,
      celular:         c.celular  || '',
      telefone:        c.telefone || '',
      telefones:       c.telefones || [],
      ultimo_pedido:   c.ultimo_pedido || null,
      dias_sem:        c.dias_sem  ?? null,
      temperatura:     c.temperatura,
      qtd_pedidos:     c.qtd_pedidos,
      ticket_medio:    c.ticket_medio,
      frequencia_dias: c.frequencia_dias ?? null,
      total:           c.total,
      atualizado_em:   agora,
    }));

    const supabase = getSupabase();
    let erros = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const { error } = await supabase
        .from('crm_clientes')
        .upsert(rows.slice(i, i + BATCH_SIZE), { onConflict: 'nome' });
      if (error) { erros++; console.error(`[syncCrm] Erro lote ${Math.floor(i/BATCH_SIZE)+1}:`, error.message); }
    }

    const duracao = Math.round((Date.now() - inicio) / 1000);
    console.log(`[syncCrm] ✓ ${clientes.length} clientes em ${duracao}s.`);
    return { ok: erros === 0, total: clientes.length, duracao_s: duracao, erros };
  } catch (e) {
    console.error('[syncCrm] Erro fatal:', e.message);
    return { ok: false, msg: e.message };
  }
}

// Reenvia para o Supabase usando o cache local salvo pelo último syncCrmFull.
// Útil quando o fetch foi bem-sucedido mas o upsert falhou.
async function upsertFromCache() {
  if (!fs.existsSync(ROWS_CACHE_FILE)) {
    console.error('[syncCrm] Cache local não encontrado:', ROWS_CACHE_FILE);
    return { ok: false, msg: 'Cache não encontrado' };
  }
  const rows = JSON.parse(fs.readFileSync(ROWS_CACHE_FILE, 'utf8'));
  console.log(`[syncCrm] Upserting ${rows.length} registros do cache local...`);
  const supabase = getSupabase();
  let erros = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const { error } = await supabase
      .from('crm_clientes')
      .upsert(rows.slice(i, i + BATCH_SIZE), { onConflict: 'nome' });
    if (error) { erros++; console.error(`[syncCrm] Erro lote ${Math.floor(i/BATCH_SIZE)+1}:`, error.message); }
    else console.log(`[syncCrm] Lote ${Math.floor(i/BATCH_SIZE)+1} ok`);
  }
  console.log(`[syncCrm] Upsert concluído: ${rows.length} registros, ${erros} erros.`);
  return { ok: erros === 0, total: rows.length, erros };
}

module.exports = { syncCrmFull, syncCrmToSupabase, upsertFromCache };
