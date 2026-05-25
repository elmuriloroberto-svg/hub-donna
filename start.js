const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

require('dotenv').config();

const PORT = process.env.PORT || 3000;
const FILE = path.join(__dirname, 'donna_hub_v3_index (6).html');
const TINY_TOKEN = process.env.TINY_TOKEN;
const TINY_BASE = 'https://api.tiny.com.br/api2';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { realtime: { transport: WebSocket } }
);

async function readDB() {
  const { data, error } = await supabase.from('hub_config').select('config_key, config_value');
  if (error || !data) return {};
  const result = {};
  for (const row of data) {
    try { result[row.config_key] = JSON.parse(row.config_value); }
    catch { result[row.config_key] = row.config_value; }
  }
  return result;
}

async function writeDB(newData) {
  const rows = Object.entries(newData).map(([k, v]) => ({
    config_key: k,
    config_value: typeof v === 'string' ? v : JSON.stringify(v),
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('hub_config').upsert(rows, { onConflict: 'config_key' });
  return !error;
}

const cache = new Map();
const CACHE_DASH  = 10 * 60 * 1000;  // 10 min
const CACHE_CRM   = 20 * 60 * 1000;  // 20 min
const CACHE_GIRO  = 2 * 60 * 60 * 1000; // 2h (caro: busca detalhes)
const CACHE_CLI   = 5 * 60 * 1000;   // 5 min
const CACHE_HIST  = 4 * 60 * 60 * 1000; // 4h (histórico completo)

const sleep = ms => new Promise(r => setTimeout(r, ms));

function tinyGet(endpoint, params = {}) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({ token: TINY_TOKEN, formato: 'json', ...params }).toString();
    const url = `${TINY_BASE}/${endpoint}?${qs}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Resposta inválida da API Tiny')); }
      });
    }).on('error', reject);
  });
}

function parseDateBR(str) {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length !== 3) return null;
  return new Date(`${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`);
}

function formatDateBR(d) {
  const dd = d.getDate().toString().padStart(2,'0');
  const mm = (d.getMonth()+1).toString().padStart(2,'0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

async function fetchAllOrders(params, maxPags = 5) {
  const todos = [];
  for (let pag = 1; pag <= maxPags; pag++) {
    const r = await tinyGet('pedidos.pesquisa.php', { ...params, pagina: pag });
    if (r?.retorno?.status !== 'OK') break;
    todos.push(...(r.retorno.pedidos || []).map(p => p.pedido));
    if (pag >= (r.retorno.numero_paginas || 1)) break;
    await sleep(280);
  }
  return todos;
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

async function dashboardTiny(mes, vendedor) {
  const key = `dash_${mes}_${vendedor || 'all'}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_DASH) return cached.data;

  const [ano, mesNum] = mes.split('-');
  const diasNoMes = new Date(parseInt(ano), parseInt(mesNum), 0).getDate();
  const de  = `01/${mesNum}/${ano}`;
  const ate = `${diasNoMes}/${mesNum}/${ano}`;

  const todos = await fetchAllOrders({ dataInicial: de, dataFinal: ate }, 10);

  const filtrado = vendedor
    ? todos.filter(p => (p.nome_vendedor || '').toLowerCase().includes(vendedor.toLowerCase()))
    : todos;

  const total  = filtrado.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
  const qtd    = filtrado.length;
  const ticket = qtd > 0 ? total / qtd : 0;

  // Por dia (para gráfico)
  const porDia = {};
  for (const p of filtrado) {
    const dia = p.data_pedido || '';
    porDia[dia] = (porDia[dia] || 0) + (parseFloat(p.valor) || 0);
  }

  // Por vendedor (sempre do total, para admin ver breakdown)
  const porVendedor = {};
  for (const p of todos) {
    const v = p.nome_vendedor || 'Sem vendedor';
    if (!porVendedor[v]) porVendedor[v] = { total: 0, qtd: 0 };
    porVendedor[v].total += parseFloat(p.valor) || 0;
    porVendedor[v].qtd++;
  }

  const data = {
    total, qtd, ticket,
    total_geral: todos.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0),
    por_dia: Object.entries(porDia)
      .map(([dia, v]) => ({ dia, total: v }))
      .sort((a, b) => (parseDateBR(a.dia) || 0) - (parseDateBR(b.dia) || 0)),
    por_vendedor: Object.entries(porVendedor)
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => b.total - a.total),
    vendedores: Object.keys(porVendedor),
  };

  cache.set(key, { ts: Date.now(), data });
  return data;
}

