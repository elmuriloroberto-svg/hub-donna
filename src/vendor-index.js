// Vendor da entry `index.html` — Etapa 2 (externalizar CDNs).
// Sub-etapa 2a: Font Awesome local (só CSS; nenhum global JS aqui).
import '@fortawesome/fontawesome-free/css/all.min.css';

// Sub-etapa 2b: Google Fonts via @fontsource (imports POR PESO, não o barrel).
// Pesos/estilos = exatamente os que as tags CDN do index.html pediam:
//   Cormorant Garamond: 400, 600, 700 + italic 400   (index.html:8 e :3965)
//   Outfit:             300, 400, 500, 600, 700       (index.html:8 e :3965)
//   DM Sans:            700, 800                       (index.html:2959)
// (Montserrat NÃO entra aqui — é só do Estúdio de Encartes → vendor-encartes.js)
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/700.css';

import '@fontsource/outfit/300.css';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';

import '@fontsource/dm-sans/700.css';
import '@fontsource/dm-sans/800.css';

// Sub-etapa 2c: PapaParse via npm (era CDN cdnjs 5.4.1 no <head>).
// 1º shim window.* do projeto: reexpõe Papa no escopo global para o monólito
// clássico (index.html:2718, Papa.parse dentro do handler 'change' de epSetupCSV).
// Único uso é em handler de evento — nunca no boot —, então o defer do módulo
// resolve muito antes de qualquer seleção de CSV pelo usuário.
import Papa from 'papaparse';
window.Papa = Papa;
