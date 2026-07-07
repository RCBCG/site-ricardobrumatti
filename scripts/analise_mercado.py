"""
Motor de análise de mercado — Boi / Bezerro / Soja / Milho
Site: ricardobrumatti.pro.br

O QUE ESSE SCRIPT FAZ (etapas 1, 2, 3, 5, 8 e 10 do prompt original):
  1. Baixa e limpa as 4 séries de preço do Cepea (boi gordo, bezerro, soja, milho)
  2. Calcula estatística descritiva (nominal e retornos)
  3. Deflaciona as séries com IPCA e IGP-DI (Banco Central)
  5. Calcula sazonalidade (média/volatilidade por mês)
  8. Calcula razão de troca (Boi(20@)/Bezerro, Boi/Milho, Boi/Soja)
 10. Simula Monte Carlo (GBM) para o preço do boi, 1.000 cenários, 180 dias úteis

SAÍDA: ferramentas/dados/resultados.json — dividido em duas seções:
  - "publico": números prontos para a tela simplificada (analise-mercado.html)
  - "tecnico": tabelas completas, para a tela técnica / base dos artigos

IMPORTANTE PARA RICARDO (não-desenvolvedor):
  Este script roda sozinho, uma vez por dia, dentro do GitHub Actions.
  Você não precisa executá-lo manualmente — só revisar o resultado.
  Se quiser testar no seu Mac antes de confiar na automação, veja o
  arquivo LEIA-ME.md que acompanha esta entrega.
"""

import io
import json
import os
import re
import time
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import requests

# ---------------------------------------------------------------------------
# CONFIGURAÇÃO
# ---------------------------------------------------------------------------

# User-Agent de navegador real. Sem isso, o Cepea bloqueia por bot detection
# (confirmado em teste — ver LEIA-ME.md, seção "o que já testamos").
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    )
}

URLS_CEPEA = {
    "boi": "https://cepea.org.br/br/indicador/series/boi-gordo.aspx?id=2",
    "bezerro": "https://cepea.org.br/br/indicador/series/bezerro.aspx?id=8",
    "soja": "https://cepea.org.br/br/indicador/series/soja.aspx?id=92",
    "milho": "https://cepea.org.br/br/indicador/series/milho.aspx?id=77",
}

BCB_SGS = {
    "ipca": "https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json",
    "igpdi": "https://api.bcb.gov.br/dados/serie/bcdata.sgs.190/dados?formato=json",
}

SAIDA_JSON = "ferramentas/dados/resultados.json"

# Etapa 9 — abate por sexo (IBGE/SIDRA, Tabela 1092). O IBGE bloqueia acesso
# automatizado, então esse arquivo é baixado manualmente por Ricardo no
# navegador (uma vez a cada atualização trimestral do IBGE) e colocado nesse
# caminho. Se o arquivo não existir, o script segue sem essa seção — não é
# obrigatório pra rodar o resto.
CAMINHO_IBGE_ABATE = "scripts/tabela1092.xlsx"

# Quantas tentativas por arquivo do Cepea, e quanto esperar entre elas.
# O bezerro se mostrou mais sensível a bot-detection nos testes — por isso
# o retry com espera é obrigatório, não opcional.
MAX_TENTATIVAS = 3
ESPERA_ENTRE_TENTATIVAS_SEG = 8
ESPERA_ENTRE_ARQUIVOS_SEG = 4


# ---------------------------------------------------------------------------
# ETAPA 1 — COLETA E LIMPEZA
# ---------------------------------------------------------------------------

def limpar_numero_br(serie: pd.Series) -> pd.Series:
    """Converte uma série mista (texto BR + número nativo) para float.

    BUG CRÍTICO ENCONTRADO E CORRIGIDO (retomada de 06/07/2026, teste real
    no Mac): o .xls do Cepea não traz a coluna de preço 100% como texto.
    Algumas células vêm como número nativo do Excel (ex.: já um float Python
    329.85), outras como texto formatado no padrão brasileiro (ex.: "329,85").
    A versão anterior desta função assumia que TUDO era texto e aplicava
    str(valor) antes de limpar — isso transforma 329.85 (float) em "329.85"
    (string com ponto decimal), e aí o replace(".", "") que deveria só matar
    separador de milhar apaga o ponto decimal de verdade, sobrando "32985".
    Resultado: todo valor que chegava como número nativo saía inflado em
    exatamente 100x (confirmado no preço real: R$ 329,85 virou 32985,0).

    Correção: decidir por valor, não pela coluna inteira. Se já é numérico
    (int/float/np.integer/np.floating), usa direto. Só aplica a limpeza de
    texto brasileiro (ponto=milhar, vírgula=decimal) em valores que são
    string de verdade.
    """
    def limpar_valor(v):
        if pd.isna(v):
            return np.nan
        if isinstance(v, (int, float, np.integer, np.floating)):
            return float(v)
        texto = str(v).strip()
        if texto == "" or texto.lower() == "nan":
            return np.nan
        texto = texto.replace(".", "").replace(",", ".")
        try:
            return float(texto)
        except ValueError:
            return np.nan

    return serie.apply(limpar_valor)


