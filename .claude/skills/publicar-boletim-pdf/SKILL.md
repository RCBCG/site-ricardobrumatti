---
name: publicar-boletim-pdf
description: Publica os PDFs semanais da Estação de Análise (Destaques Semanais e relatório versão campo) numa pasta pública do site, com link estável, e atualiza o botão de download na home. Use quando o Ricardo pedir "publicar o boletim em PDF", "subir o PDF da semana", "publicar os destaques semanais", ou invocar /publicar-boletim-pdf.
---

# publicar-boletim-pdf — publicação semanal dos PDFs da Estação

## Onde as coisas ficam

- **Origem dos PDFs**: baixados pelo Ricardo da Estação de Análise (app
  Streamlit, aba Carrossel → botões "Gerar PDF (versão campo)" e "Gerar
  Destaques Semanais (PDF)") — normalmente em `~/Downloads`, com nomes como
  `relatorio_campo_AAAA-MM.pdf` e `destaques_semanais_AAAA-MM.pdf`. Se não
  estiverem visíveis, pergunte o caminho ao Ricardo — não adivinhe.
- **Pasta de destino no site**: `boletim/` (paralela à `img/boletim/` do
  carrossel de imagens, mas para arquivos PDF). Convenção de nome, por data
  do PREGÃO da edição (não a data em que o PDF foi gerado):
  - `boletim/{aaaa-mm-dd}-destaques.pdf`
  - `boletim/{aaaa-mm-dd}-relatorio-campo.pdf`
- **Botão na home**: `index.html`, dentro de `<section id="mercado">` →
  `.section-head`, entre os marcadores de comentário
  `<!-- boletim-pdf:inicio -->` e `<!-- boletim-pdf:fim -->`. É um
  `<a class="btn-outline">` apontando para o Destaques mais recente (nunca
  para o relatório campo — o Destaques é o documento feito pra circular).

## Passo a passo

1. **Confirmar a data do pregão** da edição (pergunte ao Ricardo se não
   estiver óbvia — é a data que os dois arquivos usarão no nome, no formato
   `aaaa-mm-dd`).
2. **Copiar os 2 PDFs** da origem (Downloads ou caminho informado) para
   `boletim/{data}-destaques.pdf` e `boletim/{data}-relatorio-campo.pdf`.
   Copiar, não mover — os originais continuam em Downloads.
3. **Atualizar o botão** em `index.html`: troque o `href` do `<a>` entre os
   marcadores `boletim-pdf:inicio`/`boletim-pdf:fim` para
   `boletim/{data}-destaques.pdf`. Não mexa em mais nada da seção
   `#mercado` — o carrossel de imagens (`atualizar-boletim`) é independente
   deste botão.
4. **Testar localmente** antes de propor publicação (mesma disciplina do
   `auto-site`):
   - Suba o site local (`preview_start` com o config `static-site`, porta
     8000) se ainda não estiver rodando.
   - Confira no navegador embutido que os 2 PDFs abrem sem 404
     (`http://localhost:8000/boletim/{data}-destaques.pdf` e o
     `-relatorio-campo.pdf`) e que o botão novo na seção Boletim de Mercado
     aponta pro arquivo certo.
   - Confira o console por erros.
5. **Publicar**: siga exatamente o fluxo da opção 2 do skill `auto-site` —
   `git status`/`git diff` antes de tudo, adicionar os arquivos por nome
   (nunca `git add -A` às cegas — aqui inclui os 2 PDFs novos + o
   `index.html`), mensagem de commit curta em português focada no *porquê*
   (nova edição publicada, não "atualiza PDF"), rodapé de atribuição padrão,
   e **só `git push` com confirmação explícita do Ricardo**. Nunca pule essa
   confirmação.

## Nota sobre o `vercel.json`

O rewrite `/(.*)` → `/index.html` do `vercel.json` não deveria interceptar
`boletim/*.pdf` — o comportamento padrão da Vercel é servir um arquivo
estático existente antes de aplicar rewrites (é assim que `ferramentas/*`
já funciona sem extensão). Mesmo assim, depois do PRIMEIRO push real com
PDFs em `boletim/`, vale conferir com `curl -I` na URL pública antes de
divulgar o link (`content-type: application/pdf`, não `text/html` — um
`text/html` ali indicaria que o rewrite pegou o arquivo por engano).

## Erros comuns

| Sintoma | Causa |
|---|---|
| PDFs não encontrados em Downloads | O Ricardo ainda não gerou/baixou pela Estação nesta sessão — peça para gerar (aba Carrossel) antes de continuar. |
| Botão da home aponta pro PDF antigo depois do push | Marcadores `boletim-pdf:inicio`/`fim` não foram encontrados ou o `href` não foi de fato trocado — confira o diff do `index.html` antes de commitar. |
| `boletim/{data}-relatorio-campo.pdf` teria conteúdo desatualizado | O botão de Destaques Semanais no app já regera o campo com `marcadores={}` toda vez que é clicado (ver `app.py`, aba Carrossel) — os dois PDFs baixados juntos são sempre da mesma leva de dados, então isso não deveria acontecer; se acontecer, peça pro Ricardo gerar os dois de novo pelo mesmo clique. |
| `curl -I` na URL pública devolve `text/html` em vez de `application/pdf` | O rewrite do `vercel.json` pegou o caminho por engano (pasta/nome errado, ou o arquivo não foi de fato commitado) — não é esperado no comportamento padrão da Vercel; investigue antes de divulgar o link. |