// ─── CRM ─────────────────────────────────────────────────────────────────────

async function crmTiny(dias) {
  const key = `crm_${dias}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_CRM) return cached.data;

  const de = new Date(Date.now() - dias * 86400000);
  const deBR = formatDateBR(de);

  const todos = await fetchAllOrders({ dataInicial: deBR }, 8);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const clienteMap = {};
  for (const p of todos) {
    const nome = (p.nome || '').trim();
    if (!nome || nome.toLowerCase() === 'consumidor final') continue;
    const dt = parseDateBR(p.data_pedido);
    if (!clienteMap[nome]) clienteMap[nome] = { nome, ultimo: null, pedidos: 0, total: 0, datas: [] };
    if (dt && (!clienteMap[nome].ultimo || dt > clienteMap[nome].ultimo)) clienteMap[nome].ultimo = dt;
    clienteMap[nome].pedidos++;
    clienteMap[nome].total += parseFloat(p.valor) || 0;
    if (dt) clienteMap[nome].datas.push(dt);
  }

  const clientes = Object.values(clienteMap).map(c => {
    const diasSem = c.ultimo ? Math.round((hoje - c.ultimo) / 86400000) : 9999;
    let temperatura = 'congelado';
    if (diasSem < 15) temperatura = 'quente';
    else if (diasSem < 30) temperatura = 'morno';
    else if (diasSem < 45) temperatura = 'frio';

    let freq = null;
    if (c.datas.length >= 2) {
      const sorted = c.datas.sort((a, b) => a - b);
      let gap = 0;
      for (let i = 1; i < sorted.length; i++) gap += (sorted[i] - sorted[i-1]) / 86400000;
      freq = Math.round(gap / (sorted.length - 1));
    }

    return {
      nome: c.nome,
      ultimo_pedido: c.ultimo ? c.ultimo.toLocaleDateString('pt-BR') : '—',
      dias_sem: diasSem,
      qtd_pedidos: c.pedidos,
      total: c.total,
      ticket_medio: c.total / c.pedidos,
      freq_dias: freq,
      temperatura,
    };
  }).sort((a, b) => a.dias_sem - b.dias_sem);

  // Resumo de temperatura
  const resumo = { quente: 0, morno: 0, frio: 0, congelado: 0 };
  clientes.forEach(c => resumo[c.temperatura]++);

  // Perfil médio
  const ativos = clientes.filter(c => c.dias_sem < 9999);
  const ticketMedio = ativos.length ? ativos.reduce((s,c)=>s+c.ticket_medio,0)/ativos.length : 0;
  const freqMedia = ativos.filter(c=>c.freq_dias).length
    ? ativos.filter(c=>c.freq_dias).reduce((s,c)=>s+c.freq_dias,0)/ativos.filter(c=>c.freq_dias).length
    : null;

  const data = {
    clientes,
    resumo,
    perfil: { ticket_medio: ticketMedio, freq_media_dias: freqMedia ? Math.round(freqMedia) : null, total_clientes: clientes.length },
  };

  cache.set(key, { ts: Date.now(), data });
  return data;
}

// ─── HISTÓRICO COMPLETO DE CLIENTES ──────────────────────────────────────────

async function historicoClientes(anosAtras = 5) {
  const key = `hist_${anosAtras}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_HIST) return cached.data;

  const de = new Date();
  de.setFullYear(de.getFullYear() - anosAtras);
  const deBR = formatDateBR(de);

  const todos = await fetchAllOrders({ dataInicial: deBR }, 300);

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const clienteMap = {};

  for (const p of todos) {
    const nome = (p.nome || '').trim();
    if (!nome || nome.toLowerCase() === 'consumidor final') continue;
    const dt = parseDateBR(p.data_pedido);
    if (!clienteMap[nome]) clienteMap[nome] = { nome, ultimo: null, qtd: 0, total: 0 };
    if (dt && (!clienteMap[nome].ultimo || dt > clienteMap[nome].ultimo)) {
      clienteMap[nome].ultimo = dt;
    }
    clienteMap[nome].qtd++;
    clienteMap[nome].total += parseFloat(p.valor) || 0;
  }

  const data = Object.values(clienteMap).map(c => ({
    nome: c.nome,
    ultimo_pedido: c.ultimo ? c.ultimo.toISOString().slice(0, 10) : null,
    dias_sem: c.ultimo ? Math.round((hoje - c.ultimo) / 86400000) : null,
    qtd_pedidos: c.qtd,
    valor_total: Math.round(c.total * 100) / 100,
  })).sort((a, b) => (a.dias_sem ?? 99999) - (b.dias_sem ?? 99999));

  cache.set(key, { ts: Date.now(), data });
  return data;
}