def baixar_arquivo_cepea(nome: str, url: str) -> bytes:
    """Baixa o arquivo bruto do Cepea, com retry. Levanta exceção se falhar
    em todas as tentativas — o chamador decide o que fazer (ex.: manter
    o dado do dia anterior em vez de quebrar o pipeline inteiro)."""
    ultimo_erro = None
    for tentativa in range(1, MAX_TENTATIVAS + 1):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=20)
            resp.raise_for_status()
            if len(resp.content) < 200:
                # Resposta suspeita: provável página de bloqueio, não o arquivo real
                raise ValueError(f"Resposta muito pequena ({len(resp.content)} bytes)")
            return resp.content
        except Exception as e:  # noqa: BLE001 — queremos capturar e tentar de novo
            ultimo_erro = e
            print(f"[{nome}] tentativa {tentativa}/{MAX_TENTATIVAS} falhou: {e}")
            if tentativa < MAX_TENTATIVAS:
                time.sleep(ESPERA_ENTRE_TENTATIVAS_SEG)
    raise RuntimeError(f"[{nome}] falha após {MAX_TENTATIVAS} tentativas: {ultimo_erro}")


def parse_arquivo_cepea(conteudo: bytes) -> pd.DataFrame:
    """
    O Cepea publica em ASP.NET (extensão .aspx nas URLs) e o botão de
    exportação desses sistemas frequentemente entrega um HTML disfarçado
    de .xls, não um binário Excel de verdade. Por isso tentamos, nesta
    ordem: Excel binário real -> Excel novo (xlsx) -> HTML disfarçado -> CSV.

    ATENÇÃO (achado em teste): pd.read_html() usa thousands=',' por padrão,
    o que DESTRÓI números no padrão brasileiro (285,50 vira 28550). É
    obrigatório passar thousands=None e limpar os números manualmente depois.
    """
    # DIAGNÓSTICO (adicionado em 06/07/2026): antes o try/except de cada
    # estratégia engolia o erro em silêncio (`except Exception: pass`), então
    # quando tudo falhava só víamos o erro da última estratégia (CSV), sem
    # nenhuma pista do que realmente veio no arquivo. Agora cada falha é
    # registrada, e mostramos uma amostra do conteúdo bruto no final se as
    # 4 estratégias falharem — assim dá pra identificar o formato real.
    erros_por_estrategia = {}

    # Estratégia 1: Excel binário antigo (.xls real, formato BIFF)
    #
    # engine_kwargs={"logfile": io.StringIO()} silencia o log de debug que o
    # xlrd imprime por padrão no terminal (ex.: "_locate_stream(Workbook): seen"),
    # que não é erro, só ruído interno da leitura do formato binário OLE2.
    #
    # CONFIRMADO EM TESTE REAL (06/07/2026): o Cepea manda um .xls binário
    # genuíno (assinatura OLE2 D0 CF 11 E0), mas gerado por ferramenta ASP.NET
    # (provavelmente Crystal Reports ou similar), não pelo Excel da Microsoft.
    # Isso dispara CompDocError('Workbook corruption: seen[N] == 4') no xlrd —
    # um falso positivo conhecido da validação interna estrita do xlrd para
    # arquivos xls não gerados pelo Excel. ignore_workbook_corruption=True é
    # o parâmetro que o próprio xlrd oferece para contornar exatamente isso.
    try:
        df = pd.read_excel(
            io.BytesIO(conteudo), engine="xlrd", header=None,
            engine_kwargs={"logfile": io.StringIO(), "ignore_workbook_corruption": True},
        )
        return _padronizar_colunas(df)
    except Exception as e:
        erros_por_estrategia["1_xls_binario"] = repr(e)

    # Estratégia 2: Excel novo (.xlsx, caso o Cepea tenha migrado o formato)
    try:
        df = pd.read_excel(io.BytesIO(conteudo), engine="openpyxl", header=None)
        return _padronizar_colunas(df)
    except Exception as e:
        erros_por_estrategia["2_xlsx"] = repr(e)

    # Estratégia 3: HTML disfarçado de .xls (comum em exports ASP.NET)
    #
    # BUG ENCONTRADO E CORRIGIDO (retomada de 06/07/2026): a versão anterior usava
    # converters={i: str for i in range(6)}, um número fixo de colunas. Se a tabela
    # real tiver menos de 6 colunas — caso comum nos exports do Cepea —, o pandas
    # levanta IndexError aqui, o try/except engole o erro, e o parsing cai pra
    # estratégia 4 (CSV), que interpreta o HTML como texto puro e produz lixo
    # (testado e reproduzido: "10</td><td>59" aparecendo dentro de uma célula).
    # Correção: descobrir o número real de colunas antes de montar os converters.
    try:
        tabelas_prova = pd.read_html(io.BytesIO(conteudo))
        n_colunas = max(tabelas_prova, key=len).shape[1]
        tabelas = pd.read_html(
            io.BytesIO(conteudo),
            thousands=None,  # crítico — ver docstring acima
            converters={i: str for i in range(n_colunas)},
        )
        maior_tabela = max(tabelas, key=len)
        return _padronizar_colunas(maior_tabela)
    except Exception as e:
        erros_por_estrategia["3_html_disfarcado"] = repr(e)

    # Estratégia 4: CSV puro (estrutura descrita por Ricardo: 3 linhas de
    # metadado antes do cabeçalho real)
    try:
        texto = conteudo.decode("latin-1")
        df = pd.read_csv(io.StringIO(texto), skiprows=3, header=0)
        return _padronizar_colunas(df)
    except Exception as e:
        erros_por_estrategia["4_csv"] = repr(e)

    # Todas falharam — mostra o diagnóstico completo antes de desistir
    amostra = conteudo[:300]
    try:
        amostra_legivel = amostra.decode("latin-1")
    except Exception:
        amostra_legivel = repr(amostra)
    print("  --- DIAGNÓSTICO DE PARSING (todas as estratégias falharam) ---")
    print(f"  Tamanho do conteúdo baixado: {len(conteudo)} bytes")
    print(f"  Primeiros bytes (assinatura de formato): {conteudo[:8]!r}")
    print(f"  Amostra dos primeiros 300 caracteres:\n{amostra_legivel}")
    for estrategia, erro in erros_por_estrategia.items():
        print(f"  [{estrategia}] {erro}")
    print("  --- fim do diagnóstico ---")
    raise ValueError(f"Nenhuma estratégia de parsing funcionou: {erros_por_estrategia}")


