const express  = require('express');
const https    = require('https');
const { authenticateToken, authorize } = require('../middleware/auth');
const { sanitizeStr, sanitizeInt } = require('../middleware/security');

const router = express.Router();

const TINY_BASE  = 'https://api.tiny.com.br/api2';
const sleep      = ms => new Promise(r => setTimeout(r, ms));

const cache = new Map();
const CACHE_DASH     = 10 * 60 * 1000;
const CACHE_CRM      = 20 * 60 * 1000;
const CACHE_GIRO     =  2 * 60 * 60 * 1000;
const CACHE_CLI      =  5 * 60 * 1000;
const CACHE_HIST     =  4 * 60 * 60 * 1000;
const CACHE_CONTATOS = 60 * 60 * 1000;

let _contatosCache = null;
const normName = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ── Helpers ──────────────────────────────────────────────────────────────────

function tinyGet(endpoint, params = {}) {
  const token = process.env.TINY_TOKEN;
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({ token, formato: 'json', ...params }).toString();
    https.get(`${TINY_BASE}/${endpoint}?${qs}`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Resposta inválida da API Tiny')); } });
    }).on('error', reject);
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

// Carrega TODOS os contatos do Tiny e monta mapa nome→{celular,telefone}
// Resultado fica em cache por 1h — reutilizado por todas as chamadas CRM
async function loadContatos() {
  if (_contatosCache && Date.now() - _contatosCache.ts < CACHE_CONTATOS) {
    return _contatosCache.data;
  }
  const map = {};
  for (let pag = 1; pag <= 200; pag++) {
    const r = await tinyGet('contatos.pesquisa.php', { pagina: pag });
    if (r?.retorno?.status !== 'OK') break;
    for (const item of (r.retorno.contatos || [])) {
      const c = item.contato;
      const cel = (c.celular || '').trim();
      const tel = (c.fone || c.telefone || '').trim();
      if (!cel && !tel) continue;
      const key = normName(c.nome);
      if (key) map[key] = { celular: cel, telefone: tel };
    }
    if (pag >= (r.retorno.numero_paginas || 1)) break;
    await sleep(150);
  }
  _contatosCache = { ts: Date.now(), data: map };
  return map;
}

// ── DASHBOARD ────────────────────────────────────────────────────────────────

router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const mes     = /^\d{4}-\d{2}$/.test(req.query.mes) ? req.query.mes : new Date().toISOString().slice(0,7);
    // Vendedores só veem seus próprios dados
    const vendedor = req.user.role === 'admin'
      ? sanitizeStr(req.query.vendedor || '', 100)
      : req.user.login;

    const key = `dash_${mes}_${vendedor || 'all'}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_DASH) return res.json({ ok: true, ...cached.data });

    const [ano, mesNum] = mes.split('-');
    const diasNoMes = new Date(parseInt(ano), parseInt(mesNum), 0).getDate();
    const todos = await fetchAllOrders({ dataInicial: `01/${mesNum}/${ano}`, dataFinal: `${diasNoMes}/${mesNum}/${ano}` }, 10);
    const filtrado = vendedor ? todos.filter(p => (p.nome_vendedor||'').toLowerCase().includes(vendedor.toLowerCase())) : todos;

    const total = filtrado.reduce((s,p) => s+(parseFloat(p.valor)||0), 0);
    const qtd   = filtrado.length;
    const porDia = {};
    for (const p of filtrado) { const d=p.data_pedido||''; porDia[d]=(porDia[d]||0)+(parseFloat(p.valor)||0); }
    const porVendedor = {};
    for (const p of todos) {
      const v=p.nome_vendedor||'Sem vendedor';
      if (!porVendedor[v]) porVendedor[v]={total:0,qtd:0};
      porVendedor[v].total+=parseFloat(p.valor)||0;
      porVendedor[v].qtd++;
    }
    const data = {
      total, qtd, ticket: qtd>0?total/qtd:0,
      total_geral: todos.reduce((s,p)=>s+(parseFloat(p.valor)||0),0),
      por_dia: Object.entries(porDia).map(([dia,v])=>({dia,total:v})).sort((a,b)=>(parseDateBR(a.dia)||0)-(parseDateBR(b.dia)||0)),
      por_vendedor: Object.entries(porVendedor).map(([nome,v])=>({nome,...v})).sort((a,b)=>b.total-a.total),
      vendedores: Object.keys(porVendedor),
    };
    cache.set(key, { ts: Date.now(), data });
    res.json({ ok: true, ...data });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── CRM ──────────────────────────────────────────────────────────────────────

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

// ── GIRO ─────────────────────────────────────────────────────────────────────

router.get('/giro', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const dias = Math.min(Math.max(parseInt(req.query.dias)||30, 1), 180);
    const key = `giro_${dias}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_GIRO) return res.json({ ok: true, ...cached.data });

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
      await sleep(280);
    }
    const fator=sample.length>0&&listaOrdens.length>sample.length?listaOrdens.length/sample.length:1;
    const produtos=Object.values(productMap).map(p=>({nome:p.nome,sku:p.sku,qtd_periodo:Math.round(p.qtd*fator),qtd_mes:Math.round(p.qtd*fator/dias*30),receita_mes:Math.round(p.receita*fator/dias*30)})).filter(p=>p.qtd_mes>0).sort((a,b)=>b.qtd_mes-a.qtd_mes).slice(0,60);
    const data={produtos,dias_analisados:dias,pedidos_analisados:sample.length,total_pedidos:listaOrdens.length};
    cache.set(key,{ts:Date.now(),data});
    res.json({ ok: true, ...data });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── BUSCA GIRO ───────────────────────────────────────────────────────────────

