#!/usr/bin/env node
/*
 * Teste de regressão do Manejo de Pastagens (ferramentas/pastagens-custo.html, motor 3.2.0).
 *
 * Extrai o motor de cálculo e os cenários padrão do próprio HTML (sem navegador) e confere:
 *   1. recursos do motor 3.2.0 (GMD sazonal, reposição, lotes por ano, financeiro, utilização, validações);
 *   2. critérios de aceite de cada cenário padrão contra o Beef Report (planilha Dados_Custos_Bovinos, IPCA x1,0363);
 *   3. opcionalmente, compatibilidade com um HTML de referência (ex.: motor 3.1.0): --ref=caminho.html
 *
 * Uso: node scripts/testar_pastagens.js [--ref=caminho/do/html-antigo.html]
 * Sai com código 1 se qualquer verificação falhar.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, '..', 'ferramentas', 'pastagens-custo.html');
let falhas = 0, total = 0;
const ok = (cond, msg) => { total++; if (!cond) falhas++; console.log((cond ? 'OK     ' : 'FALHA  ') + msg); };

function carregar(arquivo) {
  const s = fs.readFileSync(arquivo, 'utf8');
  const bloco = (ini, fim) => { const a = s.indexOf(ini); if (a < 0) return ''; const b = s.indexOf(fim, a); return s.slice(a, b + fim.length); };
  const fimMotor = "})(typeof window!=='undefined'?window:globalThis);";
  const fimPre = "})(typeof window !== 'undefined' ? window : globalThis);";
  const motor = bloco("(function (root) {\n  'use strict';\n\n  const VERSION", fimMotor);
  const pre = bloco("(function (root) {\n  'use strict';\n  // Fonte dos custos", fimPre);
  const g = {};
  new Function('globalThis', motor + '\n' + pre)(g);
  return { E: g.PastagensEngine, P: g.PastagensPresets };
}

const { E, P } = carregar(HTML);
console.log(`Motor ${E.VERSION}, ${P.lista.length} cenários padrão\n`);

// ---------- 1. Recursos do motor ----------
const base = { area: 100, cultivar: 'Marandu', situacaoPastagem: 'existente', metodoPastejo: 'continuo', estrategia: 'convencional', integracao: 'pastagem', conservacao: 'nao', mesEntrada: 10, acumuloAguas: 60, acumuloSeca: 13, massaMSDisponivel: 1500, perdasPastejo: 35, ofMin: 4, ofMax: 10, categoria: 'novilho', cabecas: 240, pesoInicial: 240, permanencia: 365, gmd: .62, consumoMS: 2.3, rcInicial: 50, rcFinal: 52, mortalidadePct: 1, modoEconomico: 'incremental', baseCustos: 'anual', precoArroba: 345, taxaJuros: 8, incluirCarbono: 'nao', custoSuplementacao_ha: 150, custoSanidade_ha: 60, custoDepreciacao_ha: 80, custoProLabore_ha: 100 };
const r0 = E.calculateEconomics(base);

ok(E.normalizeInputs({}).precoArroba === 345, 'preço padrão do motor é R$ 345,00/@');
const g = E.ganhoCicloKg({ ...E.normalizeInputs(base), gmdAguas: .8, gmdSeca: .2 });
ok(Math.abs(g - (182 * .8 + 183 * .2)) < 1e-9, 'GMD sazonal: ganho de 365 dias = 182 x 0,8 + 183 x 0,2');
const rep = E.calculateEconomics({ ...base, reposicaoPorArroba: 140 });
ok(Math.abs(rep.custoAnimalEntrada_total - 140 * rep.producaoTotal_at) < 1e-6, 'reposição = R$/@ x @ produzidas');
ok(Math.abs((r0.margemLiquida_total - rep.margemLiquida_total) - 140 * rep.producaoTotal_at) < 1e-6, 'a margem cai exatamente o valor da reposição');
const nova = { ...base, situacaoPastagem: 'nova' };
const f0 = E.calculateEconomics(nova), f1 = E.calculateEconomics({ ...nova, reposicaoPorArroba: 140 });
ok(f0.vpl === null && f0.tir === null && !f0.financeiroDisponivel, 'incremental sem reposição: VPL e TIR não são calculados');
ok(f1.vpl !== null && f1.capitalGiro_total > 0, 'com reposição: VPL e TIR incluem o capital de giro do rebanho');
const t = E.calculateEconomics({ ...base, permanencia: 120, mesEntrada: 11 });
ok(t.cyclesPerYear === 1 && Math.abs(t.fracaoOciosa - (1 - 120 / 365)) < 1e-9 && t.margemAnual_ha < t.margemLiquida_ha, 'ciclo de 120 dias vale 1 lote/ano e a margem anual desconta a área fora do lote');
ok(E.validateInputs({ ...base, permanencia: 200, ciclosAno: 3 }).errors.some((e) => e.field === 'ciclosAno'), 'validação: lotes x permanência acima de 365 dias');
ok(E.validateInputs({ ...base, integracao: 'ilp', usoAreaAgricola: 'sucessao', permanencia: 300 }).errors.some((e) => e.field === 'permanencia'), 'validação: ILP em sucessão acima de 245 dias');
let cap = 0; for (let c = 10; c < 900; c += 5) { if (!E.calculateEconomics({ ...base, cabecas: c }).balancoForragem.atende) break; cap = c; }
const hi = E.calculateEconomics({ ...base, cabecas: cap }), lo = E.calculateEconomics({ ...base, cabecas: Math.round(cap * .7) });
ok(hi.balancoForragem.utilizacaoPct > 85 && lo.balancoForragem.utilizacaoPct < 85, `utilização da forragem: ${hi.balancoForragem.utilizacaoPct.toFixed(0)}% na capacidade e ${lo.balancoForragem.utilizacaoPct.toFixed(0)}% a 70%`);
ok(E.assessViability(E.normalizeInputs({ ...base, cabecas: cap }), hi).reasons.some((x) => x.includes('utilização da forragem')), 'veredito alerta utilização acima de 85%');
const c1 = E.calculateEconomics({ ...base, custoFuncionarios_ha: 300, custoCombustiveis_ha: 200, custoAdminEnergia_ha: 20 });
ok(Math.abs(c1.coe_ha - r0.coe_ha - 520) < 1e-6, 'funcionários, combustíveis e administrativo entram no COE');
const mc = E.runMonteCarlo({ ...base, reposicaoPorArroba: 140 }, { iterations: 3000, seed: 3 });
ok(!!mc.ranges.reposicaoPorArroba, 'Monte Carlo sorteia a reposição por @');
const m0 = E.runMonteCarlo({ ...base, reposicaoPorArroba: 140 }, { iterations: 3000, seed: 3, correlacaoPrecoReposicao: 0 });
const m9 = E.runMonteCarlo({ ...base, reposicaoPorArroba: 140 }, { iterations: 3000, seed: 3, correlacaoPrecoReposicao: .9 });
ok(m9.summary.stdDev < m0.summary.stdDev, 'correlação preço x reposição reduz o desvio da margem');
ok(E.sensitivity({ ...base, gmdAguas: .8, gmdSeca: .2 }).find((x) => x.key === 'gmd').impact > 0, 'tornado preserva o GMD sazonal');

// ---------- 2. Cenários padrão contra o Beef Report ----------
console.log('');
const FAIXA = [[1, 3], [3, 6], [6, 12], [12, 18], [18, 26], [26, 38]];
for (const p of P.lista) {
  const v = E.validateInputs(p.raw), r = E.calculateEconomics(p.raw), b = r.balancoForragem;
  ok(v.errors.length === 0, `${p.id}: entrada válida (${v.errors.map((e) => e.message).join('; ') || 'sem erros'})`);
  ok(b.atende, `${p.id}: balanço de forragem sem déficit`);
  ok(b.utilizacaoPct <= 85, `${p.id}: utilização da forragem ${b.utilizacaoPct.toFixed(0)}% (limite 85%)`);
  if (p.meta.lucroHaRelatorio !== undefined) {
    const i = P.NIVEIS.indexOf(p.nivel), at = r.producaoTotal_at_ha * r.cyclesPerYear, rc = E.calculateEconomics({ ...p.raw, rcFinal: p.meta.rcRelatorio }), dif = rc.margemAnual_ha / p.meta.lucroHaNoPreco - 1;
    const tol = i < 2 ? .08 : .02;
    ok(at >= FAIXA[i][0] && at <= FAIXA[i][1], `${p.id}: ${at.toFixed(1)} @/ha/ano dentro da faixa ${FAIXA[i][0]}–${FAIXA[i][1]}`);
    ok(Math.abs(dif) <= tol, `${p.id}: com rendimento de carcaça de ${p.meta.rcRelatorio}%, lucro de R$ ${rc.margemAnual_ha.toFixed(0)}/ha contra R$ ${p.meta.lucroHaNoPreco}/ha do relatório refeito a R$ ${P.PRECO},00/@ (${(dif * 100).toFixed(1)}%, tolerância ${tol * 100}%)`);
    ok(r.margemAnual_ha > rc.margemAnual_ha, `${p.id}: com o rendimento do autor (${p.raw.rcFinal}%) a margem (R$ ${r.margemAnual_ha.toFixed(0)}/ha) fica acima da calibrada ao relatório`);
  }
}

// ---------- 2B. Sistemas integrados e conservação (nível Adequada) ----------
console.log('');
const marg = (raw) => E.calculateEconomics(raw).margemAnual_ha;
const cc3 = P.porId['cc-3'];
const ilp = P.porId['ilp-4anos'], ilpf = P.porId['ilpf-200'], sil = P.porId['silagem-10'], fen = P.porId['feno-10'];
const rI = E.calculateEconomics(ilp.raw), rF = E.calculateEconomics(ilpf.raw);
ok(rI.margemAgricola_ha > 0 || rI.margemLiquidaAgricola_total > 0 || marg(ilp.raw) > marg(cc3.raw), 'ILP: lavoura contribui positivamente');
ok(marg(ilp.raw) >= marg(cc3.raw), `ILP: margem de R$ ${marg(ilp.raw).toFixed(0)}/ha não fica abaixo do pasto próprio Adequada (R$ ${marg(cc3.raw).toFixed(0)}/ha)`);
ok(marg(ilp.raw) / marg(cc3.raw) < 1.25, 'ILP: ganho sobre o pasto próprio abaixo de 25% (sem efeito fantasioso)');
ok(marg(ilpf.raw) <= marg(ilp.raw), 'ILPF: com o volume padrão de madeira a floresta não supera a ILP (break-even de 0,42 m³/árvore)');
const volBE = (v) => marg({ ...ilpf.raw, volumeArvoreM3: v });
ok(volBE(.30) < marg(ilp.raw) && volBE(.60) > marg(ilp.raw), 'ILPF: o break-even do volume por árvore está entre 0,30 e 0,60 m³');
const semCons = { ...cc3.raw, cabecas: 188, gmd: .575, gmdAguas: .85, gmdSeca: .30 };
const mBase = marg(semCons);
ok(marg(sil.raw) > mBase && marg(fen.raw) > mBase, `silagem (R$ ${marg(sil.raw).toFixed(0)}) e feno (R$ ${marg(fen.raw).toFixed(0)}) superam a mesma pastagem sem conservação (R$ ${mBase.toFixed(0)}) quando a seca rende 0,45 kg/dia`);
ok(marg({ ...sil.raw, gmdSeca: .30 }) < mBase && marg({ ...fen.raw, gmdSeca: .30 }) < mBase, 'conservação sem ganho de GMD na seca perde para a pastagem sem conservação');
const gmdBE = (raw) => { for (let g = .30; g <= .60; g += .005) if (marg({ ...raw, gmdSeca: g }) >= mBase) return g; return NaN; };
ok(gmdBE(sil.raw) >= .37 && gmdBE(sil.raw) <= .40 && gmdBE(fen.raw) >= .37 && gmdBE(fen.raw) <= .40, `GMD de equilíbrio na seca: silagem ${gmdBE(sil.raw).toFixed(3)}, feno ${gmdBE(fen.raw).toFixed(3)} kg/dia (texto: cerca de 0,38)`);

// ---------- 2C. Reforma de pastagem e TIP de seca ----------
console.log('');
const ref = P.porId['reforma-adequada'], cc1 = P.porId['cc-1'], tipS = P.porId['tip-seca'], tipA = P.porId['tip-aguas'];
const rR = E.calculateEconomics(ref.raw);
ok(Math.abs(rR.custoTotalImplantacao_ha - 4700) < 1, `reforma: implantação de R$ ${rR.custoTotalImplantacao_ha.toFixed(0)}/ha (alvo R$ 4.700)`);
ok(marg(ref.raw) > marg(cc1.raw) && marg(ref.raw) < marg(cc3.raw), `reforma: margem de R$ ${marg(ref.raw).toFixed(0)}/ha fica entre a pastagem degradada Baixa Tec (R$ ${marg(cc1.raw).toFixed(0)}) e a Adequada sem reforma (R$ ${marg(cc3.raw).toFixed(0)})`);
const vidaBE = (() => { for (let v = 1; v <= 15; v++) if (marg({ ...ref.raw, vidaUtil: v }) >= marg(cc1.raw)) return v; return NaN; })();
ok(vidaBE === 2, `reforma: vida útil de equilíbrio frente à pastagem degradada de ${vidaBE} anos (texto: a partir de 2)`);
ok(marg({ ...ref.raw, vidaUtil: 1 }) < marg(cc1.raw), 'reforma: com 1 ano de vida útil a reforma perde para manter a pastagem degradada');
const rT = E.calculateEconomics(tipS.raw);
ok(tipS.raw.mesEntrada === 6 && tipS.raw.permanencia === 120, 'TIP seca: 120 dias de junho a setembro, inteiro na estação seca');
ok(rT.precoEquilibrio > 306 && rT.precoEquilibrio < 316, `TIP seca: preço de equilíbrio R$ ${rT.precoEquilibrio.toFixed(0)}/@, abaixo dos R$ 350,00 (texto: cerca de R$ 311)`);
ok(rT.margemLiquida_total / tipS.raw.cabecas > 0, 'TIP seca: com entrada de R$ 4.300 e R$ 350,00/@ a margem por cabeça é positiva (resultado, não ajuste)');
const tipMargemCab = (o) => { const r = E.calculateEconomics({ ...tipS.raw, ...o }); return r.margemLiquida_total / tipS.raw.cabecas; };
ok(tipMargemCab({ precoArroba: 369.9 }) > 0 && tipMargemCab({ custoAnimalEntrada_cab: 4500 }) >= 0, 'TIP seca: positivo a R$ 369,90/@ (Cepea) ou com o magro a R$ 4.500');
ok(E.calculateEconomics(tipS.raw).margemLiquida_ha < E.calculateEconomics(tipA.raw).margemLiquida_ha, 'TIP seca rende menos por hectare que o TIP de águas (GMD menor)');

// ---------- 2D. Preços e despesas definidos pelo autor ----------
console.log('');
ok(P.lista.every((p) => p.raw.precoArroba === 350), 'todos os cenários usam a arroba a R$ 350,00');
const ciclos = P.lista.filter((p) => p.raw.modoEconomico === 'ciclo');
ok(ciclos.length === 3 && ciclos.every((p) => p.raw.despesasComerciaisPct === 0.5 && p.raw.outrasDespesas_cab === 50), 'cenários de ciclo completo (RIP e TIP): despesas comerciais de 0,5% e fretes/outros de R$ 50/cab');
ok(['tip-aguas', 'tip-seca'].every((id) => P.porId[id].raw.custoAnimalEntrada_cab === 4300), 'TIP: magro de 360 kg a R$ 4.300/cab');
ok(P.porId['rip-intensivo'].raw.custoAnimalEntrada_cab === 3450, 'RIP: bezerro de 210 kg segue em R$ 3.450/cab (Cepea)');

ok(P.lista.filter((p) => p.nivel).every((p) => p.raw.rcFinal === (['Extrativista', 'Baixa Tec', 'Média Tec'].includes(p.nivel) ? 54 : 56.5)), 'rendimento de carcaça final: 54,0% de Extrativista a Média Tec e 56,5% de Adequada a Intensivo (inclui RIP, TIP, ILP, ILPF, silagem, feno e reforma)');
ok(P.lista.every((p) => p.raw.rcInicial === 50), 'rendimento de carcaça inicial segue em 50% em todos os cenários');

// ---------- 3. Compatibilidade com um HTML de referência (opcional) ----------
const arg = process.argv.find((a) => a.startsWith('--ref='));
if (arg) {
  const ref = carregar(arg.slice(6)).E;
  let seed = 12345; const R = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = (a) => a[Math.floor(R() * a.length)];
  const chaves = ['producaoTotal_at', 'receitaBruta_total', 'cot_total', 'cot_ha', 'coe_ha', 'margemLiquida_ha', 'margemLiquida_total', 'custoPorArroba', 'precoEquilibrio', 'pesoFinal', 'lotacao'];
  let dif = 0; const N = 2000;
  for (let i = 0; i < N; i++) {
    const raw = { area: 50 + R() * 500, situacaoPastagem: pick(['nova', 'existente']), metodoPastejo: pick(['continuo', 'rotacionado']), estrategia: pick(['convencional', 'rip', 'tip']), integracao: pick(['pastagem', 'ilp', 'ilpf']), conservacao: pick(['nao', 'feno', 'silagem']), cabecas: Math.round(20 + R() * 600), pesoInicial: 150 + R() * 300, permanencia: Math.round(60 + R() * 305), gmd: .2 + R(), precoArroba: 200 + R() * 200, modoEconomico: pick(['incremental', 'ciclo']), custoAnimalEntrada_cab: 1000 + R() * 4000, mesEntrada: 1 + Math.floor(R() * 12), acumuloAguas: 20 + R() * 60, acumuloSeca: 3 + R() * 20, mortalidadePct: R() * 3, baseCustos: pick(['anual', 'ciclo']), usoAreaAgricola: pick(['sucessao', 'separada']), destinoConservacao: pick(['interno', 'venda']) };
    const a = ref.calculateEconomics(raw, { finance: false }), b = E.calculateEconomics(raw, { finance: false });
    if (chaves.some((k) => !(a[k] === b[k] || (Number.isNaN(a[k]) && Number.isNaN(b[k])) || Math.abs(a[k] - b[k]) < 1e-9 * Math.max(1, Math.abs(a[k]))))) dif++;
  }
  ok(dif === 0, `compatibilidade com ${path.basename(arg.slice(6))} (motor ${ref.VERSION}): ${N} entradas aleatórias, ${dif} divergências nos resultados do ciclo`);
}

console.log(`\n${total - falhas} de ${total} verificações passaram.`);
process.exit(falhas ? 1 : 0);
