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

   Todos os três ajustes são REVERSÍVEIS: a decisão é reavaliada quando a
   largura muda. Antes ela era tomada uma única vez, na carga, e nunca
   desfeita — girar um tablet de retrato para paisagem deixava para trás
   wrappers de altura fixa e a dica de rolagem em tabelas que já cabiam.

   Carregar por último, logo antes de </body> — assim ele roda depois de
   qualquer "Chart.defaults.x = y" que a própria página já defina, e ainda
   bem antes do usuário clicar em "Calcular" (quando os gráficos são
   realmente criados).
   ========================================================================== */
(function () {
  'use strict';

  var MOBILE_QUERY = '(max-width: 768px)';

  function isMobile() {
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  function hasChart() {
    return typeof Chart !== 'undefined';
  }

  /* ---- 1. Defaults globais do Chart.js para mobile ----
     Guarda os valores originais na primeira aplicação para conseguir
     devolvê-los quando a tela deixa de ser estreita. Vale só para gráficos
     criados depois da troca — os já desenhados pertencem à página. */
  var savedDefaults = null;

  function applyMobileChartDefaults() {
    if (!hasChart() || savedDefaults) return;
    try {
      savedDefaults = {
        fontSize: Chart.defaults.font.size,
        padding: Chart.defaults.layout && Chart.defaults.layout.padding,
        legendPosition: Chart.defaults.plugins.legend && Chart.defaults.plugins.legend.position,
        legendLabels: Chart.defaults.plugins.legend && Chart.defaults.plugins.legend.labels
          ? Object.assign({}, Chart.defaults.plugins.legend.labels) : null,
        tooltipTitleFont: Chart.defaults.plugins.tooltip && Chart.defaults.plugins.tooltip.titleFont,
        tooltipBodyFont: Chart.defaults.plugins.tooltip && Chart.defaults.plugins.tooltip.bodyFont,
        titleFontSize: Chart.defaults.plugins.title && Chart.defaults.plugins.title.font
          ? Chart.defaults.plugins.title.font.size : undefined,
        scaleTicks: Chart.defaults.scale && Chart.defaults.scale.ticks
          ? Object.assign({}, Chart.defaults.scale.ticks) : null
      };

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

  function restoreChartDefaults() {
    if (!hasChart() || !savedDefaults) return;
    try {
      Chart.defaults.font.size = savedDefaults.fontSize;
      if (Chart.defaults.layout) Chart.defaults.layout.padding = savedDefaults.padding;
      if (Chart.defaults.plugins.legend) {
        Chart.defaults.plugins.legend.position = savedDefaults.legendPosition;
        if (savedDefaults.legendLabels) Chart.defaults.plugins.legend.labels = savedDefaults.legendLabels;
      }
      if (Chart.defaults.plugins.tooltip) {
        Chart.defaults.plugins.tooltip.titleFont = savedDefaults.tooltipTitleFont;
        Chart.defaults.plugins.tooltip.bodyFont = savedDefaults.tooltipBodyFont;
      }
      if (Chart.defaults.plugins.title && Chart.defaults.plugins.title.font && savedDefaults.titleFontSize !== undefined) {
        Chart.defaults.plugins.title.font.size = savedDefaults.titleFontSize;
      }
      if (Chart.defaults.scale && savedDefaults.scaleTicks) Chart.defaults.scale.ticks = savedDefaults.scaleTicks;
    } catch (e) {
      /* silencioso */
    }
    savedDefaults = null;
  }

  /* ---- 1b. Plugin global: sizing robusto no celular ----
     A raiz dos gráficos "esticados"/borrados: com maintainAspectRatio:true
     e aspectRatio < 1, o Chart.js deriva a LARGURA da ALTURA do contêiner;
     se a altura estiver momentaneamente limitada durante o layout, o canvas
     nasce minúsculo (ex.: 107px) e depois é esticado pelo CSS — linhas
     "gordas" e texto gigante. No celular, forçamos maintainAspectRatio:false
     em TODO gráfico (o wrapper .chart-mobile-wrap dá a altura certa) e
     limitamos pontos/linhas a espessuras legíveis em tela estreita.

     O plugin é registrado sempre e decide na CRIAÇÃO de cada gráfico: assim
     a página pode ser aberta em qualquer largura e ainda assim os gráficos
     criados depois recebem o tratamento certo. */
  var pluginRegistered = false;

  function registerMobilePlugin() {
    if (!hasChart() || pluginRegistered || !Chart.register) return;
    try {
      Chart.register({
        id: 'mobileFit',
        beforeInit: function (chart) {
          if (!isMobile()) return;
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
      pluginRegistered = true;
    } catch (e) {
      /* silencioso */
    }
  }

  // Depois de mover um canvas na árvore, o Chart.js precisa remedir o
  // contêiner — sem isso o gráfico fica com o tamanho antigo.
  function resizeChartOf(canvas) {
    if (!hasChart() || typeof Chart.getChart !== 'function') return;
    try {
      var chart = Chart.getChart(canvas);
      if (chart) chart.resize();
    } catch (e) {
      /* silencioso */
    }
  }

  function isExcluded(node) {
    return !!(node.closest('.a4-page') || node.closest('#printContainer') || node.closest('.social-card-container'));
  }

  /* ---- 2. Wrap dos <canvas> com altura definida ----
     Com maintainAspectRatio:false forçado acima, TODO gráfico precisa de um
     contêiner com altura explícita — o wrapper dá essa altura de forma
     previsível em qualquer ferramenta. */
  function wrapCanvasesForMobile() {
    document.querySelectorAll('canvas').forEach(function (cv) {
      if (cv.closest('.chart-mobile-wrap') || isExcluded(cv)) return;
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
      resizeChartOf(cv);
    });
  }

  function unwrapCanvases() {
    document.querySelectorAll('.chart-mobile-wrap').forEach(function (wrap) {
      var parent = wrap.parentNode;
      if (!parent) return;
      while (wrap.firstChild) parent.insertBefore(wrap.firstChild, wrap);
      parent.removeChild(wrap);
    });
    document.querySelectorAll('canvas').forEach(resizeChartOf);
  }

  /* ---- 3. Wrap das <table> largas com rolagem horizontal ---- */
  function checkTableOverflow(wrap) {
    var table = wrap.querySelector('table');
    if (!table) return;
    var previous = wrap.previousElementSibling;
    var hint = previous && previous.classList && previous.classList.contains('mobile-scroll-hint') ? previous : null;

    if (table.scrollWidth > wrap.clientWidth + 4) {
      wrap.classList.add('has-more-x');
      if (!hint) {
        hint = document.createElement('div');
        hint.className = 'mobile-scroll-hint';
        hint.innerHTML = '<span>↔</span><span>Arraste para o lado para ver mais colunas</span>';
        wrap.parentNode.insertBefore(hint, wrap);
      }
    } else {
      // A tabela passou a caber (ex.: tablet girado, ou colunas removidas):
      // some a faixa e a dica em vez de deixá-las pendendo na tela.
      wrap.classList.remove('has-more-x');
      if (hint) hint.remove();
    }
  }

  function wrapTablesForMobile() {
    document.querySelectorAll('table').forEach(function (tbl) {
      if (tbl.closest('.mobile-table-scroll') || isExcluded(tbl)) return;
      var wrap = document.createElement('div');
      wrap.className = 'mobile-table-scroll';
      tbl.parentNode.insertBefore(wrap, tbl);
      wrap.appendChild(tbl);

      checkTableOverflow(wrap);
      // Tabelas de resultado costumam ser populadas dinamicamente depois do
      // clique em "Calcular" — reavalia sempre que o conteúdo mudar. O marcador
      // evita acumular um observador a cada ciclo de desembrulhar/reembrulhar.
      if (tbl.dataset.mobileObserved !== '1') {
        tbl.dataset.mobileObserved = '1';
        new MutationObserver(function () {
          var current = tbl.closest('.mobile-table-scroll');
          if (current) checkTableOverflow(current);
        }).observe(tbl, { childList: true, subtree: true });
      }
    });
  }

  function unwrapTables() {
    document.querySelectorAll('.mobile-table-scroll').forEach(function (wrap) {
      var parent = wrap.parentNode;
      if (!parent) return;
      var previous = wrap.previousElementSibling;
      if (previous && previous.classList && previous.classList.contains('mobile-scroll-hint')) previous.remove();
      while (wrap.firstChild) parent.insertBefore(wrap.firstChild, wrap);
      parent.removeChild(wrap);
    });
  }

  /* ---- Sincronização: aplica ou desfaz conforme a largura atual ---- */
  function syncMobileEnhancements() {
    if (isMobile()) {
      applyMobileChartDefaults();
      wrapCanvasesForMobile();
      wrapTablesForMobile();
      document.querySelectorAll('.mobile-table-scroll').forEach(checkTableOverflow);
    } else {
      restoreChartDefaults();
      unwrapCanvases();
      unwrapTables();
    }
  }

  function initMobileEnhancements() {
    registerMobilePlugin();
    syncMobileEnhancements();

    // Conteúdo novo (abas, resultados, histórico) aparece depois da carga.
    if ('MutationObserver' in window) {
      var pending = false;
      new MutationObserver(function () {
        if (pending) return;
        pending = true;
        requestAnimationFrame(function () {
          pending = false;
          syncMobileEnhancements();
        });
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  // Girar o aparelho ou redimensionar a janela reavalia a decisão.
  var resizeTimer = null;
  function onViewportChange() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(syncMobileEnhancements, 150);
  }
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('orientationchange', onViewportChange);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileEnhancements);
  } else {
    initMobileEnhancements();
  }
})();