router.get('/busca-giro', authenticateToken, async (req, res) => {
  try {
    const q    = sanitizeStr(req.query.q || '', 100).trim();
    const dias = Math.min(Math.max(parseInt(req.query.dias)||60, 1), 180);
    if (!q) return res.status(400).json({ ok: false, msg: 'Parâmetro q obrigatório' });

    const cacheKey = `busca_${q.toLowerCase()}_${dias}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_GIRO) return res.json({ ok: true, ...cached.data });

    const catProdutos = [];
    for (let pag=1;pag<=5;pag++) {
      const r=await tinyGet('produtos.pesquisa.php',{pesquisa:q,pagina:pag});
      if(r?.retorno?.status!=='OK')break;
      catProdutos.push(...(r.retorno.produtos||[]).map(p=>p.produto));
      if(pag>=(r.retorno.numero_paginas||1))break;
      await sleep(280);
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
      await sleep(280);
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

// ── PEDIDOS INTELIGENTES (ABC) ────────────────────────────────────────────────

router.get('/pedidos-inteligentes', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const q    = sanitizeStr(req.query.q || '', 100).trim();
    const dias = Math.min(Math.max(parseInt(req.query.dias) || 60, 7), 180);
    if (!q) return res.status(400).json({ ok: false, msg: 'Parâmetro q obrigatório' });

    const cacheKey = `pi_${q.toLowerCase()}_${dias}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_GIRO) return res.json({ ok: true, ...cached.data });

    // 1. Catálogo com paginação completa
    const catProdutos = [];
    for (let pag = 1; ; pag++) {
      const r = await tinyGet('produtos.pesquisa.php', { pesquisa: q, pagina: pag });
      if (r?.retorno?.status !== 'OK') break;
      catProdutos.push(...(r.retorno.produtos || []).map(p => p.produto));
      if (pag >= (r.retorno.numero_paginas || 1)) break;
      await sleep(300);
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

    // 5. Curva ABC por receita acumulada (80/95/100)
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

    produtos.sort((a, b) => ({ A: 0, B: 1, C: 2 }[a.curva] - { A: 0, B: 1, C: 2 }[b.curva]) || (b.qtd_mes - a.qtd_mes));

    const resumo_abc = { A: 0, B: 0, C: 0 };
    for (const p of produtos) resumo_abc[p.curva]++;

    const data = { produtos, total_catalogo: catProdutos.length, dias_analisados: dias, pedidos_analisados: sample.length, total_pedidos: listaOrdens.length, resumo_abc };
    cache.set(cacheKey, { ts: Date.now(), data });
    res.json({ ok: true, ...data });
  } catch (e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── CLIENTES ─────────────────────────────────────────────────────────────────

router.get('/clientes', authenticateToken, async (req, res) => {
  try {
    const maxPags = Math.min(parseInt(req.query.paginas||'5'), 20);
    const key = `cli_${maxPags}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_CLI) return res.json({ ok: true, total: cached.data.length, data: cached.data });

    const todos = [];
    for (let pag=1;pag<=maxPags;pag++) {
      const r=await tinyGet('contatos.pesquisa.php',{pagina:pag});
      if(r?.retorno?.status!=='OK')break;
      todos.push(...(r.retorno.contatos||[]).map(c=>c.contato));
      if(pag>=(r.retorno.numero_paginas||1))break;
      await sleep(280);
    }
    const data=todos.map(c=>({id_tiny:c.id,nome:(c.nome||'').trim(),fantasia:(c.fantasia||'').trim(),celular:c.celular||c.fone||'',email:c.email||'',cidade:c.cidade||'',uf:c.uf||'',situacao:c.situacao==='Ativo'||c.situacao==='A'?'ativo':'inativo',data_criacao:c.data_criacao||''})).filter(c=>c.nome);
    cache.set(key,{ts:Date.now(),data});
    res.json({ ok: true, total: data.length, data });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

router.get('/clientes-busca', authenticateToken, async (req, res) => {
  try {
    const q = sanitizeStr(req.query.q||'', 100).trim();
    const r = await tinyGet('contatos.pesquisa.php',{pesquisa:q||' ',pagina:1});
    const clientes=(r?.retorno?.contatos||[]).map(c=>c.contato).map(c=>({id:c.id||'',nome:c.nome||'',fantasia:c.fantasia||'',fone:c.fone||'',celular:c.celular||'',email:c.email||'',cpf_cnpj:c.cpf_cnpj||''}));
    res.json({ ok: true, clientes });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

router.get('/fornecedores', authenticateToken, async (req, res) => {
  try {
    const q = sanitizeStr(req.query.q||'', 100).trim();
    const r = await tinyGet('contatos.pesquisa.php',{pesquisa:q||' ',pagina:1});
    const fornecedores=(r?.retorno?.contatos||[]).map(c=>c.contato).map(c=>({id:c.id||'',nome:c.nome||'',fantasia:c.fantasia||'',cnpj:c.cpf_cnpj||''}));
    res.json({ ok: true, fornecedores });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── HISTÓRICO CLIENTES ───────────────────────────────────────────────────────

router.get('/historico-clientes', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const anos = Math.min(Math.max(parseFloat(req.query.anos||'5'), 0.5), 10);
    const key = `hist_${anos}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_HIST) return res.json({ ok: true, total: cached.data.length, gerado_em: new Date().toISOString(), data: cached.data });

    const de = new Date(); de.setFullYear(de.getFullYear()-anos);
    const todos = await fetchAllOrders({ dataInicial: formatDateBR(de) }, 300);
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const clienteMap={};
    for(const p of todos){
      const nome=(p.nome||'').trim();
      if(!nome||nome.toLowerCase()==='consumidor final')continue;
      const dt=parseDateBR(p.data_pedido);
      if(!clienteMap[nome])clienteMap[nome]={nome,ultimo:null,qtd:0,total:0};
      if(dt&&(!clienteMap[nome].ultimo||dt>clienteMap[nome].ultimo))clienteMap[nome].ultimo=dt;
      clienteMap[nome].qtd++;clienteMap[nome].total+=parseFloat(p.valor)||0;
    }
    const data=Object.values(clienteMap).map(c=>({nome:c.nome,ultimo_pedido:c.ultimo?c.ultimo.toISOString().slice(0,10):null,dias_sem:c.ultimo?Math.round((hoje-c.ultimo)/86400000):null,qtd_pedidos:c.qtd,valor_total:Math.round(c.total*100)/100})).sort((a,b)=>(a.dias_sem??99999)-(b.dias_sem??99999));
    cache.set(key,{ts:Date.now(),data});
    res.json({ ok: true, total: data.length, gerado_em: new Date().toISOString(), data });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── VENDAS ───────────────────────────────────────────────────────────────────

router.get('/vendas', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  try {
    const de      = /^\d{2}\/\d{2}\/\d{4}$/.test(req.query.de) ? req.query.de : '';
    const maxPags = Math.min(parseInt(req.query.paginas||'3'), 10);
    const params  = de ? { dataInicial: de } : {};
    const todos   = await fetchAllOrders(params, maxPags);
    const total   = todos.reduce((s,p)=>s+(parseFloat(p.valor)||0),0);
    res.json({ ok: true, total, qtd_pedidos: todos.length, pedidos_recentes: todos.slice(0,50).map(p=>({id:p.id,numero:p.numero,data:p.data_pedido,cliente:p.nome||'',vendedor:p.nome_vendedor||'',valor:parseFloat(p.valor)||0,situacao:p.situacao||''})) });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── CRM TEMPERATURA ──────────────────────────────────────────────────────────

// Converte "YYYY-MM-DD" → "DD/MM/YYYY" (usado para reutilizar cache do hist)
function isoToBR(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function buildCrmResumoEPerfil(clientes) {
  const resumo = { quente: 0, morno: 0, frio: 0, congelado: 0 };
  clientes.forEach(c => resumo[c.temperatura]++);
  const ativos     = clientes.filter(c => c.dias_sem !== null);
  const comFreq    = ativos.filter(c => c.freq_dias !== null);
  const tkGeral    = ativos.length ? ativos.reduce((s, c) => s + c.ticket_medio, 0) / ativos.length : 0;
  const freqGeral  = comFreq.length ? Math.round(comFreq.reduce((s, c) => s + c.freq_dias, 0) / comFreq.length) : null;
  const comWA      = clientes.filter(c => c.celular || c.telefone).length;
  const top        = [...ativos].sort((a, b) => b.total - a.total)[0] || null;
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

router.get('/crm-temperatura', authenticateToken, authorize('admin', 'gerente'), async (req, res) => {
  // periodo: 30 | 90 | 120 | 0 (geral = sem limite)
  const periodo = Math.max(parseInt(req.query.periodo ?? '90'), 0);
  const KEY = `crm_temp_${periodo}`;
  try {
    const cached = cache.get(KEY);
    if (cached && Date.now() - cached.ts < CACHE_CRM) return res.json({ ok: true, ...cached.data });

    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

    // ── Caminho rápido para Geral: reutiliza cache do historico-clientes ──────
    if (periodo === 0) {
      const histCached = cache.get('hist_5');
      if (histCached && Date.now() - histCached.ts < CACHE_HIST) {
        const contatoMap = await loadContatos();
        const clientes = histCached.data.map(h => {
          const diasSem = h.dias_sem;
          let temperatura;
          if (diasSem === null || diasSem > 45) temperatura = 'congelado';
          else if (diasSem <= 15)              temperatura = 'quente';
          else if (diasSem <= 30)              temperatura = 'morno';
          else                                 temperatura = 'frio';
          const nk = normName(h.nome);
          const ct = contatoMap[nk] || { celular: '', telefone: '' };
          return {
            nome:          h.nome,
            ultimo_pedido: isoToBR(h.ultimo_pedido),
            dias_sem:      diasSem,
            temperatura,
            qtd_pedidos:   h.qtd_pedidos,
            ticket_medio:  h.qtd_pedidos > 0 ? Math.round(h.valor_total / h.qtd_pedidos * 100) / 100 : 0,
            freq_dias:     null,
            total:         h.valor_total,
            celular:       ct.celular,
            telefone:      ct.telefone,
          };
        }).sort((a, b) => (a.dias_sem ?? 9999) - (b.dias_sem ?? 9999));

        const { resumo, perfil } = buildCrmResumoEPerfil(clientes);
        const data = { clientes, resumo, perfil, total: clientes.length, periodo };
        cache.set(KEY, { ts: Date.now(), data });
        return res.json({ ok: true, ...data });
      }
    }

    // ── Caminho padrão: busca pedidos + contatos em paralelo ─────────────────
    // Limite de páginas proporcional ao período (20 pedidos/página × N páginas)
    const maxPags = periodo === 0 ? 100 : periodo <= 30 ? 20 : periodo <= 90 ? 40 : 50;
    const params  = periodo > 0
      ? { dataInicial: formatDateBR(new Date(Date.now() - periodo * 86400000)) }
      : { dataInicial: '01/01/2020' };

    const [orders, contatoMap] = await Promise.all([
      fetchAllOrders(params, maxPags),
      loadContatos(),
    ]);

    // Agrupa por cliente
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

    const clientes = Object.values(clienteMap).map(c => {
      const diasSem = c.ultimo ? Math.round((hoje - c.ultimo) / 86400000) : null;
      let temperatura;
      if (diasSem === null || diasSem > 45) temperatura = 'congelado';
      else if (diasSem <= 15)              temperatura = 'quente';
      else if (diasSem <= 30)              temperatura = 'morno';
      else                                 temperatura = 'frio';

      let freqDias = null;
      if (c.datas.length >= 2) {
        const sorted = [...c.datas].sort((a, b) => a - b);
        let gap = 0;
        for (let i = 1; i < sorted.length; i++) gap += (sorted[i] - sorted[i - 1]) / 86400000;
        freqDias = Math.round(gap / (sorted.length - 1));
      }

      const nk = normName(c.nome);
      const ct = contatoMap[nk] || { celular: '', telefone: '' };
      return {
        nome:          c.nome,
        ultimo_pedido: c.ultimo ? formatDateBR(c.ultimo) : '—',
        dias_sem:      diasSem,
        temperatura,
        qtd_pedidos:   c.qtd,
        ticket_medio:  Math.round((c.qtd > 0 ? c.totalValor / c.qtd : 0) * 100) / 100,
        freq_dias:     freqDias,
        total:         Math.round(c.totalValor * 100) / 100,
        celular:       ct.celular,
        telefone:      ct.telefone,
      };
    }).sort((a, b) => (a.dias_sem ?? 9999) - (b.dias_sem ?? 9999));

    const { resumo, perfil } = buildCrmResumoEPerfil(clientes);
    const data = { clientes, resumo, perfil, total: clientes.length, periodo };
    cache.set(KEY, { ts: Date.now(), data });
    res.json({ ok: true, ...data });
  } catch (e) {
    const status = /401|token|autoriza/i.test(e.message) ? 401 : 500;
    res.status(status).json({ ok: false, msg: e.message });
  }
});

module.exports = router;
