const express    = require('express');
const Anthropic  = require('@anthropic-ai/sdk');
const { getSupabase }          = require('../lib/supabase');
const { authenticateToken }    = require('../middleware/auth');
const { sanitizeStr }          = require('../middleware/security');

const router = express.Router();

const SYSTEM_RULES = `
Você é a Donna IA, assistente virtual da Donna Unha — distribuidora de cosméticos para unhas em Brasília.

REGRAS DO NEGÓCIO:
- Linha Impala: Esmaltes Básicos (8ml, 200+ cores, custo R$4-8), Premium (10ml, R$8-15), Base Coat e Top Coat (R$6-10). Fórmula livre de tolueno.
- Cálculo de preços: Preço = Custo ÷ (1 - Margem% - 28,18%). Varejo: margem ~35%. Atacarejo: ~20%, volume mínimo 6 unidades.
- Política de troca: prazo 7 dias, produto lacrado, com NF. Gerente autoriza. Registrar no Tiny como devolução.
- Régua de cobrança: D-5 WhatsApp, D-2 ligar, D+1 contato, D+3 bloquear pedidos, D+7 cobrança formal.
- Etiquetas: 30×17mm, 6 colunas × 16 linhas = 96 por folha.
- Tiny ERP integrado. Fórmula de reposição: (Venda Mensal × 2) − Estoque.

Responda em português, de forma direta e útil. Seja simpática mas profissional.
Use os Processos abaixo como fonte principal de informação.
Se não souber, diga que não tem essa informação e sugira consultar o gerente.
Nunca invente preços ou políticas que não estejam documentados.
`.trim();

// POST /api/chat
router.post('/', authenticateToken, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ ok: false, msg: 'Donna IA não configurada. Adicione ANTHROPIC_API_KEY no .env.' });
  }

  try {
    const message = sanitizeStr(req.body.message, 500);
    if (!message) return res.status(400).json({ ok: false, msg: 'Mensagem vazia' });

    // Last 4 turns of history (8 messages)
    const rawHistory = Array.isArray(req.body.history) ? req.body.history.slice(-8) : [];
    const history = rawHistory
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: sanitizeStr(String(m.content), 800) }));

    // RAG: fetch all processos to build context
    const sb = getSupabase();
    const { data: processos } = await sb
      .from('processos')
      .select('titulo, categoria, conteudo')
      .order('titulo');

    let processosCtx = '';
    if (processos && processos.length > 0) {
      processosCtx =
        '\n\nPROCESSOS DA DONNA UNHA:\n\n' +
        processos
          .map((p) => `## ${p.titulo}${p.categoria ? ` (${p.categoria})` : ''}\n${p.conteudo}`)
          .join('\n\n---\n\n');
    }

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system:     SYSTEM_RULES + processosCtx,
      messages:   [...history, { role: 'user', content: message }],
    });

    const reply = response.content?.[0]?.text || 'Não consegui gerar uma resposta.';
    res.json({ ok: true, reply });
  } catch (err) {
    console.error('[chat POST]', err.message);
    res.status(500).json({ ok: false, msg: 'Erro ao consultar a IA: ' + err.message });
  }
});

module.exports = router;