// ─── GIRO (Pedidos Inteligentes) ─────────────────────────────────────────────

async function giroTiny(dias) {
  const key = `giro_${dias}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_GIRO) return cached.data;

  const de = new Date(Date.now() - dias * 86400000);
  const deBR = formatDateBR(de);

  // Fetch order list (up to 3 pages = max 300 orders para não travar)
  const listaOrdens = await fetchAllOrders({ dataInicial: deBR }, 3);

  // Fetch details for up to 50 orders (limited by rate)
  const sample = listaOrdens.slice(0, 50);
  const productMap = {};

  for (const order of sample) {
    try {
      const det = await tinyGet('pedido.obter.php', { id: order.id });
      const itens = det?.retorno?.pedido?.itens || [];
      for (const i of itens) {
        const item = i.item;
        const key2 = (item.codigo || item.descricao || '').substring(0, 60);
        if (!key2) continue;
        if (!productMap[key2]) productMap[key2] = { nome: item.descricao || key2, sku: item.codigo || '—', qtd: 0, receita: 0, pedidos: 0 };
        const q = parseFloat(item.quantidade) || 1;
        const v = parseFloat(item.valor_unitario) || 0;
        productMap[key2].qtd += q;
        productMap[key2].receita += q * v;
        productMap[key2].pedidos++;
      }
    } catch { /* ignora erros individuais */ }
    await sleep(280);
  }

  const fator = sample.length > 0 && listaOrdens.length > sample.length
    ? listaOrdens.length / sample.length : 1;

  const produtos = Object.values(productMap)
    .map(p => ({
      nome: p.nome,
      sku: p.sku,
      qtd_periodo: Math.round(p.qtd * fator),
      qtd_mes: Math.round(p.qtd * fator / dias * 30),
      receita_mes: Math.round(p.receita * fator / dias * 30),
    }))
    .filter(p => p.qtd_mes > 0)
    .sort((a, b) => b.qtd_mes - a.qtd_mes)
    .slice(0, 60);

  const data = { produtos, dias_analisados: dias, pedidos_analisados: sample.length, total_pedidos: listaOrdens.length };
  cache.set(key, { ts: Date.now(), data });
  return data;
}

// ─── BUSCA GIRO POR MARCA/SKU ────────────────────────────────────────────────

async function buscaGiroTiny(query, dias) {
  const cacheKey = `busca_${query.toLowerCase()}_${dias}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_GIRO) return cached.data;

  const q = query.toLowerCase();

  // 1. Busca catálogo de produtos pelo nome/código
  const catProdutos = [];
  for (let pag = 1; pag <= 5; pag++) {
    const r = await tinyGet('produtos.pesquisa.php', { pesquisa: query, pagina: pag });
    if (r?.retorno?.status !== 'OK') break;
    catProdutos.push(...(r.retorno.produtos || []).map(p => p.produto));
    if (pag >= (r.retorno.numero_paginas || 1)) break;
    await sleep(280);
  }

  // Mapa SKU → produto do catálogo
  const catBySku = {};
  for (const cp of catProdutos) {
    if (cp.codigo) catBySku[cp.codigo] = cp;
  }
  const catSkus = new Set(Object.keys(catBySku));

  // 2. Busca pedidos do período
  const de = new Date(Date.now() - dias * 86400000);
  const deBR = formatDateBR(de);
  const listaOrdens = await fetchAllOrders({ dataInicial: deBR }, 5);
  const sample = listaOrdens.slice(0, 60);
  const productMap = {};

  for (const order of sample) {
    try {
      const det = await tinyGet('pedido.obter.php', { id: order.id });
      const itens = det?.retorno?.pedido?.itens || [];
      for (const i of itens) {
        const item = i.item;
        const sku = item.codigo || '';
        const nomeLower = (item.descricao || '').toLowerCase();
        // Inclui se SKU está no catálogo OU nome contém a busca
        if (!catSkus.has(sku) && !nomeLower.includes(q)) continue;
        const mapKey = sku || (item.descricao || '').substring(0, 60);
        if (!mapKey) continue;
        if (!productMap[mapKey]) productMap[mapKey] = { nome: item.descricao || mapKey, sku: sku || '—', qtd: 0, receita: 0, pedidos: 0 };
        const qty = parseFloat(item.quantidade) || 1;
        const price = parseFloat(item.valor_unitario) || 0;
        productMap[mapKey].qtd += qty;
        productMap[mapKey].receita += qty * price;
        productMap[mapKey].pedidos++;
      }
    } catch { /* ignora erros individuais */ }
    await sleep(280);
  }

  const fator = sample.length > 0 && listaOrdens.length > sample.length
    ? listaOrdens.length / sample.length : 1;

  // 3. Mescla: histórico de pedidos + catálogo
  const seen = new Set();
  const produtos = [];

  // Produtos encontrados nos pedidos
  for (const [mapKey, p] of Object.entries(productMap)) {
    const sku = p.sku !== '—' ? p.sku : '';
    if (sku) seen.add(sku);
    const cat = catBySku[sku] || null;
    produtos.push({
      nome: cat?.nome || p.nome,
      sku: p.sku,
      preco: parseFloat(cat?.preco) || 0,
      qtd_periodo: Math.round(p.qtd * fator),
      qtd_mes: Math.round(p.qtd * fator / dias * 30),
      receita_mes: Math.round(p.receita * fator / dias * 30),
      no_catalogo: !!cat,
      sem_historico: false,
    });
  }

  // Produtos só no catálogo (sem histórico nos pedidos analisados)
  for (const cp of catProdutos) {
    const sku = cp.codigo || '';
    if (!sku || seen.has(sku)) continue;
    produtos.push({
      nome: cp.nome || sku,
      sku: sku,
      preco: parseFloat(cp.preco) || 0,
      qtd_periodo: 0,
      qtd_mes: 0,
      receita_mes: 0,
      no_catalogo: true,
      sem_historico: true,
    });
  }

  produtos.sort((a, b) => b.qtd_mes - a.qtd_mes);

  const data = {
    produtos,
    total_catalogo: catProdutos.length,
    dias_analisados: dias,
    pedidos_analisados: sample.length,
    total_pedidos: listaOrdens.length,
  };
  cache.set(cacheKey, { ts: Date.now(), data });
  return data;
}