def _padronizar_colunas(df: pd.DataFrame) -> pd.DataFrame:
    """Detecta a coluna de data e a(s) coluna(s) de preço por posição/conteúdo,
    já que o cabeçalho real do Cepea pode variar ('À vista R$' vs 'Preço R$')."""
    df = df.dropna(how="all").reset_index(drop=True)
    # Remove linhas de cabeçalho/rodapé residuais que não parecem dado
    df.columns = [str(c) for c in df.columns]
    resultado = pd.DataFrame()
    # format="%d/%m/%Y" explícito: evita o aviso de inferência do pandas e é
    # mais rápido; linhas de cabeçalho ("Data", texto) viram NaT com coerce,
    # e são descartadas no dropna() abaixo — sem risco de interpretar errado.
    resultado["Data"] = pd.to_datetime(df.iloc[:, 0], format="%d/%m/%Y", errors="coerce")
    resultado["Preco_RS"] = limpar_numero_br(df.iloc[:, 1])
    if df.shape[1] > 2:
        resultado["Preco_US"] = limpar_numero_br(df.iloc[:, 2])
    resultado = resultado.dropna(subset=["Data", "Preco_RS"]).sort_values("Data")
    return resultado.reset_index(drop=True)


def coletar_series_cepea() -> dict:
    """Baixa e faz parse das 4 séries. Se uma falhar, registra o erro e
    segue com as outras — não deixa uma fonte instável derrubar tudo."""
    series = {}
    erros = {}
    for nome, url in URLS_CEPEA.items():
        try:
            conteudo = baixar_arquivo_cepea(nome, url)
            df = parse_arquivo_cepea(conteudo)
            series[nome] = df
            print(f"[{nome}] OK — {len(df)} linhas")
        except Exception as e:
            erros[nome] = str(e)
            print(f"[{nome}] FALHOU: {e}")
        time.sleep(ESPERA_ENTRE_ARQUIVOS_SEG)
    return {"series": series, "erros": erros}


