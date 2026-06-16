const express  = require('express');
const https    = require('https');
const { authenticateToken, authorize } = require('../middleware/auth');
const { sanitizeStr } = require('../middleware/security');
const { getSupabase } = require('../lib/supabase');

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

const normName = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// ── Paginação ─────────────────────────────────────────────────────────────────
// Cada página tem até 3 tentativas com backoff exponencial antes de desistir.
async function _fetchOrdersPage(params, pag) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await tinyGet('pedidos.pesquisa.php', { ...params, pagina: pag });
      if (r?.retorno?.status === 'OK') return r;
    } catch (_) {}
    if (attempt < 3) await sleep(500 * attempt); // 500ms, 1000ms
  }
  return null;
}

// maxPags limita o scan (útil para rotas de amostragem).
// Padrão: 9999 = sem limite artificial — para quando numero_paginas da API.
async function fetchAllOrders(params, maxPags = 9999) {
  const todos = [];
  let pag = 1;
  while (pag <= maxPags) {
    const r = await _fetchOrdersPage(params, pag);
    if (!r) break; // desistiu após 3 tentativas — para sem estourar
    const pedidos = (r.retorno.pedidos || []).map(p => p.pedido);
    todos.push(...pedidos);
    const totalPags = parseInt(r.retorno.numero_paginas) || 1;
    if (pag >= totalPags) break;
    pag++;
    await sleep(300);
  }
  return todos;
}

// ── Contatos ─────────────────────────────────────────────────────────────────
// Varredura agressiva: coleta todos os valores de telefone possíveis e ordena
// por número de dígitos (mais dígitos = mais completo = provável celular).
function bestPhone(c) {
  const candidates = [c.celular, c.fone, c.telefone, c.tel, c.mobile]
    .filter(Boolean)
    .map(v => String(v).trim());

  // fones pode ser array de strings, objetos { numero } ou { fone: { numero } }
  const fones = c.fones || c.Fones;
  if (Array.isArray(fones)) {
    for (const f of fones) {
      if (typeof f === 'string') candidates.push(f.trim());
      else if (f?.fone?.numero) candidates.push(String(f.fone.numero).trim());
      else if (f?.numero)       candidates.push(String(f.numero).trim());
      else if (f?.fone)         candidates.push(String(f.fone).trim());
    }
  }

  // Dedup por dígitos, filtra < 8 dígitos, ordena desc por comprimento (celular tem 9, fixo tem 8)
  const seen = new Set();
  const valid = candidates.filter(v => {
    const d = v.replace(/\D/g, '');
    if (d.length < 8 || seen.has(d)) return false;
    seen.add(d);
    return true;
  }).sort((a, b) => b.replace(/\D/g, '').length - a.replace(/\D/g, '').length);

  return { celular: valid[0] || '', telefone: valid[1] || valid[0] || '', telefones: valid };
}

// Cache de contatos (módulo-level — persiste entre requests)
let _contatosCache = null;

async function _fetchContatosPage(pag) {
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    const r = await tinyGet('contatos.pesquisa.php', { pagina: pag });
    if (r?.retorno?.status === 'OK') return r;
    // Rate limit ou erro transitório: backoff antes de tentar de novo
    if (tentativa < 4) await sleep(600 * tentativa); // 600ms, 1200ms, 1800ms
  }
  return null; // desiste após 4 tentativas — não quebra o loop, só pula a página
}