// ─── CLIENTES (mantido) ───────────────────────────────────────────────────────

async function buscarClientesTiny(maxPaginas = 5) {
  const key = `cli_${maxPaginas}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_CLI) return cached.data;

  const todos = [];
  for (let pag = 1; pag <= maxPaginas; pag++) {
    const r = await tinyGet('contatos.pesquisa.php', { pagina: pag });
    const retorno = r?.retorno;
    if (!retorno || retorno.status !== 'OK') break;
    todos.push(...(retorno.contatos || []).map(c => c.contato));
    if (pag >= (retorno.numero_paginas || 1)) break;
    await sleep(280);
  }

  const data = todos.map(c => ({
    id_tiny: c.id, nome: (c.nome || '').trim(), fantasia: (c.fantasia || '').trim(),
    celular: c.celular || c.fone || '', email: c.email || '',
    cidade: c.cidade || '', uf: c.uf || '',
    situacao: c.situacao === 'Ativo' || c.situacao === 'A' ? 'ativo' : 'inativo',
    data_criacao: c.data_criacao || '',
  })).filter(c => c.nome);

  cache.set(key, { ts: Date.now(), data });
  return data;
}

// ─── HTTP SERVER ─────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = urlObj.pathname;

  const json = (code, body) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.writeHead(code);
    res.end(JSON.stringify(body));
  };

  if (pathname === '/api/tiny/dashboard') {
    const mes     = urlObj.searchParams.get('mes') || new Date().toISOString().substring(0,7);
    const vendedor = urlObj.searchParams.get('vendedor') || '';
    try { json(200, { ok: true, ...(await dashboardTiny(mes, vendedor)) }); }
    catch(e) { json(500, { ok: false, msg: e.message }); }
    return;
  }

  if (pathname === '/api/tiny/crm') {
    const dias = parseInt(urlObj.searchParams.get('dias') || '90');
    try { json(200, { ok: true, ...(await crmTiny(dias)) }); }
    catch(e) { json(500, { ok: false, msg: e.message }); }
    return;
  }

  if (pathname === '/api/tiny/giro') {
    const dias = parseInt(urlObj.searchParams.get('dias') || '30');
    try { json(200, { ok: true, ...(await giroTiny(dias)) }); }
    catch(e) { json(500, { ok: false, msg: e.message }); }
    return;
  }

  if (pathname === '/api/tiny/busca-giro') {
    const q = (urlObj.searchParams.get('q') || '').trim();
    const dias = parseInt(urlObj.searchParams.get('dias') || '60');
    if (!q) { json(400, { ok: false, msg: 'Parâmetro q é obrigatório' }); return; }
    try { json(200, { ok: true, ...(await buscaGiroTiny(q, dias)) }); }
    catch(e) { json(500, { ok: false, msg: e.message }); }
    return;
  }

  if (pathname === '/api/tiny/clientes-busca') {
    const q = (urlObj.searchParams.get('q') || '').trim();
    try {
      const r = await tinyGet('contatos.pesquisa.php', { pesquisa: q || ' ', pagina: 1 });
      const contatos = (r?.retorno?.contatos || []).map(c => c.contato);
      const clientes = contatos.map(c => ({
        id: c.id || '',
        nome: c.nome || '',
        fantasia: c.fantasia || '',
        fone: c.fone || '',
        celular: c.celular || '',
        email: c.email || '',
        cpf_cnpj: c.cpf_cnpj || ''
      }));
      json(200, { ok: true, clientes });
    } catch(e) { json(500, { ok: false, msg: e.message }); }
    return;
  }

  if (pathname === '/api/tiny/fornecedores') {
    const q = (urlObj.searchParams.get('q') || '').trim();
    try {
      const r = await tinyGet('contatos.pesquisa.php', { pesquisa: q || ' ', pagina: 1 });
      const contatos = (r?.retorno?.contatos || []).map(c => c.contato);
      const fornecedores = contatos.map(c => ({
        id: c.id || '',
        nome: c.nome || '',
        fantasia: c.fantasia || '',
        cnpj: c.cpf_cnpj || ''
      }));
      json(200, { ok: true, fornecedores });
    } catch(e) { json(500, { ok: false, msg: e.message }); }
    return;
  }

  if (pathname === '/api/tiny/clientes') {
    const maxPags = parseInt(urlObj.searchParams.get('paginas') || '5');
    try { const data = await buscarClientesTiny(maxPags); json(200, { ok: true, total: data.length, data }); }
    catch(e) { json(500, { ok: false, msg: e.message }); }
    return;
  }

  if (pathname === '/api/tiny/historico-clientes') {
    const anos = parseFloat(urlObj.searchParams.get('anos') || '5');
    try {
      const data = await historicoClientes(anos);
      json(200, { ok: true, total: data.length, gerado_em: new Date().toISOString(), data });
    } catch(e) { json(500, { ok: false, msg: e.message }); }
    return;
  }

  if (pathname === '/api/db' && req.method === 'GET') {
    try { json(200, { ok: true, data: await readDB() }); }
    catch(e) { json(500, { ok: false, msg: e.message }); }
    return;
  }

  if (pathname === '/api/db' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        await writeDB(data);
        json(200, { ok: true });
      } catch(e) { json(400, { ok: false, msg: e.message }); }
    });
    return;
  }

  if (pathname === '/api/tiny/vendas') {
    const de = urlObj.searchParams.get('de') || '';
    const maxPags = parseInt(urlObj.searchParams.get('paginas') || '3');
    try {
      const params = de ? { dataInicial: de } : {};
      const todos = await fetchAllOrders(params, maxPags);
      const total = todos.reduce((s,p)=>s+(parseFloat(p.valor)||0),0);
      json(200, { ok: true, total, qtd_pedidos: todos.length, pedidos_recentes: todos.slice(0,50).map(p=>({ id:p.id, numero:p.numero, data:p.data_pedido, cliente:p.nome||'', vendedor:p.nome_vendedor||'', valor:parseFloat(p.valor)||0, situacao:p.situacao||'' })) });
    }
    catch(e) { json(500, { ok: false, msg: e.message }); }
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(FILE));
});

server.listen(PORT, () => {
  console.log(`\n  Donna Unha Hub (dev) rodando em http://localhost:${PORT}\n  Ctrl+C para parar.\n`);
});
