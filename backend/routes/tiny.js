const express  = require('express');
const https    = require('https');
const { authenticateToken, authorize } = require('../middleware/auth');
const { sanitizeStr } = require('../middleware/security');

const router = express.Router();

const TINY_BASE = 'https://api.tiny.com.br/api2';
const sleep     = ms => new Promise(r => setTimeout(r, ms));

// ── Cache ─────────────────────────────────────────────────────────────────────
const cache = new Map();
const CACHE_DASH     = 10 * 60 * 1000;       // 10 min
const CACHE_CRM      =  2 * 60 * 60 * 1000;  // 2h
const CACHE_GIRO     =  2 * 60 * 60 * 1000;  // 2h
const CACHE_CLI      =  5 * 60 * 1000;       // 5 min
const CACHE_HIST     =  6 * 60 * 60 * 1000;  // 6h
const CACHE_CONTATOS =  2 * 60 * 60 * 1000;  // 2h

// Keys em construção (evita builds paralelos para a mesma chave)
const _building = new Set();

// ── Helpers base ──────────────────────────────────────────────────────────────

function tinyGet(endpoint, params = {}) {
  const token = process.env.TINY_TOKEN;
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({ token, formato: 'json', ...params }).toString();
    const req = https.get(`${TINY_BASE}/${endpoint}?${qs}`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Resposta inválida da API Tiny')); }
      });
    }).on('error', reject);
    // Timeout por chamada — evita pendurar a função Vercel indefinidamente
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('Tiny timeout')); });
  });
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

const normName = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ── Paginação ─────────────────────────────────────────────────────────────────
// maxPags limita o scan (útil para rotas de amostragem).
// Padrão: 9999 = sem limite artificial — para quando numero_paginas da API.
async function fetchAllOrders(params, maxPags = 9999) {
  const todos = [];
  let pag = 1;
  while (pag <= maxPags) {
    const r = await tinyGet('pedidos.pesquisa.php', { ...params, pagina: pag });
    if (r?.retorno?.status !== 'OK') break;
    const pedidos = (r.retorno.pedidos || []).map(p => p.pedido);
    todos.push(...pedidos);
    const totalPags = parseInt(r.retorno.numero_paginas) || 1;
    if (pag >= totalPags) break;
    pag++;
    await sleep(320); // 320ms → ~3 req/s, dentro do rate limit do Tiny
  }
  return todos;
}

// ── Contatos ─────────────────────────────────────────────────────────────────
// Seleciona o melhor número disponível nos campos celular/fone/telefone
function bestPhone(c) {
  const cel = (c.celular || '').trim();
  const tel = (c.fone || c.telefone || '').trim();
  const digCel = cel.replace(/\D/g, '').length;
  const digTel = tel.replace(/\D/g, '').length;
  // Prefere o campo com mais dígitos (celular tem 9, fixo tem 8)
  if (digCel >= digTel) {
    return { celular: cel || tel, telefone: tel || cel };
  }
  return { celular: tel || cel, telefone: cel || tel };
}

// Cache de contatos (módulo-level — persiste entre requests)
let _contatosCache = null;

async function _fetchContatos() {
  const map = {};
  let pag = 1;
  while (true) {
    const r = await tinyGet('contatos.pesquisa.php', { pagina: pag });
    if (r?.retorno?.status !== 'OK') break;
    for (const item of (r.retorno.contatos || [])) {
      const c = item.contato;
      const phones = bestPhone(c);
      const raw = phones.celular.replace(/\D/g, '');
      if (raw.length < 8) continue; // ignora sem número válido
      const key = normName(c.nome);
      if (key) map[key] = phones;
    }
    const totalPags = parseInt(r.retorno.numero_paginas) || 1;
    if (pag >= totalPags) break;
    pag++;
    await sleep(100);
  }
  return map;
}

// Retorna contatos do cache imediatamente (mesmo stale).
// Dispara rebuild em background se necessário.
function loadContatos() {
  if (_contatosCache) {
    if (Date.now() - _contatosCache.ts > CACHE_CONTATOS && !_building.has('_contatos')) {
      _building.add('_contatos');
      _fetchContatos()
        .then(data => { _contatosCache = { ts: Date.now(), data }; })
        .catch(e => console.error('[contatos rebuild]', e.message))
        .finally(() => _building.delete('_contatos'));
    }
    return Promise.resolve(_contatosCache.data);
  }
  // Sem cache: retorna mapa vazio e inicia build em background
  if (!_building.has('_contatos')) {
    _building.add('_contatos');
    _fetchContatos()
      .then(data => { _contatosCache = { ts: Date.now(), data }; })
      .catch(e => console.error('[contatos build]', e.message))
      .finally(() => _building.delete('_contatos'));
  }
  return Promise.resolve({});
}