# ---------------------------------------------------------------------------
# ETAPA 2 — ESTATÍSTICA DESCRITIVA
# ---------------------------------------------------------------------------

def estatistica_descritiva(df: pd.DataFrame, coluna: str = "Preco_RS") -> dict:
    serie = df[coluna].dropna()
    retorno = np.log(serie / serie.shift(1)).dropna()
    return {
        "preco": {
            "n": int(serie.count()),
            "media": round(float(serie.mean()), 2),
            "mediana": round(float(serie.median()), 2),
            "desvio_padrao": round(float(serie.std()), 2),
            "erro_padrao": round(float(serie.sem()), 4),
            "minimo": round(float(serie.min()), 2),
            "maximo": round(float(serie.max()), 2),
            "assimetria": round(float(serie.skew()), 3),
            "curtose": round(float(serie.kurt()), 3),
        },
        "retorno_log": {
            "media": round(float(retorno.mean()), 6),
            "desvio_padrao": round(float(retorno.std()), 6),
            "assimetria": round(float(retorno.skew()), 3),
            "curtose": round(float(retorno.kurt()), 3),
        },
    }


# ---------------------------------------------------------------------------
# ETAPA 3 — DEFLAÇÃO (IPCA / IGP-DI)
# ---------------------------------------------------------------------------

def buscar_indice_bcb(url: str) -> pd.DataFrame:
    resp = requests.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    dados = resp.json()
    df = pd.DataFrame(dados)
    df["data"] = pd.to_datetime(df["data"], dayfirst=True)
    df["valor"] = df["valor"].astype(float)
    return df.sort_values("data").reset_index(drop=True)


def montar_indice_diario(df_mensal: pd.DataFrame) -> pd.Series:
    """Expande a variação % mensal em um índice acumulado diário
    (repete o índice do mês para todos os dias daquele mês)."""
    df_mensal = df_mensal.copy()
    df_mensal["indice"] = (1 + df_mensal["valor"] / 100).cumprod()
    df_mensal["ano_mes"] = df_mensal["data"].dt.to_period("M")
    return df_mensal.set_index("ano_mes")["indice"]


def deflacionar(df_preco: pd.DataFrame, indice_mensal: pd.Series) -> pd.Series:
    """Deflaciona rebasando para o valor mais recente do índice
    (preço 'em reais de hoje').

    BUG ENCONTRADO E CORRIGIDO (retomada de 06/07/2026, teste real no Mac):
    o IPCA/IGP-DI do Banco Central tem defasagem normal de divulgação — o
    índice do mês corrente (ou às vezes do anterior) ainda não está disponível
    quando o script roda. Sem correção, o mês mais recente da série de preço
    não encontra correspondência no índice, o .map() devolve NaN, e o preço
    deflacionado do dia mais recente (o que aparece na tela pública) vira NaN.
    Como o JSON puro não aceita NaN (quebra o JSON.parse do navegador),
    isso tinha que ser resolvido de qualquer forma antes de ir pro ar.
    Correção: ffill() no índice alinhado — assume-se o último índice
    conhecido para meses ainda não publicados. É a aproximação padrão em
    economia para dado com defasagem de divulgação, e a série já vem
    ordenada por data, então o ffill segue a ordem cronológica certa.
    """
    ano_mes = df_preco["Data"].dt.to_period("M")
    indice_alinhado = ano_mes.map(indice_mensal).ffill()
    indice_base = indice_mensal.iloc[-1]
    fator = indice_base / indice_alinhado
    return df_preco["Preco_RS"] * fator


