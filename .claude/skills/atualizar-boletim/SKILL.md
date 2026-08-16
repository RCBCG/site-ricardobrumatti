---
name: atualizar-boletim
description: Atualização semanal das imagens do carrossel "Boletim de Mercado" na home do site — lê as imagens novas de uma pasta no notebook do Ricardo, monta o carrossel com a quantidade que houver (variável, não fixa), testa localmente e só publica com confirmação. Use quando o Ricardo pedir "atualizar o boletim de mercado", "trocar as imagens do boletim", "subir as imagens da semana", ou invocar /atualizar-boletim.
---

# atualizar-boletim — atualização semanal do Boletim de Mercado

## Onde as coisas ficam

- **Pasta de origem** (no notebook do Ricardo, fora do repositório — nunca é
  versionada): `/Users/ricardobrumatti/Documents/Ferramenta/Slides/Carrossel_Site`
- **Pasta de destino no site**: `img/boletim/` — contém as imagens
  atualmente publicadas, numeradas `01.<ext>`, `02.<ext>`, etc., na ordem de
  exibição do carrossel.
- **HTML do carrossel**: só em `index.html`, dentro de `<section
  id="mercado">` → `<div class="market-carousel-track" id="mercadoTrack">`.
  Cada slide é um bloco:
  ```html
  <div class="market-slide" onclick="openMarketLightbox('img/boletim/NN.ext','LEGENDA')">
    <img src="img/boletim/NN.ext" alt="LEGENDA" loading="lazy">
  </div>
  ```
- Os pontinhos (`#mercadoDots`) e a variável `total` do carrossel são
  **gerados automaticamente por JS** a partir da quantidade real de slides
  encontrados em `#mercadoTrack` — não precisa (e não deve) mexer nisso,
  só no bloco de `.market-slide` acima. É esse mecanismo que permite
  publicar qualquer quantidade de imagens, não só 7.
- `index-print.html` **não tem** essa seção — não precisa editar esse
  arquivo para o boletim.

## Passo a passo

1. **Ler a pasta de origem**: listar arquivos `.png`, `.jpg` ou `.jpeg`
   (case-insensitive) diretamente dentro de `Carrossel_Site/` (ignorar
   subpastas — inclusive as pastas `publicado-*/` do passo 6 — e arquivos
   como `.DS_Store`).
   - Se a pasta não existir ou estiver vazia, avise o Ricardo e pare — não
     invente conteúdo nem reaproveite o boletim anterior.

2. **Ordenar** os arquivos por nome, em ordem "natural" (numérica quando
   houver números — ex.: `2.png` antes de `10.png`). Se o Ricardo nomeou os
   arquivos com prefixo numérico (`1 - ...`, `2 - ...`), essa ordem já
   reflete a ordem desejada no carrossel. Se não tiver prefixo, a ordem
   alfabética é o melhor palpite — avise qual ordem você vai usar antes de
   prosseguir, caso não pareça óbvia.

3. **Gerar a legenda de cada imagem** a partir do nome do arquivo:
   - Remova a extensão.
   - Remova um prefixo numérico se houver (padrões como `1 - `, `01_`,
     `1.`, `(1)`).
   - Troque `-` e `_` restantes por espaço, e limpe espaços duplicados.
   - Essa legenda vira só o atributo `alt` da imagem (usado no lightbox e
     em leitores de tela) — **não aparece visualmente** na página, então
     não precisa ficar perfeita, mas deve ser legível.
   - Mostre pro Ricardo a lista final (ordem + arquivo + legenda inferida)
     e peça uma confirmação rápida antes de continuar — é a única checagem
     manual do processo.

4. **Substituir as imagens**:
   - Apague todos os arquivos dentro de `img/boletim/` (a atualização é
     sempre uma substituição completa do boletim anterior, não parcial).
   - Copie (não mova) cada imagem da pasta de origem para `img/boletim/`,
     renomeando para `01.<ext>`, `02.<ext>`, ... `NN.<ext>` na ordem
     definida no passo 2, preservando a extensão original de cada uma.

5. **Reescrever o carrossel em `index.html`**: substitua todo o conteúdo
   de dentro de `<div class="market-carousel-track" id="mercadoTrack">
   ...</div>` por um bloco `.market-slide` para cada imagem nova, seguindo
   exatamente o formato mostrado acima. Não mexa em mais nada da seção —
   dots e JS já se adaptam sozinhos à nova quantidade.

6. **Arquivar as imagens usadas na pasta de origem**: mova (não copie) os
   arquivos que acabaram de ser usados de `Carrossel_Site/` para uma
   subpasta nova `Carrossel_Site/publicado-AAAA-MM-DD/` (data de hoje).
   Isso evita que, numa próxima rodada, imagens antigas esquecidas na pasta
   sejam reaproveitadas por engano, e mantém um histórico de cada boletim
   publicado.

7. **Testar localmente** antes de propor publicação, seguindo a mesma
   disciplina do skill `auto-site`:
   - Suba o site local (`preview_start` com o config `static-site`, porta
     8000) se ainda não estiver rodando.
   - Confira no navegador embutido que a quantidade de dots bate com a
     quantidade de slides, que as imagens carregam (sem 404), que o
     carrossel roda até o fim e volta sem travar, e que o clique numa
     imagem abre o lightbox corretamente.
   - Confira o console por erros.

8. **Publicar**: siga exatamente o fluxo da opção 2 do skill `auto-site` —
   mostrar o que vai ser commitado (`git status`/`git diff`), nunca usar
   `git add -A` às cegas, escrever uma mensagem de commit curta em
   português, e **só dar `git push` com confirmação explícita do
   Ricardo**. Nunca pule essa confirmação, mesmo que os passos anteriores
   tenham corrido bem.

## Erros comuns

| Sintoma | Causa |
|---|---|
| Pasta de origem vazia | Ricardo ainda não arrastou as imagens da semana pra lá — avise e pare. |
| Arquivo com extensão estranha (`.webp`, `.heic`, `.pdf`) | Não é um formato aceito pelo carrossel — avise e pergunte se ele quer converter ou pular esse arquivo. |
| Ordem alfabética não bate com a ordem que o Ricardo queria | Sugira nomear os arquivos com prefixo numérico (`1 - ...`, `2 - ...`) da próxima vez; nesta rodada, pergunte a ordem correta antes de prosseguir. |
| Quantidade de imagens muito diferente da semana anterior (ex.: de 7 para 1) | Não é um erro por si só (o carrossel aceita qualquer quantidade ≥ 1), mas vale confirmar com o Ricardo que não foi engano antes de publicar. |
