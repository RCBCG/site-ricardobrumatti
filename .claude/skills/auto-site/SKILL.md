---
name: auto-site
description: Menu de manutenção do site institucional — verificar se a máquina local está na mesma versão do GitHub (e atualizar se não estiver), commitar e publicar o site (deploy automático via Vercel), ou testar localmente antes de subir. Use quando o Ricardo pedir "verificar status do site", "publicar o site", "sobe pro github", "roda local", "testar o site", "localhost", ou invocar /auto-site.
---

# auto-site — menu de manutenção

Skill de menu simples. Ao ser chamada, **não execute nada ainda** — mostre as
três opções abaixo e espere o Ricardo responder com o número.

```
1. Verificar Status — compara a máquina local com o GitHub e atualiza se estiver atrasada
2. Publicar no Site — commita e publica o trabalho feito nesta máquina (vai ao ar via Vercel)
3. Testar Localmente — sobe o site localmente para conferir antes de publicar
```

O remote é sempre `origin` (`github.com/RCBCG/site-ricardobrumatti`), branch
`main`. Não há etapa de build: o que está no `main` é exatamente o que a
Vercel publica, e o deploy dispara automaticamente a cada push — não existe
staging, então a opção 2 já é publicação direta ao vivo.

**Ao terminar qualquer uma das três opções**, não encerre por conta própria:
pergunte se o Ricardo quer executar outra ação do menu ou se pode parar por
aqui. Se ele pedir outra opção, volte ao topo deste fluxo para essa opção
(sem reexibir o menu inteiro, já que ele acabou de escolher). Isso vale
mesmo quando a opção termina em erro ou pendência (ex.: push falhou,
divergência de branch) — a pergunta de continuar ainda é o fechamento.

## 1. Verificar Status

```bash
git fetch origin --quiet
git rev-parse HEAD
git rev-parse origin/main
git status --porcelain
```

Compare os dois hashes:

- **Iguais e sem alterações não commitadas** → avise que já está na versão
  mais recente (cite o hash curto e a última mensagem de commit,
  `git log -1 --oneline`). Não faça mais nada.
- **Local atrás de origin/main** (origin tem commits que o local não tem) →
  isso é uma atualização, faça sozinho:
  1. Se `git status --porcelain` não estiver vazio, **pare e avise** — há
     trabalho não commitado na máquina; pergunte se pode guardar com
     `git stash -u` antes de atualizar, ou se ele prefere resolver primeiro.
  2. Working tree limpo: `git pull --ff-only origin main`.
  3. Confirme com `git log -1 --oneline` e diga o que mudou
     (`git log --oneline HEAD@{1}..HEAD`).
- **Local à frente de origin/main** (a máquina tem commits que o GitHub não
  tem) → não é "desatualizado", é o oposto. Não faça pull nem push aqui;
  diga ao Ricardo que há trabalho local não publicado e sugira a opção 2.
- **Divergiu** (os dois têm commits que o outro não tem) → **não tente
  resolver sozinho** (nada de merge, rebase ou reset). Explique a
  divergência e pergunte como ele quer prosseguir.

## 2. Publicar no Site

Fluxo padrão de commit e push. **Só execute quando o Ricardo escolher esta
opção** — a escolha em si já é o pedido explícito de publicar, conforme o
fluxo combinado no `CLAUDE.md` do projeto. Como não há branch de staging,
este push vai direto para o site ao vivo.

```bash
git status
git diff
git log -3 --oneline
```

1. Se não houver nada para commitar, diga isso e pare.
2. Se as mudanças ainda não foram testadas nesta sessão (nem localmente via
   opção 3, nem no navegador embutido), pergunte se o Ricardo quer testar
   antes de publicar — não empurre para produção algo não conferido.
3. Adicione os arquivos relevantes por nome (nunca `git add -A` às cegas —
   confira o que entrou, principalmente para `vercel.json` — mexe em
   headers de segurança e rewrites — ou mudanças amplas em `index.html`).
   Cuidado especial com arquivos que não deveriam ser versionados (ex.:
   `.DS_Store`).
4. Redija uma mensagem curta em português, focada no *porquê* da mudança,
   seguindo o estilo dos commits recentes (`git log`).
5. Commite com o rodapé `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
6. `git push origin main`.
7. `git status` para confirmar que subiu limpo.

Avise o Ricardo do resultado: o que foi publicado (resumo dos arquivos) e
que a Vercel leva normalmente menos de um ou dois minutos para redeployar a
partir do `main` (pode conferir em vercel.com se quiser acompanhar).

Se o push falhar (rede, credencial, ou origin/main andou entre o fetch e o
push), **não force** — mostre o erro e pergunte como prosseguir.

Reversão de emergência, se algo subir quebrado: no dashboard da Vercel,
"Promote to Production" em um deploy anterior; ou `git revert HEAD` + push
(sempre com confirmação do Ricardo antes do push).

## 3. Testar Localmente

Sobe o site localmente via servidor HTTP simples, sem tocar em nada do
GitHub.

```
preview_start com name "static-site" (config já existe em .claude/launch.json,
porta 8000, python3 -m http.server 8000)
```

Depois de abrir, navegue até `http://localhost:8000` no navegador embutido,
confira o console (`read_console_messages`) por erros e dê uma olhada geral
na página afetada pela mudança. Avise o Ricardo que o site está rodando em
`http://localhost:8000` e que ele também pode navegar à vontade. Isso não
publica nada; para subir o que foi conferido, a opção é a 2.

Não derrube o servidor sozinho ao final — deixe rodando para o Ricardo
usar, a menos que ele peça para parar.

## Erros comuns

| Sintoma | Causa |
|---|---|
| Opção 1 diz "à frente" logo após um `git pull` manual do Ricardo | Ele mesmo já atualizou fora da skill; só confirme o estado atual. |
| `git pull --ff-only` falha | Working tree não estava tão limpo quanto pareceu, ou origin/main mudou entre o fetch e o pull. Rode `git status` de novo antes de insistir. |
| Servidor local sobe mas a página fica em branco ou com erro no console | Geralmente caminho de arquivo/asset errado ou cache do navegador — testar com hard refresh e checar `read_network_requests` para 404s. |
| Push feito com sucesso mas o site ao vivo ainda mostra a versão antiga | Normal por até 1-2 minutos enquanto a Vercel redeploya; se persistir, checar o painel da Vercel para erro de build/deploy. |
| Opção 2 sem nada para commitar | Working tree já está igual ao último commit — não é erro, só não há o que publicar. |