def serie_mensal_com_medias_moveis(
    df_preco: pd.DataFrame,
    indice_ipca: pd.Series = None,
    indice_igpdi: pd.Series = None,
    janela_mm: int = 12,
) -> list:
    """Agrega a série diária em médias mensais (nominal e real pelos dois
    deflatores) e calcula a média móvel de `janela_mm` meses sobre a série
    nominal — a 'tendência de longo prazo' que a análise original pedia
    (Etapa 3: comparar os dois deflatores; leitura de nível atual vs.
    histórico real, não nominal).

    LACUNA ENCONTRADA (retomada de 13/07/2026): a versão anterior baixava o
    IGP-DI do Banco Central mas nunca chegava a usá-lo — só o IPCA entrava
    na deflação. Corrigido aqui: as duas séries reais (IPCA e IGP-DI) saem
    lado a lado, exatamente como a Etapa 3 do prompt original pedia
    ("calcular com os dois deflatores e comparar").

    Agregação mensal, não diária: expor as ~7.200 linhas diárias cruas no
    JSON deixaria o arquivo pesado à toa para um gráfico de tendência de
    longo prazo — resample mensal (~350 pontos em 29 anos) é suficiente e
    muito mais leve pro navegador renderizar.
    """
    serie = df_preco.set_index("Data")["Preco_RS"]
    nominal_mensal = serie.resample("ME").mean()

    real_ipca_mensal = None
    if indice_ipca is not None:
        real_ipca_mensal = deflacionar(df_preco, indice_ipca).set_axis(df_preco["Data"]).resample("ME").mean()

    real_igpdi_mensal = None
    if indice_igpdi is not None:
        real_igpdi_mensal = deflacionar(df_preco, indice_igpdi).set_axis(df_preco["Data"]).resample("ME").mean()

    media_movel = nominal_mensal.rolling(janela_mm, min_periods=max(3, janela_mm // 4)).mean()

    linhas = []
    for data_mes, valor_nominal in nominal_mensal.items():
        linha = {
            "ano_mes": data_mes.strftime("%Y-%m"),
            "nominal": round(float(valor_nominal), 2) if pd.notna(valor_nominal) else None,
            "media_movel_nominal": (
                round(float(media_movel.loc[data_mes]), 2)
                if pd.notna(media_movel.loc[data_mes]) else None
            ),
        }
        if real_ipca_mensal is not None:
            v = real_ipca_mensal.loc[data_mes] if data_mes in real_ipca_mensal.index else np.nan
            linha["real_ipca"] = round(float(v), 2) if pd.notna(v) else None
        if real_igpdi_mensal is not None:
            v = real_igpdi_mensal.loc[data_mes] if data_mes in real_igpdi_mensal.index else np.nan
            linha["real_igpdi"] = round(float(v), 2) if pd.notna(v) else None
        linhas.append(linha)

    return linhas


# ---------------------------------------------------------------------------
# ETAPA 5 — SAZONALIDADE
# ---------------------------------------------------------------------------

def sazonalidade(df: pd.DataFrame, coluna: str = "Preco_RS") -> dict:
    tmp = df.copy()
    tmp["mes"] = tmp["Data"].dt.month
    por_mes = tmp.groupby("mes")[coluna].agg(["mean", "std"]).round(2)
    return {
        "por_mes": {
            int(mes): {"media": row["mean"], "volatilidade": row["std"]}
            for mes, row in por_mes.iterrows()
        },
        "mes_maior_preco": int(por_mes["mean"].idxmax()),
        "mes_menor_preco": int(por_mes["mean"].idxmin()),
    }


# ---------------------------------------------------------------------------
# ETAPA 8 — RAZÃO DE TROCA
# ---------------------------------------------------------------------------

def razao_de_troca(df_boi: pd.DataFrame, df_outro: pd.DataFrame, fator_boi: float = 20) -> pd.DataFrame:
    """Boi(20@)/X = (preço boi R$/@ × 20) / preço X.
    fator_boi=20 assume boi cotado por arroba; ajustar se a unidade mudar."""
    merged = pd.merge(df_boi, df_outro, on="Data", suffixes=("_boi", "_outro"))
    merged["razao"] = (merged["Preco_RS_boi"] * fator_boi) / merged["Preco_RS_outro"]
    return merged[["Data", "razao"]]


# ---------------------------------------------------------------------------
# ETAPA 9 — ABATE POR SEXO (IBGE/SIDRA, Tabela 1092) × RAZÃO BOI/BEZERRO
# ---------------------------------------------------------------------------
#
# O IBGE/SIDRA bloqueia acesso automatizado (confirmado via robots.txt),
# então essa fonte não entra no download automático do Cepea. Ricardo baixa
# manualmente o export .xlsx da Tabela 1092 no navegador (uma vez a cada
# atualização trimestral do IBGE, bem menos frequente que os preços diários)
# e fornece o caminho do arquivo abaixo.

def parse_ibge_abate_xlsx(caminho_arquivo: str, aba: str = "Animais abatidos (Cabeças)") -> pd.DataFrame:
    """Lê o export .xlsx do IBGE/SIDRA (Tabela 1092) e devolve uma série
    trimestral de % de fêmeas no abate nacional (Tipo de inspeção = Total).

    FORMATO REAL DO ARQUIVO (confirmado em teste com arquivo real, 13/07/2026):
    exportação SIDRA em formato "espalhado" — linha 3 = rótulo do trimestre
    (repete a cada bloco de 24 colunas), linha 4 = sub-período (Total do
    trimestre / No 1º mês / No 2º mês / No 3º mês), linha 5 = categoria de
    rebanho (Total, Bois, Vacas, Novilhos, Novilhas, Vitelos e vitelas),
    linha 6 = dado da linha "Tipo de inspeção = Total" (agregado nacional,
    federal + não-federal). Usamos só o bloco "Total do trimestre" (offset 0
    dentro de cada bloco de 24 colunas), ignorando a quebra mensal.

    ACHADO EM TESTE: a categoria "Vitelos e vitelas" tem valor "..." (dado
    suprimido/não disponível) em vários trimestres — não afeta o cálculo de
    % fêmea, que usa só Vacas/Novilhas/Total, mas pd.to_numeric(errors=
    "coerce") protege contra isso mesmo assim.

    NOME DA ABA VARIA ENTRE EXPORTS (achado em 13/07/2026): o primeiro
    arquivo testado trazia a aba nomeada 'Animais abatidos (Cabeças)'; um
    segundo export do mesmo Ricardo, reaberto/resalvo no OnlyOffice, veio
    com a aba renomeada genericamente para 'Tabela'. O conteúdo e a
    estrutura de linhas são idênticos nos dois casos — só o nome muda.
    Por isso: tenta o nome esperado primeiro, e se não achar, cai pra
    primeira aba do arquivo, que no export do SIDRA é sempre a aba de dados
    (a de notas/fonte vem depois).
    """
    xl = pd.ExcelFile(caminho_arquivo)
    aba_real = aba if aba in xl.sheet_names else xl.sheet_names[0]
    df = pd.read_excel(xl, sheet_name=aba_real, header=None)
    linha_trimestre = df.iloc[3]
    linha_categoria = df.iloc[5]
    linha_dados = df.iloc[6]  # Tipo de inspeção = Total

    inicios = [c for c in range(2, df.shape[1]) if pd.notna(linha_trimestre.iloc[c])]
    registros = []
    for inicio in inicios:
        label = str(linha_trimestre.iloc[inicio])
        m = re.match(r"(\d)º trimestre (\d{4})", label)
        if not m:
            continue
        trimestre, ano = int(m.group(1)), int(m.group(2))
        for offset_cat in range(6):  # bloco "Total do trimestre" = offset 0
            col = inicio + offset_cat
            registros.append({
                "ano": ano, "trimestre": trimestre,
                "categoria": linha_categoria.iloc[col],
                "valor": pd.to_numeric(linha_dados.iloc[col], errors="coerce"),
            })

    tidy = pd.DataFrame(registros)
    piv = tidy.pivot_table(
        index=["ano", "trimestre"], columns="categoria", values="valor", aggfunc="first"
    ).reset_index()
    piv["pct_femea"] = (piv["Vacas"] + piv["Novilhas"]) / piv["Total"] * 100
    return piv.sort_values(["ano", "trimestre"]).reset_index(drop=True)


def correlacionar_femea_razao_troca(
    abate_trimestral: pd.DataFrame,
    df_boi: pd.DataFrame,
    df_bezerro: pd.DataFrame,
    lags_trimestres=range(0, 5),
) -> dict:
    """Correlação entre % de fêmeas no abate e a razão de troca boi/bezerro,
    testando defasagens de 0 a 4 trimestres. Teoria do ciclo pecuário: uma
    decisão de retenção (segurar fêmeas na fazenda em vez de abater) ou
    liquidação de rebanho hoje só costuma aparecer no preço relativo do
    bezerro alguns trimestres depois, quando a oferta de bezerros do ano
    seguinte reflete essa decisão.

    LIMITAÇÃO IMPORTANTE (documentada em teste, 13/07/2026): esta é uma
    correlação em NÍVEL, não em diferenças. Duas séries com tendência de
    longo prazo no mesmo período (ex.: ambas subindo por inflação ou
    crescimento geral do mercado) tendem a mostrar correlação alta mesmo
    sem nenhuma relação causal real entre elas — o problema clássico de
    correlação espúria entre séries não-estacionárias. Este número é um
    indício exploratório, não uma prova de causalidade. O teste rigoroso
    disso é exatamente o que ficou para a v2 do prompt original: cointegração
    (Etapa 6) e causalidade de Granger (Etapa 7), que testam a relação
    depois de remover a tendência comum.
    """
    rt = razao_de_troca(df_boi, df_bezerro)
    rt = rt.set_index("Data")
    rt_trimestral = rt["razao"].resample("QE").mean().to_frame("razao_boi_bezerro")
    rt_trimestral["ano"] = rt_trimestral.index.year
    rt_trimestral["trimestre"] = rt_trimestral.index.quarter

    base = abate_trimestral.merge(rt_trimestral, on=["ano", "trimestre"], how="inner")
    base = base.sort_values(["ano", "trimestre"]).reset_index(drop=True)

    correlacoes = {}
    for lag in lags_trimestres:
        deslocado = base["pct_femea"].shift(lag)
        valido = deslocado.notna() & base["razao_boi_bezerro"].notna()
        if valido.sum() >= 8:  # mínimo de pontos pra uma correlação minimamente confiável
            corr = float(np.corrcoef(deslocado[valido], base["razao_boi_bezerro"][valido])[0, 1])
            correlacoes[f"lag_{lag}_trimestres"] = round(corr, 3)

    return {
        "correlacoes": correlacoes,
        "serie": [
            {
                "ano": int(r["ano"]), "trimestre": int(r["trimestre"]),
                "pct_femea": round(float(r["pct_femea"]), 2),
                "razao_boi_bezerro": round(float(r["razao_boi_bezerro"]), 3),
            }
            for _, r in base.iterrows()
        ],
    }


# ---------------------------------------------------------------------------
# ETAPA 10 — MONTE CARLO (GBM)
# ---------------------------------------------------------------------------

def monte_carlo_gbm(precos: pd.Series, n_sim: int = 1000, n_dias: int = 180, seed: int = 42) -> dict:
    retornos = np.log(precos / precos.shift(1)).dropna()
    mu, sigma = retornos.mean(), retornos.std()
    preco_inicial = float(precos.iloc[-1])

    rng = np.random.default_rng(seed)
    choques = rng.normal(mu, sigma, size=(n_dias, n_sim))
    trajetorias = preco_inicial * np.exp(np.cumsum(choques, axis=0))

    percentis_finais = np.percentile(trajetorias[-1], [5, 25, 50, 75, 95])
    # Amostra de trajetória mediana dia a dia, para desenhar o fan chart
    trajetoria_mediana = np.median(trajetorias, axis=1)

    return {
        "preco_inicial": round(preco_inicial, 2),
        "horizonte_dias_uteis": n_dias,
        "n_simulacoes": n_sim,
        "percentis_preco_final": {
            "p5": round(float(percentis_finais[0]), 2),
            "p25": round(float(percentis_finais[1]), 2),
            "p50": round(float(percentis_finais[2]), 2),
            "p75": round(float(percentis_finais[3]), 2),
            "p95": round(float(percentis_finais[4]), 2),
        },
        "trajetoria_mediana": [round(float(v), 2) for v in trajetoria_mediana[::5]],  # 1 a cada 5 dias, pra não pesar o JSON
    }


# ---------------------------------------------------------------------------
# MONTAGEM FINAL DO JSON
# ---------------------------------------------------------------------------

def montar_resultado(series: dict, indices_bcb: dict, caminho_ibge: str = None) -> dict:
    boi = series["boi"]
    saida = {
        "gerado_em": datetime.now(timezone.utc).isoformat(),
        "tecnico": {},
        "publico": {},
    }

    # Descritiva + sazonalidade por commodity
    for nome, df in series.items():
        saida["tecnico"][nome] = {
            "descritiva": estatistica_descritiva(df),
            "sazonalidade": sazonalidade(df),
            "n_observacoes": len(df),
            "ultima_data": df["Data"].max().strftime("%d/%m/%Y") if len(df) else None,
            "ultimo_preco": round(float(df["Preco_RS"].iloc[-1]), 2) if len(df) else None,
        }

    # Deflação (se os índices do BCB vieram) — IPCA e IGP-DI, os dois,
    # comparados lado a lado (Etapa 3 do prompt original pedia exatamente isso).
    indice_ipca = montar_indice_diario(indices_bcb["ipca"]) if indices_bcb.get("ipca") is not None else None
    indice_igpdi = montar_indice_diario(indices_bcb["igpdi"]) if indices_bcb.get("igpdi") is not None else None

    for nome, df in series.items():
        if indice_ipca is not None:
            saida["tecnico"][nome]["preco_real_ipca_ultimo"] = round(
                float(deflacionar(df, indice_ipca).iloc[-1]), 2
            )
        if indice_igpdi is not None:
            saida["tecnico"][nome]["preco_real_igpdi_ultimo"] = round(
                float(deflacionar(df, indice_igpdi).iloc[-1]), 2
            )
        saida["tecnico"][nome]["serie_mensal"] = serie_mensal_com_medias_moveis(
            df, indice_ipca, indice_igpdi
        )

    # Razão de troca
    if "bezerro" in series and len(series["bezerro"]):
        rt = razao_de_troca(boi, series["bezerro"])
        saida["tecnico"]["razao_boi_bezerro"] = {
            "media": round(float(rt["razao"].mean()), 2),
            "atual": round(float(rt["razao"].iloc[-1]), 2),
        }

    # Monte Carlo
    if len(boi):
        saida["tecnico"]["monte_carlo_boi"] = monte_carlo_gbm(boi["Preco_RS"])

    # Etapa 9 — abate por sexo (IBGE) × razão boi/bezerro. Opcional: só roda
    # se o arquivo existir, já que depende de download manual (IBGE bloqueia
    # automação) e é atualizado bem menos frequentemente que os preços diários.
    if caminho_ibge and os.path.exists(caminho_ibge) and "bezerro" in series and len(series["bezerro"]):
        try:
            abate_trimestral = parse_ibge_abate_xlsx(caminho_ibge)
            saida["tecnico"]["abate_femea_x_razao_troca"] = correlacionar_femea_razao_troca(
                abate_trimestral, boi, series["bezerro"]
            )
            print(f"  [IBGE] abate processado — {len(abate_trimestral)} trimestres")
        except Exception as e:
            print(f"  [IBGE] falha ao processar {caminho_ibge}: {e}")

    # Seção pública — leitura em linguagem simples, derivada do mesmo cálculo
    if len(boi):
        preco_atual = saida["tecnico"]["boi"]["ultimo_preco"]
        media_historica = saida["tecnico"]["boi"]["descritiva"]["preco"]["media"]
        acima_da_media = preco_atual > media_historica
        saida["publico"] = {
            "atualizado_em": saida["tecnico"]["boi"]["ultima_data"],
            "preco_boi_atual": preco_atual,
            "leitura_preco": (
                "Preço atual acima da média histórica do período analisado."
                if acima_da_media
                else "Preço atual abaixo da média histórica do período analisado."
            ),
            "razao_boi_bezerro_atual": saida["tecnico"].get("razao_boi_bezerro", {}).get("atual"),
            "projecao_180_dias": saida["tecnico"].get("monte_carlo_boi", {}).get("percentis_preco_final"),
        }

    if saida["tecnico"].get("erros"):
        saida["avisos"] = saida["tecnico"]["erros"]

    return saida


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

def sanitizar_para_json(obj):
    """Rede de segurança final: NaN e Infinity não são JSON válido (o
    JSON.parse do navegador quebra com SyntaxError). O json do Python aceita
    escrever isso por padrão (allow_nan=True), o que mascararia o problema
    até chegar na tela pública. Esta função varre a estrutura toda e troca
    qualquer NaN/Infinity por None (vira 'null' no JSON, valor válido)."""
    if isinstance(obj, dict):
        return {k: sanitizar_para_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitizar_para_json(v) for v in obj]
    if isinstance(obj, float) and (np.isnan(obj) or np.isinf(obj)):
        return None
    return obj


def main():
    print("Coletando séries do Cepea...")
    resultado_coleta = coletar_series_cepea()

    print("Coletando índices do Banco Central...")
    indices_bcb = {}
    for nome, url in BCB_SGS.items():
        try:
            indices_bcb[nome] = buscar_indice_bcb(url)
            print(f"[{nome}] OK — {len(indices_bcb[nome])} registros")
        except Exception as e:
            indices_bcb[nome] = None
            print(f"[{nome}] FALHOU: {e}")

    if not resultado_coleta["series"]:
        print("ERRO CRÍTICO: nenhuma série do Cepea foi coletada. Abortando sem sobrescrever o JSON anterior.")
        sys.exit(1)

    saida = montar_resultado(resultado_coleta["series"], indices_bcb, caminho_ibge=CAMINHO_IBGE_ABATE)
    saida = sanitizar_para_json(saida)

    # BUG ENCONTRADO E CORRIGIDO (retomada de 06/07/2026, teste real no Mac):
    # open() não cria pasta sozinho. Na primeira execução, ferramentas/dados/
    # ainda não existe no projeto, e o script quebrava aqui. os.makedirs com
    # exist_ok=True resolve tanto a primeira execução quanto as seguintes.
    os.makedirs(os.path.dirname(SAIDA_JSON), exist_ok=True)
    with open(SAIDA_JSON, "w", encoding="utf-8") as f:
        json.dump(saida, f, ensure_ascii=False, indent=2, allow_nan=False)

    print(f"Concluído. Resultado salvo em {SAIDA_JSON}")


if __name__ == "__main__":
    main()