// ── Stale-while-revalidate ────────────────────────────────────────────────────
// Nunca bloqueia a request: retorna o cache (mesmo stale) e reconstrói em background.
// buildFn() deve retornar o objeto `data` a ser armazenado.
function swrGet(key, ttlMs) {
  const cached = cache.get(key);
  if (!cached) return null;
  return { data: cached.data, stale: Date.now() - cached.ts > ttlMs };
}

function swrBuild(key, buildFn) {
  if (_building.has(key)) return;
  _building.add(key);
  buildFn()
    .then(data => cache.set(key, { ts: Date.now(), data }))
    .catch(e => console.error(`[cache:${key}]`, e.message))
    .finally(() => _building.delete(key));
}

// Resposta padrão para quando cache está sendo construído pela primeira vez
function loadingResponse(res, msg = 'Carregando dados do Tiny... Tente novamente em alguns instantes.') {
  return res.json({ ok: false, loading: true, msg });
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────

router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const mes     = /^\d{4}-\d{2}$/.test(req.query.mes) ? req.query.mes : new Date().toISOString().slice(0,7);
    const vendedor = req.user.role === 'admin'
      ? sanitizeStr(req.query.vendedor || '', 100)
      : req.user.login;

    const key = `dash_${mes}_${vendedor || 'all'}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_DASH) return res.json({ ok: true, ...cached.data });

    const [ano, mesNum] = mes.split('-');
    const diasNoMes = new Date(parseInt(ano), parseInt(mesNum), 0).getDate();
    const todos = await fetchAllOrders(
      { dataInicial: `01/${mesNum}/${ano}`, dataFinal: `${diasNoMes}/${mesNum}/${ano}` },
      10
    );
    const filtrado = vendedor
      ? todos.filter(p => (p.nome_vendedor||'').toLowerCase().includes(vendedor.toLowerCase()))
      : todos;

    const total = filtrado.reduce((s,p) => s+(parseFloat(p.valor)||0), 0);
    const qtd   = filtrado.length;
    const porDia = {};
    for (const p of filtrado) {
      const d = p.data_pedido||'';
      porDia[d] = (porDia[d]||0) + (parseFloat(p.valor)||0);
    }
    const porVendedor = {};
    for (const p of todos) {
      const v = p.nome_vendedor||'Sem vendedor';
      if (!porVendedor[v]) porVendedor[v] = { total:0, qtd:0 };
      porVendedor[v].total += parseFloat(p.valor)||0;
      porVendedor[v].qtd++;
    }
    const data = {
      total, qtd, ticket: qtd>0 ? total/qtd : 0,
      total_geral: todos.reduce((s,p) => s+(parseFloat(p.valor)||0), 0),
      por_dia: Object.entries(porDia).map(([dia,v]) => ({dia,total:v})).sort((a,b) => (parseDateBR(a.dia)||0)-(parseDateBR(b.dia)||0)),
      por_vendedor: Object.entries(porVendedor).map(([nome,v]) => ({nome,...v})).sort((a,b) => b.total-a.total),
      vendedores: Object.keys(porVendedor),
    };
    cache.set(key, { ts: Date.now(), data });
    res.json({ ok: true, ...data });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── CRM (legado) ──────────────────────────────────────────────────────────────

router.get('/crm', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const dias = Math.min(Math.max(parseInt(req.query.dias)||90, 1), 365);
    const key = `crm_${dias}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_CRM) return res.json({ ok: true, ...cached.data });

    const de = new Date(Date.now() - dias*86400000);
    const todos = await fetchAllOrders({ dataInicial: formatDateBR(de) }, 8);
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const clienteMap = {};
    for (const p of todos) {
      const nome=(p.nome||'').trim();
      if(!nome||nome.toLowerCase()==='consumidor final') continue;
      const dt=parseDateBR(p.data_pedido);
      if(!clienteMap[nome]) clienteMap[nome]={nome,ultimo:null,pedidos:0,total:0,datas:[]};
      if(dt&&(!clienteMap[nome].ultimo||dt>clienteMap[nome].ultimo)) clienteMap[nome].ultimo=dt;
      clienteMap[nome].pedidos++;
      clienteMap[nome].total+=parseFloat(p.valor)||0;
      if(dt) clienteMap[nome].datas.push(dt);
    }
    const clientes = Object.values(clienteMap).map(c => {
      const diasSem=c.ultimo?Math.round((hoje-c.ultimo)/86400000):9999;
      let temp='congelado';
      if(diasSem<15)temp='quente';else if(diasSem<30)temp='morno';else if(diasSem<45)temp='frio';
      let freq=null;
      if(c.datas.length>=2){const s=c.datas.sort((a,b)=>a-b);let g=0;for(let i=1;i<s.length;i++)g+=(s[i]-s[i-1])/86400000;freq=Math.round(g/(s.length-1));}
      return {nome:c.nome,ultimo_pedido:c.ultimo?c.ultimo.toLocaleDateString('pt-BR'):'—',dias_sem:diasSem,qtd_pedidos:c.pedidos,total:c.total,ticket_medio:c.total/c.pedidos,freq_dias:freq,temperatura:temp};
    }).sort((a,b)=>a.dias_sem-b.dias_sem);
    const resumo={quente:0,morno:0,frio:0,congelado:0};
    clientes.forEach(c=>resumo[c.temperatura]++);
    const ativos=clientes.filter(c=>c.dias_sem<9999);
    const data={clientes,resumo,perfil:{ticket_medio:ativos.length?ativos.reduce((s,c)=>s+c.ticket_medio,0)/ativos.length:0,freq_media_dias:null,total_clientes:clientes.length}};
    cache.set(key,{ts:Date.now(),data});
    res.json({ ok: true, ...data });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── GIRO ──────────────────────────────────────────────────────────────────────

