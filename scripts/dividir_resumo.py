"""Divide o resumo_painel.json em partes menores, fáceis de colar no chat."""
import math

CAMINHO = "ferramentas/dados/resumo_painel.json"
TAMANHO_PARTE = 15000  # caracteres por parte

with open(CAMINHO, encoding="utf-8") as f:
    conteudo = f.read()

n_partes = math.ceil(len(conteudo) / TAMANHO_PARTE)
print(f"Tamanho total: {len(conteudo)} caracteres — dividindo em {n_partes} partes")

for i in range(n_partes):
    inicio = i * TAMANHO_PARTE
    fim = inicio + TAMANHO_PARTE
    pedaco = conteudo[inicio:fim]
    nome_arquivo = f"ferramentas/dados/resumo_parte_{i+1}.txt"
    with open(nome_arquivo, "w", encoding="utf-8") as f:
        f.write(pedaco)
    print(f"  parte {i+1}/{n_partes} salva em {nome_arquivo} ({len(pedaco)} caracteres)")