async function _fetchContatos() {
  const byId   = {};
  const byCpf  = {};
  const byName = {};
  const todos  = []; // lista completa — base do CRM de contatos
  let pag = 1;
  let totalCarregados = 0;
  let totalSemFone    = 0;
  const MAX_PAGS = 500;
  while (pag <= MAX_PAGS) {
    const r = await _fetchContatosPage(pag);
    if (!r) {
      console.warn(`[contatos] página ${pag} falhou após retentativas — parando.`);
      break;
    }
    const items = (r.retorno.contatos || []).map(i => i.contato);
    if (items.length === 0) break;
    let semFone = 0;
    for (const c of items) {
      const phones = bestPhone(c);
      if (!phones.celular) semFone++;

      const id  = c.id ? String(c.id) : '';
      const cpf = (c.cpf_cnpj || '').replace(/\D/g, '');
      const key = normName(c.nome);
      const fan = normName(c.fantasia);

      // Preserva campos brutos do cadastro — fonte de verdade para WhatsApp
      const phoneData = {
        celular:  (c.celular  || '').trim(),
        telefone: (c.telefone || '').trim(),
        fone:     (c.fone     || '').trim(),
        telefones: phones.telefones,
      };

      if (id)              byId[id]  = phoneData;
      if (cpf.length >= 11) byCpf[cpf] = phoneData;
      if (key)             byName[key] = phoneData;
      if (fan && !byName[fan]) byName[fan] = phoneData;

      // Guarda o contato completo para o CRM baseado em contatos
      todos.push({
        id,
        nome:     (c.nome     || '').trim(),
        fantasia: (c.fantasia || '').trim(),
        cpf_cnpj: c.cpf_cnpj || '',
        email:    c.email     || '',
        cidade:   c.cidade    || '',
        uf:       c.uf        || '',
        situacao: c.situacao  || '',
        celular:  (c.celular  || '').trim(),
        telefone: (c.telefone || '').trim(),
        fone:     (c.fone     || '').trim(),
        telefones: phones.telefones,
      });
    }
    totalCarregados += items.length;
    totalSemFone    += semFone;
    const totalPags = parseInt(r.retorno.numero_paginas) || 999;
    if (pag >= totalPags) break;
    pag++;
    await sleep(300);
  }
  console.log(
    `[contatos] ${totalCarregados} carregados` +
    ` | com fone: ${totalCarregados - totalSemFone}` +
    ` | sem fone: ${totalSemFone}`
  );
  return { byId, byCpf, byName, todos };
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

const EMPTY_PHONE = { celular: '', telefone: '', fone: '', telefones: [] };

// Normaliza array de telefones brutos para formato WhatsApp (dígitos + '55').
// Entrada: ['(61) 98152-0717', '61 3200-1234', null, '']
// Saída:   ['5561981520717', '556132001234']
// Válido: DDD(2) + 8 dígitos (fixo) ou 9 dígitos (celular) = 10 ou 11 dígitos base.
function normalizePhones(rawList) {
  const seen = new Set();
  const result = [];
  for (const raw of rawList) {
    if (!raw) continue;
    const digits = raw.replace(/\D/g, '');
    if (!digits) continue;
    // Remove prefixo "55" já existente antes de validar comprimento
    const base = (digits.startsWith('55') && (digits.length === 12 || digits.length === 13))
      ? digits.slice(2)
      : digits;
    if (base.length !== 10 && base.length !== 11) continue;
    const wa = '55' + base;
    if (!seen.has(wa)) { seen.add(wa); result.push(wa); }
  }
  return result;
}

function lookupContato(contatoMap, idContato, cpfCnpj, nome) {
  if (idContato) {
    const hit = contatoMap.byId?.[String(idContato)];
    if (hit) return hit;
  }
  const cpf = (cpfCnpj || '').replace(/\D/g, '');
  if (cpf.length >= 11) {
    const hit = contatoMap.byCpf?.[cpf];
    if (hit) return hit;
  }
  const nk = normName(nome);
  return (nk && contatoMap.byName?.[nk]) || EMPTY_PHONE;
}

// Extrai telefone direto do payload do pedido (fallback primário antes do mapa de contatos).
// A pesquisa.php retorna campos rasos; se vier p.cliente aninhado, usa ele primeiro.
function phoneFromOrder(p) {
  const nested = (typeof p.cliente === 'object' && p.cliente) ? p.cliente : {};
  // Mescla nested+root para que bestPhone veja todos os campos de uma vez
  return bestPhone({ ...p, ...nested });
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

// GET /api/tiny/semana — total de vendas desta semana por vendedor (para metas gamificadas)
router.get('/semana', authenticateToken, async (req, res) => {
  try {
    const hoje = new Date();
    const diaDaSemana = hoje.getDay();
    const diffParaSeg = diaDaSemana === 0 ? -6 : 1 - diaDaSemana;
    const seg = new Date(hoje);
    seg.setDate(hoje.getDate() + diffParaSeg);
    const dom = new Date(seg);
    dom.setDate(seg.getDate() + 6);

    const fmt = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    const inicioFmt = fmt(seg);
    const fimFmt    = fmt(dom);

    const cacheKey = `semana_${inicioFmt}`;
    const cached   = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 5 * 60 * 1000)
      return res.json({ ok: true, ...cached.data });

    const todos = await fetchAllOrders({ dataInicial: inicioFmt, dataFinal: fimFmt }, 5);

    const porVendedor = {};
    for (const p of todos) {
      const v = p.nome_vendedor || 'Sem vendedor';
      porVendedor[v] = (porVendedor[v] || 0) + (parseFloat(p.valor) || 0);
    }

    const data = {
      por_vendedor: porVendedor,
      total: todos.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0),
      qtd:   todos.length,
    };

    cache.set(cacheKey, { ts: Date.now(), data });
    res.json({ ok: true, ...data });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

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
    if (!clienteMap[nome]) clienteMap[nome] = { nome, primeiro: null, ultimo: null, qtd: 0, total: 0, id_contato: null, cpf_cnpj: null, celularPedido: '' };
    if (dt) {
      if (!clienteMap[nome].primeiro || dt < clienteMap[nome].primeiro) clienteMap[nome].primeiro = dt;
      if (!clienteMap[nome].ultimo   || dt > clienteMap[nome].ultimo)   clienteMap[nome].ultimo   = dt;
    }
    clienteMap[nome].qtd++;
    clienteMap[nome].total += parseFloat(p.valor) || 0;
    if (!clienteMap[nome].id_contato) {
      const pid = p.id_contato || p.cliente?.id;
      if (pid) clienteMap[nome].id_contato = String(pid);
    }
    if (!clienteMap[nome].cpf_cnpj && p.cpf_cnpj) clienteMap[nome].cpf_cnpj = p.cpf_cnpj;
    // Fallback primário: captura telefone direto do payload do pedido
    if (!clienteMap[nome].celularPedido) {
      const ph = phoneFromOrder(p);
      if (ph.celular) clienteMap[nome].celularPedido = ph.celular;
    }
  }
  return Object.values(clienteMap).map(c => {
    const frequencia_dias = (c.qtd > 1 && c.primeiro && c.ultimo && c.primeiro < c.ultimo)
      ? Math.round((c.ultimo - c.primeiro) / 86400000 / (c.qtd - 1))
      : null;
    return {
      nome:            c.nome,
      ultimo_pedido:   c.ultimo ? c.ultimo.toISOString().slice(0,10) : null,
      dias_sem:        c.ultimo ? Math.round((hoje - c.ultimo) / 86400000) : null,
      qtd_pedidos:     c.qtd,
      valor_total:     Math.round(c.total * 100) / 100,
      id_contato:      c.id_contato,
      cpf_cnpj:        c.cpf_cnpj,
      celularPedido:   c.celularPedido || '',
      frequencia_dias,
    };
  }).sort((a,b) => (a.dias_sem??99999) - (b.dias_sem??99999));
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

// Ordena por recência: dias_sem crescente (comprou há 2 dias aparece antes de quem comprou há 45).
// Clientes sem histórico (dias_sem null) vão para o final.
function sortByRecency(arr) {
  return arr.sort((a, b) => (a.dias_sem ?? 99999) - (b.dias_sem ?? 99999));
}

router.get('/crm-temperatura', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  const periodo = Math.max(parseInt(req.query.periodo ?? '30'), 0);
  const KEY = `crm_temp_${periodo}`;

  try {
    // 1. Cache em memória (válido por 2h)
    const hit = swrGet(KEY, CACHE_CRM);
    if (hit) {
      if (hit.stale) swrBuild(KEY, () => _buildCrmTemp(periodo));
      return res.json({ ok: true, stale: hit.stale || false, ...hit.data });
    }

    // 2. Período = 0 (Geral): usa Supabase — base completa de contatos + telefones do sync noturno.
    //    Períodos > 0 vão direto ao Tiny: o Supabase não armazena histórico de pedidos confiável
    //    (o syncCrmFull salva telefones, não série temporal de compras).
    if (periodo === 0) {
      try {
        const supabase = getSupabase();
        const { data: sbData, error: sbErr } = await supabase
          .from('crm_clientes')
          .select('nome,celular,telefone,telefones,ultimo_pedido,dias_sem,temperatura,qtd_pedidos,ticket_medio,frequencia_dias,total,atualizado_em');
        if (!sbErr && sbData?.length > 0) {
          const newest   = sbData.reduce((m, r) => (r.atualizado_em > m ? r.atualizado_em : m), '');
          const ageHours = (Date.now() - new Date(newest).getTime()) / 3600000;
          if (ageHours < 25) {
            const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
            const clientes = sortByRecency(sbData.map(r => {
              let diasSem = r.dias_sem;
              if (r.ultimo_pedido && r.ultimo_pedido !== '—') {
                const dt = parseDateBR(r.ultimo_pedido) || new Date(r.ultimo_pedido);
                if (dt && !isNaN(dt)) diasSem = Math.round((hoje - dt) / 86400000);
              }
              return {
                nome:            r.nome,
                celular:         r.celular  || '',
                telefone:        r.telefone || '',
                telefones:       r.telefones || [],
                ultimo_pedido:   r.ultimo_pedido || '—',
                dias_sem:        diasSem,
                temperatura:     classifyTemp(diasSem),
                qtd_pedidos:     r.qtd_pedidos,
                ticket_medio:    parseFloat(r.ticket_medio) || 0,
                frequencia_dias: r.frequencia_dias,
                total:           parseFloat(r.total) || 0,
              };
            }));
            const { resumo, perfil } = buildCrmResumoEPerfil(clientes);
            const sbResult = { clientes, resumo, perfil, total: clientes.length, periodo };
            cache.set(KEY, { ts: Date.now(), data: sbResult });
            return res.json({ ok: true, stale: false, source: 'supabase', ...sbResult });
          }
        }
      } catch (sbErr) {
        console.warn('[crm-temp] Supabase Geral indisponível:', sbErr.message);
      }
    }

    // 3. Build via Tiny API — único caminho para períodos > 0 e fallback do Geral
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
    // Geral: base = TODOS os contatos cadastrados no Tiny (não apenas quem comprou)
    // Usa 10 anos para cobrir todo o histórico da loja.
    // Na prática lê do Supabase (sync noturno), então não há risco de timeout no Vercel.
    let histData = null;
    const histHit = swrGet('hist_10', CACHE_HIST);
    if (histHit) {
      histData = histHit.data;
      if (histHit.stale) swrBuild('hist_10', () => _buildHistoricoClientes(10));
    } else {
      histData = await _buildHistoricoClientes(10);
      cache.set('hist_10', { ts: Date.now(), data: histData });
    }

    const contatoMap = _contatosCache?.data || await _fetchContatos().then(d => {
      _contatosCache = { ts: Date.now(), data: d };
      return d;
    });

    // Indexa histórico de pedidos por 3 chaves para lookup O(1)
    const histById   = {};
    const histByCpf  = {};
    const histByName = {};
    for (const h of histData) {
      if (h.id_contato)                         histById[h.id_contato]            = h;
      const cpf = (h.cpf_cnpj || '').replace(/\D/g, '');
      if (cpf.length >= 11)                     histByCpf[cpf]                    = h;
      const nk = normName(h.nome);
      if (nk)                                   histByName[nk]                    = h;
    }

    // Base = todos os contatos cadastrados no Tiny
    const base = contatoMap.todos || [];
    console.log(`[crm-geral] base de contatos: ${base.length} | histórico: ${histData.length}`);

    const clientes = sortByRecency(base.map(c => {
      const cpf = (c.cpf_cnpj || '').replace(/\D/g, '');
      const nk  = normName(c.nome);
      const h   = histById[c.id]
               || (cpf.length >= 11 ? histByCpf[cpf] : null)
               || histByName[nk]
               || null;

      // CADASTRO = fonte de verdade para contato (celular, telefone, fone)
      const telefones = normalizePhones([c.celular, c.telefone, c.fone]);
      const celular   = telefones[0] || '';
      const telefone  = telefones[1] || telefones[0] || '';
      const diasSem   = h?.dias_sem ?? null;

      return {
        nome:            c.nome,
        ultimo_pedido:   h ? isoToBR(h.ultimo_pedido) : '—',
        dias_sem:        diasSem,
        temperatura:     classifyTemp(diasSem),
        qtd_pedidos:     h?.qtd_pedidos  || 0,
        ticket_medio:    (h && h.qtd_pedidos > 0) ? Math.round(h.valor_total / h.qtd_pedidos * 100) / 100 : 0,
        frequencia_dias: h?.frequencia_dias ?? null,
        total:           h?.valor_total  || 0,
        celular,
        telefone,
        telefones,
      };
    }));

    const { resumo, perfil } = buildCrmResumoEPerfil(clientes);
    return { clientes, resumo, perfil, total: clientes.length, periodo };
  }

  // Períodos limitados (30 / 90 / 120 dias) — paginação completa sem limite artificial
  const params  = { dataInicial: formatDateBR(new Date(Date.now() - periodo * 86400000)) };

  // Carrega pedidos + mapa de contatos (lista) em paralelo.
  // Também tenta carregar mapa de telefones do Supabase — que tem celular real
  // de contato.obter.php (syncCrmFull), algo que contatos.pesquisa.php não retorna.
  const [orders, contatoMap, sbPhoneMap] = await Promise.all([
    fetchAllOrders(params),
    _contatosCache
      ? Promise.resolve(_contatosCache.data)
      : _fetchContatos().then(d => { _contatosCache = { ts: Date.now(), data: d }; return d; }),
    (async () => {
      const map = {};
      try {
        const supabase = getSupabase();
        const { data } = await supabase
          .from('crm_clientes')
          .select('nome, celular, telefone, telefones');
        if (data?.length) {
          for (const r of data) map[normName(r.nome)] = r;
        }
      } catch (e) {
        console.warn('[crm-temp] Supabase phone lookup indisponível:', e.message);
      }
      return map;
    })(),
  ]);

  // Passo 1: Histórico e Temperatura — pedidos usados APENAS para dados financeiros
  const clienteMap = {};
  for (const p of orders) {
    const nome = (p.nome || '').trim();
    if (!nome || nome.toLowerCase() === 'consumidor final' || nome.toLowerCase() === 'cliente padrão') continue;
    const dt  = parseDateBR(p.data_pedido);
    const val = parseFloat(p.valor) || 0;
    // Passo 2: IDs para cruzar com cadastro — sem capturar telefone do pedido
    if (!clienteMap[nome]) clienteMap[nome] = { nome, ultimo: null, datas: [], totalValor: 0, qtd: 0, id_contato: null, cpf_cnpj: null };
    if (dt) {
      if (!clienteMap[nome].ultimo || dt > clienteMap[nome].ultimo) clienteMap[nome].ultimo = dt;
      clienteMap[nome].datas.push(dt.getTime());
    }
    clienteMap[nome].totalValor += val;
    clienteMap[nome].qtd++;
    if (!clienteMap[nome].id_contato) {
      const pid = p.id_contato || p.cliente?.id;
      if (pid) clienteMap[nome].id_contato = String(pid);
    }
    if (!clienteMap[nome].cpf_cnpj && p.cpf_cnpj) clienteMap[nome].cpf_cnpj = p.cpf_cnpj;
  }

  const clientes = sortByRecency(Object.values(clienteMap).map(c => {
    const diasSem = c.ultimo ? Math.round((hoje - c.ultimo) / 86400000) : null;
    let frequencia_dias = null;
    if (c.datas.length >= 2) {
      const s = [...c.datas].sort((a, b) => a - b);
      frequencia_dias = Math.round((s[s.length - 1] - s[0]) / 86400000 / (s.length - 1));
    }

    // Passo 3: Fonte de verdade para telefone = Supabase (celular real via contato.obter.php)
    // Fallback: contatoMap (lista endpoint — pode não ter celular, mas tem fone)
    const sb = sbPhoneMap[normName(c.nome)];
    const ct = lookupContato(contatoMap, c.id_contato, c.cpf_cnpj, c.nome);

    // Passo 4: Monta array normalizado — Supabase primeiro, lista do Tiny como complemento
    const telefones = normalizePhones([
      sb?.celular  || ct.celular,
      sb?.telefone || ct.telefone,
      ct.fone,
    ]);
    const celular  = telefones[0] || '';
    const telefone = telefones[1] || telefones[0] || '';

    return {
      nome:            c.nome,
      ultimo_pedido:   c.ultimo ? formatDateBR(c.ultimo) : '—',
      dias_sem:        diasSem,
      temperatura:     classifyTemp(diasSem),
      qtd_pedidos:     c.qtd,
      ticket_medio:    Math.round((c.qtd > 0 ? c.totalValor / c.qtd : 0) * 100) / 100,
      frequencia_dias: frequencia_dias,
      total:           Math.round(c.totalValor * 100) / 100,
      celular,
      telefone,
      telefones,
    };
  }));

  const { resumo, perfil } = buildCrmResumoEPerfil(clientes);
  return { clientes, resumo, perfil, total: clientes.length, periodo };
}

// ── Trigger sync completo via GitHub Actions (admin) ──────────────────────────
// Dispara o workflow sync-crm.yml no GitHub — roda nos servidores deles (~20 min).
// Requer GITHUB_PAT no .env com permissão actions:write no repo hub-donna.
router.post('/trigger-sync-crm', authenticateToken, authorize('admin'), async (req, res) => {
  const pat   = process.env.GITHUB_PAT;
  const owner = 'elmuriloroberto-svg';
  const repo  = 'hub-donna';

  if (!pat) return res.status(500).json({ ok: false, msg: 'GITHUB_PAT não configurado no servidor.' });

  try {
    const https = require('https');
    const body  = JSON.stringify({ ref: 'main' });
    await new Promise((resolve, reject) => {
      const rq = https.request({
        hostname: 'api.github.com',
        path:     `/repos/${owner}/${repo}/actions/workflows/sync-crm.yml/dispatches`,
        method:   'POST',
        headers: {
          'Authorization': `Bearer ${pat}`,
          'Accept':        'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent':   'donna-hub',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      }, r => {
        let data = '';
        r.on('data', c => data += c);
        r.on('end', () => r.statusCode < 300 ? resolve() : reject(new Error(`GitHub API ${r.statusCode}: ${data}`)));
      });
      rq.on('error', reject);
      rq.write(body);
      rq.end();
    });
    res.json({ ok: true, msg: 'Sync iniciado no GitHub Actions. Dados atualizados em ~20 minutos.' });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

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
    entries: _contatosCache ? Object.keys(_contatosCache.data.byId || {}).length : 0,
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
        console.log(`[tiny] warm-up: ${Object.keys(data.byId).length} contatos carregados.`);
      })
      .catch(e => console.error('[tiny] warm-up contatos falhou:', e.message))
      .finally(() => _building.delete('_contatos'));
  }
}, 5000); // 5s após o boot para não atrasar o startup

module.exports = router;
module.exports._buildCrmTemp = _buildCrmTemp;
