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

  /* ---- 1b. Plugin global: sizing robusto no celular ----
     A raiz dos gráficos "esticados"/borrados: com maintainAspectRatio:true
     e aspectRatio < 1, o Chart.js deriva a LARGURA da ALTURA do contêiner;
     se a altura estiver momentaneamente limitada durante o layout, o canvas
     nasce minúsculo (ex.: 107px) e depois é esticado pelo CSS — linhas
     "gordas" e texto gigante. No celular, forçamos maintainAspectRatio:false
     em TODO gráfico (o wrapper .chart-mobile-wrap dá a altura certa) e
     limitamos pontos/linhas a espessuras legíveis em tela estreita. */
  function registerMobilePlugin() {
    if (typeof Chart === 'undefined' || !isMobile() || !Chart.register) return;
    try {
      Chart.register({
        id: 'mobileFit',
        beforeInit: function (chart) {
          var o = chart.options || {};
          o.maintainAspectRatio = false;
          delete o.aspectRatio;
          // Títulos de eixo Y comem ~25px de largura cada (e há gráficos com
          // dois eixos). A legenda já identifica as séries.
          if (o.scales) {
            Object.keys(o.scales).forEach(function (k) {
              var s = o.scales[k];
              if (s && s.title && k.charAt(0) === 'y') s.title.display = false;
            });
          }
          // Pontos e linhas na espessura de desktop viram "cordas" num plot
          // de ~300px — limita a valores legíveis.
          var ds = (chart.config && chart.config.data && chart.config.data.datasets) || [];
          ds.forEach(function (d) {
            var isLine = d.type === 'line' || (!d.type && chart.config.type === 'line');
            if (!isLine) return;
            if (typeof d.pointRadius === 'number' && d.pointRadius > 3) d.pointRadius = 3;
            if (typeof d.pointHoverRadius === 'number' && d.pointHoverRadius > 4) d.pointHoverRadius = 4;
            if (typeof d.pointBorderWidth === 'number' && d.pointBorderWidth > 1.5) d.pointBorderWidth = 1.5;
            if (typeof d.borderWidth === 'number' && d.borderWidth > 2.5) d.borderWidth = 2.5;
          });
        }
      });
    } catch (e) {
      /* silencioso */
    }
  }

  /* ---- 2. Wrap dos <canvas> com altura definida ----
     Com maintainAspectRatio:false forçado acima, TODO gráfico precisa de um
     contêiner com altura explícita — o wrapper dá essa altura de forma
     previsível em qualquer ferramenta. */
  function wrapCanvasesForMobile() {
    if (!isMobile()) return;
    document.querySelectorAll('canvas').forEach(function (cv) {
      if (cv.closest('.chart-mobile-wrap') || cv.closest('.a4-page') || cv.closest('#printContainer')) return;
      // Se o contêiner do canvas já tem altura explícita (ex.: Tailwind h-64,
      // h-[300px] ou style="height:..."), a página já resolveu o sizing —
      // embrulhar de novo só criaria conflito/estouro.
      var par = cv.parentElement;
      if (par) {
        var cls = String(par.className || '');
        if (/(^|\s)h-(\d+|\[[^\]]+\])(\s|$)/.test(cls) || (par.style && par.style.height)) return;
      }
      var wrap = document.createElement('div');
      wrap.className = 'chart-mobile-wrap';
      var tornado = /tornado|sensibilidade|custoreceita/i.test(cv.id);
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
    registerMobilePlugin();
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
