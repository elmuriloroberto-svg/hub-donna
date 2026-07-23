// Vendor da entry `estudio-encartes.html` — Etapa 2 (externalizar CDNs).
// Sub-etapa 2b: Montserrat via @fontsource (imports POR PESO).
// Pesos = exatamente os que o @import do estúdio pedia (estudio-encartes.html:8):
//   Montserrat: 300, 500, 700, 900
import '@fontsource/montserrat/300.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/montserrat/900.css';

// Sub-etapa 2d: html2canvas via npm (era CDN jsdelivr 1.4.1 no <head>).
// Shim window.* (mesmo padrão do window.Papa da 2c): reexpõe html2canvas no
// escopo global para o script clássico do estúdio (estudio-encartes.html:699,
// dentro do handler 'click' de btnExport; guard typeof em :671). Uso só em
// handler — nunca no boot —, então o defer do módulo resolve antes do export.
// Versão TRAVADA em 1.4.1: os workarounds de CSS do estúdio (object-fit e
// background-clip:text, ~linhas 125/596/663) dependem do comportamento do 1.4.1.
import html2canvas from 'html2canvas';
window.html2canvas = html2canvas;
