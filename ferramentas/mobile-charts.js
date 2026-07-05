/* ==========================================================================
   mobile-charts.js — Ajustes de mobile que exigem JavaScript
   Prof. Ricardo C. Brumatti — FAMEZ/UFMS

   Complementa mobile.css. Faz três coisas, só em telas ≤768px, e só se
   aplica a leitura/exibição — nunca toca em cálculos ou dados:

   1. Reduz fontes e reorganiza legendas dos gráficos Chart.js (isso só dá
      pra fazer via JS porque o texto é desenhado dentro do <canvas>, CSS
      não alcança).
   2. Envolve cada <canvas> num contêiner com altura definida, para que
      gráficos com maintainAspectRatio:false sempre apareçam num tamanho
      prático (sem isso, ou o gráfico não aparece, ou fica gigante/cortado).
   3. Envolve tabelas largas numa faixa com rolagem horizontal + uma dica
      "arraste para o lado", em vez de espremer o texto até ficar ilegível.

   Carregar por último, logo antes de </body> — assim ele roda depois de
   qualquer "Chart.defaults.x = y" que a própria página já defina, e ainda
   bem antes do usuário clicar em "Calcular" (quando os gráficos são
   realmente criados).
   ========================================================================== */
(function () {
  'use strict';

  function isMobile() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

  /* ---- 1. Defaults globais do Chart.js para mobile ---- */
  function applyMobileChartDefaults() {
    if (typeof Chart === 'undefined' || !isMobile()) return;

    try {
      Chart.defaults.font.size = 10;
      Chart.defaults.layout = Chart.defaults.layout || {};
      Chart.defaults.layout.padding = 4;

      Chart.defaults.plugins = Chart.defaults.plugins || {};

      Chart.defaults.plugins.legend = Chart.defaults.plugins.legend || {};
      Chart.defaults.plugins.legend.position = 'bottom';
      Chart.defaults.plugins.legend.labels = Chart.defaults.plugins.legend.labels || {};
      Chart.defaults.plugins.legend.labels.boxWidth = 10;
      Chart.defaults.plugins.legend.labels.padding = 8;
      Chart.defaults.plugins.legend.labels.font = { size: 10 };

      Chart.defaults.plugins.tooltip = Chart.defaults.plugins.tooltip || {};
      Chart.defaults.plugins.tooltip.titleFont = { size: 11 };
      Chart.defaults.plugins.tooltip.bodyFont = { size: 11 };

      Chart.defaults.plugins.title = Chart.defaults.plugins.title || {};
      if (Chart.defaults.plugins.title.font && Chart.defaults.plugins.title.font.size > 14) {
        Chart.defaults.plugins.title.font.size = 14;
      }

      Chart.defaults.scale = Chart.defaults.scale || {};
      Chart.defaults.scale.ticks = Chart.defaults.scale.ticks || {};
      Chart.defaults.scale.ticks.font = { size: 9 };
      Chart.defaults.scale.ticks.maxRotation = 60;
      Chart.defaults.scale.ticks.autoSkip = true;
      Chart.defaults.scale.ticks.autoSkipPadding = 6;
    } catch (e) {
      /* silencioso — não deixa um Chart.js de versão diferente quebrar a página */
    }
  }

  /* ---- 2. Wrap dos <canvas> com altura definida ----
     Só faz sentido para gráficos com maintainAspectRatio:false (sem isso,
     Chart.js não sabe que altura usar). Algumas páginas (ex.: confinamento-
     custos.html) já controlam a proporção de cada gráfico via
     maintainAspectRatio:true + aspectRatio próprio — forçar uma altura fixa
     nelas colide com esse cálculo e distorce o desenho (linhas "esticadas").
     Essas páginas marcam <body data-charts-self-sized="true"> para pular
     este passo. */
  function wrapCanvasesForMobile() {
    if (!isMobile()) return;
    if (document.body && document.body.hasAttribute('data-charts-self-sized')) return;
    document.querySelectorAll('canvas').forEach(function (cv) {
      if (cv.closest('.chart-mobile-wrap') || cv.closest('.a4-page') || cv.closest('#printContainer')) return;
      var wrap = document.createElement('div');
      wrap.className = 'chart-mobile-wrap';
      var tornado = /tornado/i.test(cv.id) || /sensibilidade/i.test(cv.id);
      if (tornado) wrap.className += ' tall';
      cv.parentNode.insertBefore(wrap, cv);
      wrap.appendChild(cv);
    });
  }

  /* ---- 3. Wrap das <table> largas com rolagem horizontal ---- */
  function wrapTablesForMobile() {
    if (!isMobile()) return;
    document.querySelectorAll('table').forEach(function (tbl) {
      if (tbl.closest('.mobile-table-scroll') || tbl.closest('.a4-page') || tbl.closest('#printContainer')) return;
      var wrap = document.createElement('div');
      wrap.className = 'mobile-table-scroll';
      tbl.parentNode.insertBefore(wrap, tbl);
      wrap.appendChild(tbl);

      // Só mostra a dica/gradiente se a tabela realmente for mais larga que a tela
      var check = function () {
        if (tbl.scrollWidth > wrap.clientWidth + 4) {
          wrap.classList.add('has-more-x');
          if (!wrap.previousElementSibling || !wrap.previousElementSibling.classList || !wrap.previousElementSibling.classList.contains('mobile-scroll-hint')) {
            var hint = document.createElement('div');
            hint.className = 'mobile-scroll-hint';
            hint.innerHTML = '<span>\u2194</span><span>Arraste para o lado para ver mais colunas</span>';
            wrap.parentNode.insertBefore(hint, wrap);
          }
        } else {
          wrap.classList.remove('has-more-x');
        }
      };
      check();
      window.addEventListener('resize', check);
      // Tabelas de resultado costumam ser populadas dinamicamente depois do
      // clique em "Calcular" — reavalia sempre que o conteúdo mudar.
      new MutationObserver(check).observe(tbl, { childList: true, subtree: true });
    });
  }

  function initMobileEnhancements() {
    applyMobileChartDefaults();
    wrapCanvasesForMobile();
    wrapTablesForMobile();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileEnhancements);
  } else {
    initMobileEnhancements();
  }

  // Novos elementos podem ser inseridos dinamicamente (abas, resultados,
  // histórico) depois da carga inicial — observa o body e reaplica o wrap
  // de tabelas/canvas para o que for adicionado depois.
  if (isMobile() && 'MutationObserver' in window) {
    var bodyObserver = new MutationObserver(function () {
      wrapCanvasesForMobile();
      wrapTablesForMobile();
    });
    document.addEventListener('DOMContentLoaded', function () {
      bodyObserver.observe(document.body, { childList: true, subtree: true });
    });
  }
})();