router.get('/giro', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const dias = Math.min(Math.max(parseInt(req.query.dias)||30, 1), 180);
    const key = `giro_${dias}`;
    const hit = swrGet(key, CACHE_GIRO);
    if (hit) {
      if (hit.stale) swrBuild(key, () => _buildGiro(dias));
      return res.json({ ok: true, stale: hit.stale, ...hit.data });
    }
    swrBuild(key, () => _buildGiro(dias));
    return loadingResponse(res);
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

async function _buildGiro(dias) {
  const de = new Date(Date.now()-dias*86400000);
  const listaOrdens = await fetchAllOrders({ dataInicial: formatDateBR(de) }, 3);
  const sample = listaOrdens.slice(0, 50);
  const productMap = {};
  for (const order of sample) {
    try {
      const det = await tinyGet('pedido.obter.php', { id: order.id });
      const itens = det?.retorno?.pedido?.itens || [];
      for (const i of itens) {
        const item=i.item;
        const k2=(item.codigo||item.descricao||'').substring(0,60);
        if(!k2) continue;
        if(!productMap[k2]) productMap[k2]={nome:item.descricao||k2,sku:item.codigo||'—',qtd:0,receita:0,pedidos:0};
        const q=parseFloat(item.quantidade)||1,v=parseFloat(item.valor_unitario)||0;
        productMap[k2].qtd+=q;productMap[k2].receita+=q*v;productMap[k2].pedidos++;
      }
    } catch {}
    await sleep(300);
  }
  const fator=sample.length>0&&listaOrdens.length>sample.length?listaOrdens.length/sample.length:1;
  const produtos=Object.values(productMap).map(p=>({nome:p.nome,sku:p.sku,qtd_periodo:Math.round(p.qtd*fator),qtd_mes:Math.round(p.qtd*fator/dias*30),receita_mes:Math.round(p.receita*fator/dias*30)})).filter(p=>p.qtd_mes>0).sort((a,b)=>b.qtd_mes-a.qtd_mes).slice(0,60);
  return {produtos,dias_analisados:dias,pedidos_analisados:sample.length,total_pedidos:listaOrdens.length};
}

// ── BUSCA GIRO ────────────────────────────────────────────────────────────────

router.get('/busca-giro', authenticateToken, async (req, res) => {
  try {
    const q    = sanitizeStr(req.query.q || '', 100).trim();
    const dias = Math.min(Math.max(parseInt(req.query.dias)||60, 1), 180);
    if (!q) return res.status(400).json({ ok: false, msg: 'Parâmetro q obrigatório' });

    const cacheKey = `busca_${q.toLowerCase()}_${dias}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_GIRO) return res.json({ ok: true, ...cached.data });

    const catProdutos = [];
    for (let pag=1;;pag++) {
      const r=await tinyGet('produtos.pesquisa.php',{pesquisa:q,pagina:pag});
      if(r?.retorno?.status!=='OK')break;
      catProdutos.push(...(r.retorno.produtos||[]).map(p=>p.produto));
      if(pag>=(r.retorno.numero_paginas||1))break;
      await sleep(320);
    }
    const catBySku={};
    for(const cp of catProdutos){if(cp.codigo)catBySku[cp.codigo]=cp;}
    const catSkus=new Set(Object.keys(catBySku));

    const de=new Date(Date.now()-dias*86400000);
    const listaOrdens=await fetchAllOrders({dataInicial:formatDateBR(de)},5);
    const sample=listaOrdens.slice(0,60);
    const productMap={};
    for(const order of sample){
      try{
        const det=await tinyGet('pedido.obter.php',{id:order.id});
        const itens=det?.retorno?.pedido?.itens||[];
        for(const i of itens){
          const item=i.item,sku=item.codigo||'',nomeLow=(item.descricao||'').toLowerCase();
          if(!catSkus.has(sku)&&!nomeLow.includes(q.toLowerCase()))continue;
          const mk=sku||(item.descricao||'').substring(0,60);
          if(!mk)continue;
          if(!productMap[mk])productMap[mk]={nome:item.descricao||mk,sku:sku||'—',qtd:0,receita:0,pedidos:0};
          const qty=parseFloat(item.quantidade)||1,price=parseFloat(item.valor_unitario)||0;
          productMap[mk].qtd+=qty;productMap[mk].receita+=qty*price;productMap[mk].pedidos++;
        }
      }catch{}
      await sleep(320);
    }
    const fator=sample.length>0&&listaOrdens.length>sample.length?listaOrdens.length/sample.length:1;
    const seen=new Set();
    const produtos=[];
    for(const[mk,p]of Object.entries(productMap)){
      const sku=p.sku!=='—'?p.sku:'';if(sku)seen.add(sku);
      const cat=catBySku[sku]||null;
      produtos.push({nome:cat?.nome||p.nome,sku:p.sku,preco:parseFloat(cat?.preco)||0,qtd_periodo:Math.round(p.qtd*fator),qtd_mes:Math.round(p.qtd*fator/dias*30),receita_mes:Math.round(p.receita*fator/dias*30),no_catalogo:!!cat,sem_historico:false});
    }
    for(const cp of catProdutos){
      const sku=cp.codigo||'';if(!sku||seen.has(sku))continue;
      produtos.push({nome:cp.nome||sku,sku,preco:parseFloat(cp.preco)||0,qtd_periodo:0,qtd_mes:0,receita_mes:0,no_catalogo:true,sem_historico:true});
    }
    produtos.sort((a,b)=>b.qtd_mes-a.qtd_mes);
    const data={produtos,total_catalogo:catProdutos.length,dias_analisados:dias,pedidos_analisados:sample.length,total_pedidos:listaOrdens.length};
    cache.set(cacheKey,{ts:Date.now(),data});
    res.json({ ok: true, ...data });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── PEDIDOS INTELIGENTES (ABC) ─────────────────────────────────────────────────

router.get('/pedidos-inteligentes', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const q    = sanitizeStr(req.query.q || '', 100).trim();
    const dias = Math.min(Math.max(parseInt(req.query.dias) || 60, 7), 180);
    if (!q) return res.status(400).json({ ok: false, msg: 'Parâmetro q obrigatório' });

    const cacheKey = `pi_${q.toLowerCase()}_${dias}`;
    const hit = swrGet(cacheKey, CACHE_GIRO);
    if (hit) {
      if (hit.stale) swrBuild(cacheKey, () => _buildPedidosInteligentes(q, dias));
      return res.json({ ok: true, stale: hit.stale, ...hit.data });
    }
    swrBuild(cacheKey, () => _buildPedidosInteligentes(q, dias));
    return loadingResponse(res, 'Analisando curva ABC... Tente novamente em alguns segundos.');
  } catch (e) { res.status(500).json({ ok: false, msg: e.message }); }
});

async function _buildPedidosInteligentes(q, dias) {
  // 1. Catálogo com paginação completa
  const catProdutos = [];
  for (let pag = 1; ; pag++) {
    const r = await tinyGet('produtos.pesquisa.php', { pesquisa: q, pagina: pag });
    if (r?.retorno?.status !== 'OK') break;
    catProdutos.push(...(r.retorno.produtos || []).map(p => p.produto));
    if (pag >= (parseInt(r.retorno.numero_paginas) || 1)) break;
    await sleep(320);
  }
  const catBySku = {};
  for (const cp of catProdutos) { if (cp.codigo) catBySku[cp.codigo] = cp; }
  const catSkus = new Set(Object.keys(catBySku));

  // 2. Pedidos do período
  const de = new Date(Date.now() - dias * 86400000);
  const listaOrdens = await fetchAllOrders({ dataInicial: formatDateBR(de) }, 20);
  const sample = listaOrdens.slice(0, 80);

  // 3. Detalhe dos itens
  const productMap = {};
  for (const order of sample) {
    try {
      const det = await tinyGet('pedido.obter.php', { id: order.id });
      const itens = det?.retorno?.pedido?.itens || [];
      for (const i of itens) {
        const item = i.item;
        const sku = item.codigo || '';
        const nomeLow = (item.descricao || '').toLowerCase();
        if (!catSkus.has(sku) && !nomeLow.includes(q.toLowerCase())) continue;
        const mk = sku || (item.descricao || '').substring(0, 60);
        if (!mk) continue;
        if (!productMap[mk]) productMap[mk] = { nome: item.descricao || mk, sku: sku || '—', qtd: 0, receita: 0, pedidos: 0 };
        const qty = parseFloat(item.quantidade) || 1;
        const price = parseFloat(item.valor_unitario) || 0;
        productMap[mk].qtd += qty;
        productMap[mk].receita += qty * price;
        productMap[mk].pedidos++;
      }
    } catch {}
    await sleep(300);
  }

  const fator = sample.length > 0 && listaOrdens.length > sample.length ? listaOrdens.length / sample.length : 1;

  // 4. Monta lista de produtos
  const seen = new Set();
  const produtos = [];
  for (const [mk, p] of Object.entries(productMap)) {
    const sku = p.sku !== '—' ? p.sku : '';
    if (sku) seen.add(sku);
    const cat = catBySku[sku] || null;
    const qtdPeriodo = Math.round(p.qtd * fator);
    const mediaDiaria = qtdPeriodo / dias;
    produtos.push({
      nome: cat?.nome || p.nome, sku: p.sku, preco: parseFloat(cat?.preco) || 0,
      qtd_periodo: qtdPeriodo, qtd_mes: Math.round(mediaDiaria * 30),
      media_diaria: Math.round(mediaDiaria * 100) / 100,
      receita_mes: Math.round(p.receita * fator / dias * 30),
      no_catalogo: !!cat, sem_historico: false,
    });
  }
  for (const cp of catProdutos) {
    const sku = cp.codigo || '';
    if (!sku || seen.has(sku)) continue;
    produtos.push({
      nome: cp.nome || sku, sku, preco: parseFloat(cp.preco) || 0,
      qtd_periodo: 0, qtd_mes: 0, media_diaria: 0, receita_mes: 0,
      no_catalogo: true, sem_historico: true,
    });
  }

  // 5. Curva ABC por receita (80/95/100)
  const COBERTURA = { A: 45, B: 30, C: 15 };
  const comVenda = produtos.filter(p => p.receita_mes > 0).sort((a, b) => b.receita_mes - a.receita_mes);
  const receitaTotal = comVenda.reduce((s, p) => s + p.receita_mes, 0);
  let acum = 0;
  for (const p of comVenda) {
    acum += p.receita_mes;
    const pct = receitaTotal > 0 ? acum / receitaTotal : 1;
    p.curva = pct <= 0.80 ? 'A' : pct <= 0.95 ? 'B' : 'C';
    p.dias_cobertura = COBERTURA[p.curva];
  }
  for (const p of produtos) {
    if (!p.curva) { p.curva = 'C'; p.dias_cobertura = 15; }
  }
  produtos.sort((a, b) => ({ A:0,B:1,C:2 }[a.curva] - { A:0,B:1,C:2 }[b.curva]) || (b.qtd_mes - a.qtd_mes));

  const resumo_abc = { A:0, B:0, C:0 };
  for (const p of produtos) resumo_abc[p.curva]++;

  return { produtos, total_catalogo: catProdutos.length, dias_analisados: dias, pedidos_analisados: sample.length, total_pedidos: listaOrdens.length, resumo_abc };
}

// ── CLIENTES ──────────────────────────────────────────────────────────────────

router.get('/clientes', authenticateToken, async (req, res) => {
  try {
    const maxPags = Math.min(parseInt(req.query.paginas||'5'), 20);
    const key = `cli_${maxPags}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_CLI) return res.json({ ok: true, total: cached.data.length, data: cached.data });

    const todos = [];
    for (let pag=1; pag<=maxPags; pag++) {
      const r = await tinyGet('contatos.pesquisa.php', { pagina: pag });
      if(r?.retorno?.status!=='OK') break;
      todos.push(...(r.retorno.contatos||[]).map(c=>c.contato));
      if(pag>=(parseInt(r.retorno.numero_paginas)||1)) break;
      await sleep(320);
    }
    const data = todos.map(c => {
      const phones = bestPhone(c);
      return {
        id_tiny: c.id,
        nome: (c.nome||'').trim(),
        fantasia: (c.fantasia||'').trim(),
        celular: phones.celular,
        telefone: phones.telefone,
        email: c.email||'',
        cidade: c.cidade||'',
        uf: c.uf||'',
        situacao: c.situacao==='Ativo'||c.situacao==='A'?'ativo':'inativo',
        data_criacao: c.data_criacao||'',
      };
    }).filter(c => c.nome);
    cache.set(key, { ts: Date.now(), data });
    res.json({ ok: true, total: data.length, data });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

router.get('/clientes-busca', authenticateToken, async (req, res) => {
  try {
    const q = sanitizeStr(req.query.q||'', 100).trim();
    const r = await tinyGet('contatos.pesquisa.php', { pesquisa: q||' ', pagina: 1 });
    const clientes = (r?.retorno?.contatos||[]).map(c=>c.contato).map(c => {
      const phones = bestPhone(c);
      return { id: c.id||'', nome: c.nome||'', fantasia: c.fantasia||'', fone: phones.telefone, celular: phones.celular, email: c.email||'', cpf_cnpj: c.cpf_cnpj||'' };
    });
    res.json({ ok: true, clientes });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

router.get('/fornecedores', authenticateToken, async (req, res) => {
  try {
    const q = sanitizeStr(req.query.q||'', 100).trim();
    const r = await tinyGet('contatos.pesquisa.php', { pesquisa: q||' ', pagina: 1 });
    const fornecedores = (r?.retorno?.contatos||[]).map(c=>c.contato).map(c => ({id:c.id||'',nome:c.nome||'',fantasia:c.fantasia||'',cnpj:c.cpf_cnpj||''}));
    res.json({ ok: true, fornecedores });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── HISTÓRICO CLIENTES ────────────────────────────────────────────────────────

router.get('/historico-clientes', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const anos = Math.min(Math.max(parseFloat(req.query.anos||'5'), 0.5), 10);
    const key  = `hist_${anos}`;
    const hit  = swrGet(key, CACHE_HIST);
    if (hit) {
      if (hit.stale) swrBuild(key, () => _buildHistoricoClientes(anos));
      return res.json({ ok: true, total: hit.data.length, gerado_em: new Date().toISOString(), stale: hit.stale, data: hit.data });
    }
    swrBuild(key, () => _buildHistoricoClientes(anos));
    return loadingResponse(res, 'Construindo histórico de clientes... Tente novamente em 1-2 minutos.');
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

async function _buildHistoricoClientes(anos) {
  const de = new Date(); de.setFullYear(de.getFullYear() - anos);
  const todos = await fetchAllOrders({ dataInicial: formatDateBR(de) });
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const clienteMap = {};
  for (const p of todos) {
    const nome = (p.nome||'').trim();
    if (!nome || nome.toLowerCase()==='consumidor final') continue;
    const dt = parseDateBR(p.data_pedido);
    if (!clienteMap[nome]) clienteMap[nome] = { nome, ultimo: null, qtd: 0, total: 0 };
    if (dt && (!clienteMap[nome].ultimo || dt > clienteMap[nome].ultimo)) clienteMap[nome].ultimo = dt;
    clienteMap[nome].qtd++;
    clienteMap[nome].total += parseFloat(p.valor) || 0;
  }
  return Object.values(clienteMap).map(c => ({
    nome:          c.nome,
    ultimo_pedido: c.ultimo ? c.ultimo.toISOString().slice(0,10) : null,
    dias_sem:      c.ultimo ? Math.round((hoje - c.ultimo) / 86400000) : null,
    qtd_pedidos:   c.qtd,
    valor_total:   Math.round(c.total * 100) / 100,
  })).sort((a,b) => (a.dias_sem??99999) - (b.dias_sem??99999));
}

// ── VENDAS ────────────────────────────────────────────────────────────────────

router.get('/vendas', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const de      = /^\d{2}\/\d{2}\/\d{4}$/.test(req.query.de) ? req.query.de : '';
    const maxPags = Math.min(parseInt(req.query.paginas||'3'), 10);
    const params  = de ? { dataInicial: de } : {};
    const todos   = await fetchAllOrders(params, maxPags);
    const total   = todos.reduce((s,p) => s+(parseFloat(p.valor)||0), 0);
    res.json({
      ok: true, total, qtd_pedidos: todos.length,
      pedidos_recentes: todos.slice(0,50).map(p => ({
        id: p.id, numero: p.numero, data: p.data_pedido,
        cliente: p.nome||'', vendedor: p.nome_vendedor||'',
        valor: parseFloat(p.valor)||0, situacao: p.situacao||'',
      })),
    });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── CRM TEMPERATURA ───────────────────────────────────────────────────────────

function isoToBR(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function buildCrmResumoEPerfil(clientes) {
  const resumo = { quente: 0, morno: 0, frio: 0, congelado: 0 };
  clientes.forEach(c => resumo[c.temperatura]++);
  const ativos    = clientes.filter(c => c.dias_sem !== null);
  const comFreq   = ativos.filter(c => c.freq_dias !== null);
  const tkGeral   = ativos.length ? ativos.reduce((s,c) => s+c.ticket_medio, 0) / ativos.length : 0;
  const freqGeral = comFreq.length ? Math.round(comFreq.reduce((s,c) => s+c.freq_dias, 0) / comFreq.length) : null;
  const comWA     = clientes.filter(c => c.celular || c.telefone).length;
  const top       = [...ativos].sort((a,b) => b.total - a.total)[0] || null;
  return {
    resumo,
    perfil: {
      total_clientes:  clientes.length,
      ativos:          ativos.length,
      ticket_medio:    Math.round(tkGeral * 100) / 100,
      freq_media_dias: freqGeral,
      com_whatsapp:    comWA,
      top_cliente:     top ? { nome: top.nome, total: top.total } : null,
    },
  };
}

function classifyTemp(d) {
  if (d === null || d > 45) return 'congelado';
  if (d <= 15) return 'quente';
  if (d <= 30) return 'morno';
  return 'frio';
}

const TEMP_ORDER = { quente:0, morno:1, frio:2, congelado:3 };
function sortByTemp(arr) {
  return arr.sort((a,b) =>
    (TEMP_ORDER[a.temperatura] - TEMP_ORDER[b.temperatura]) ||
    ((a.dias_sem ?? 9999) - (b.dias_sem ?? 9999))
  );
}

// Blocking build — Vercel serverless cancela background tasks após res.end().
router.get('/crm-temperatura', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  const periodo = Math.max(parseInt(req.query.periodo ?? '90'), 0);
  const KEY = `crm_temp_${periodo}`;

  try {
    const hit = swrGet(KEY, CACHE_CRM);
    if (hit) {
      if (hit.stale) swrBuild(KEY, () => _buildCrmTemp(periodo));
      return res.json({ ok: true, stale: hit.stale || false, ...hit.data });
    }
    // Sem cache: aguarda build completo antes de responder
    const data = await _buildCrmTemp(periodo);
    cache.set(KEY, { ts: Date.now(), data });
    return res.json({ ok: true, stale: false, ...data });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

async function _buildCrmTemp(periodo) {
  const hoje = new Date(); hoje.setHours(0,0,0,0);

  if (periodo === 0) {
    // Geral: 5 anos completos — reutiliza hist_5 se disponível
    let histData = null;
    const histHit = swrGet('hist_5', CACHE_HIST);
    if (histHit) {
      histData = histHit.data;
      if (histHit.stale) {
        // Reconstrói hist_5 em background (não bloqueia o CRM temp)
        swrBuild('hist_5', () => _buildHistoricoClientes(5));
      }
    } else {
      // Precisa construir agora
      histData = await _buildHistoricoClientes(5);
      cache.set('hist_5', { ts: Date.now(), data: histData });
    }

    const contatoMap = _contatosCache?.data || await _fetchContatos().then(d => {
      _contatosCache = { ts: Date.now(), data: d };
      return d;
    });
    const clientes = sortByTemp(histData.map(h => {
      const nk = normName(h.nome);
      const ct = contatoMap[nk] || { celular: '', telefone: '' };
      return {
        nome:          h.nome,
        ultimo_pedido: isoToBR(h.ultimo_pedido),
        dias_sem:      h.dias_sem,
        temperatura:   classifyTemp(h.dias_sem),
        qtd_pedidos:   h.qtd_pedidos,
        ticket_medio:  h.qtd_pedidos > 0 ? Math.round(h.valor_total / h.qtd_pedidos * 100) / 100 : 0,
        freq_dias:     null,
        total:         h.valor_total,
        celular:       ct.celular,
        telefone:      ct.telefone,
      };
    }));

    const { resumo, perfil } = buildCrmResumoEPerfil(clientes);
    return { clientes, resumo, perfil, total: clientes.length, periodo };
  }

  // Períodos limitados (30 / 90 / 120 dias) — paginação completa sem limite artificial
  const params  = { dataInicial: formatDateBR(new Date(Date.now() - periodo * 86400000)) };
  const [orders, contatoMap] = await Promise.all([
    fetchAllOrders(params),
    _contatosCache
      ? Promise.resolve(_contatosCache.data)
      : _fetchContatos().then(d => { _contatosCache = { ts: Date.now(), data: d }; return d; }),
  ]);

  const clienteMap = {};
  for (const p of orders) {
    const nome = (p.nome || '').trim();
    if (!nome || nome.toLowerCase() === 'consumidor final') continue;
    const dt  = parseDateBR(p.data_pedido);
    const val = parseFloat(p.valor) || 0;
    if (!clienteMap[nome]) clienteMap[nome] = { nome, ultimo: null, datas: [], totalValor: 0, qtd: 0 };
    if (dt) {
      if (!clienteMap[nome].ultimo || dt > clienteMap[nome].ultimo) clienteMap[nome].ultimo = dt;
      clienteMap[nome].datas.push(dt.getTime());
    }
    clienteMap[nome].totalValor += val;
    clienteMap[nome].qtd++;
  }

  const clientes = sortByTemp(Object.values(clienteMap).map(c => {
    const diasSem = c.ultimo ? Math.round((hoje - c.ultimo) / 86400000) : null;
    let freqDias = null;
    if (c.datas.length >= 2) {
      const s = [...c.datas].sort((a,b) => a-b);
      let g = 0;
      for (let i = 1; i < s.length; i++) g += (s[i]-s[i-1]) / 86400000;
      freqDias = Math.round(g / (s.length - 1));
    }
    const nk = normName(c.nome);
    const ct = contatoMap[nk] || { celular: '', telefone: '' };
    return {
      nome:          c.nome,
      ultimo_pedido: c.ultimo ? formatDateBR(c.ultimo) : '—',
      dias_sem:      diasSem,
      temperatura:   classifyTemp(diasSem),
      qtd_pedidos:   c.qtd,
      ticket_medio:  Math.round((c.qtd > 0 ? c.totalValor / c.qtd : 0) * 100) / 100,
      freq_dias:     freqDias,
      total:         Math.round(c.totalValor * 100) / 100,
      celular:       ct.celular,
      telefone:      ct.telefone,
    };
  }));

  const { resumo, perfil } = buildCrmResumoEPerfil(clientes);
  return { clientes, resumo, perfil, total: clientes.length, periodo };
}

// ── Cache status (debug) ──────────────────────────────────────────────────────
router.get('/cache-status', authenticateToken, authorize('admin'), (req, res) => {
  const status = {};
  for (const [k, v] of cache.entries()) {
    status[k] = {
      age_min: Math.round((Date.now() - v.ts) / 60000),
      building: _building.has(k),
      size: Array.isArray(v.data) ? v.data.length : (v.data?.clientes?.length ?? '—'),
    };
  }
  status['_contatos'] = {
    cached: !!_contatosCache,
    age_min: _contatosCache ? Math.round((Date.now() - _contatosCache.ts) / 60000) : null,
    building: _building.has('_contatos'),
    entries: _contatosCache ? Object.keys(_contatosCache.data).length : 0,
  };
  res.json({ ok: true, building: [..._building], cache: status });
});

// ── Warm-up ao iniciar ────────────────────────────────────────────────────────
// Inicia build de contatos em background logo que o módulo carrega.
// Assim, quando a primeira request de CRM chegar, o mapa de telefones já estará pronto.
setTimeout(() => {
  if (!_contatosCache && !_building.has('_contatos')) {
    console.log('[tiny] warm-up: iniciando fetch de contatos em background...');
    _building.add('_contatos');
    _fetchContatos()
      .then(data => {
        _contatosCache = { ts: Date.now(), data };
        console.log(`[tiny] warm-up: ${Object.keys(data).length} contatos carregados.`);
      })
      .catch(e => console.error('[tiny] warm-up contatos falhou:', e.message))
      .finally(() => _building.delete('_contatos'));
  }
}, 5000); // 5s após o boot para não atrasar o startup

module.exports = router;
