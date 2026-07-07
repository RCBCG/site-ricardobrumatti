"""
Extrai do resultados.json só o necessário para o painel privado,
gerando um arquivo bem menor (mais fácil de colar ou anexar no chat).

Uso:
    python3 scripts/extrair_resumo_painel.py
"""
import json

with open("ferramentas/dados/resultados.json", encoding="utf-8") as f:
    dados = json.load(f)

resumo = {
    "gerado_em": dados.get("gerado_em"),
    "publico": dados.get("publico"),
    "tecnico": {},
}

for commodity in ["boi", "bezerro", "soja", "milho"]:
    bloco = dados["tecnico"].get(commodity, {})
    resumo["tecnico"][commodity] = {
        "n_observacoes": bloco.get("n_observacoes"),
        "ultima_data": bloco.get("ultima_data"),
        "ultimo_preco": bloco.get("ultimo_preco"),
        "preco_real_ipca_ultimo": bloco.get("preco_real_ipca_ultimo"),
        "preco_real_igpdi_ultimo": bloco.get("preco_real_igpdi_ultimo"),
        "descritiva_preco": bloco.get("descritiva", {}).get("preco"),
        "sazonalidade": bloco.get("sazonalidade"),
        "serie_mensal": bloco.get("serie_mensal"),
    }

resumo["tecnico"]["razao_boi_bezerro"] = dados["tecnico"].get("razao_boi_bezerro")
resumo["tecnico"]["monte_carlo_boi"] = dados["tecnico"].get("monte_carlo_boi")
resumo["tecnico"]["abate_femea_x_razao_troca"] = dados["tecnico"].get("abate_femea_x_razao_troca")

caminho_saida = "ferramentas/dados/resumo_painel.json"
with open(caminho_saida, "w", encoding="utf-8") as f:
    # Sem indent e com separators compactos: mesmo dado, sem uma linha por
    # número. É o que faz a diferença entre 9 mil linhas e praticamente 1.
    json.dump(resumo, f, ensure_ascii=False, separators=(",", ":"))

import os
tamanho_kb = os.path.getsize(caminho_saida) / 1024
print(f"Resumo salvo em {caminho_saida} ({tamanho_kb:.1f} KB)")