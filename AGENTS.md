# Site Ricardo Brumatti

Site institucional estático (HTML/CSS/JS puro, sem build/framework), hospedado no GitHub
(`RCBCG/site-ricardobrumatti`) com deploy automático via Vercel a cada push no branch `main`.

## Estrutura
- `index.html`, `artigos.html`, `404.html` — páginas principais
- `ferramentas/` — ferramentas/scripts do site
- `img/`, `favicon.*`, `foto-perfil.jpg` — assets
- `vercel.json` — headers de segurança + rewrite de rotas para `index.html`
- `sitemap.xml`

## Como trabalhar
- Não há etapa de build: o que está no `main` é publicado como está.
- Branch único (`main`) = produção. Todo `git push` vai direto ao ar.
- Antes de implementar qualquer mudança, tirar dúvidas com o usuário sobre o que foi pedido
  quando houver ambiguidade — não presumir escopo.
- Sempre testar as mudanças antes de considerá-las prontas (servidor local
  `python3 -m http.server 8000` e/ou navegador embutido) antes de propor commit/push.
- Nunca dar `git push` sem confirmação explícita do usuário — push publica direto no site ao vivo.
- Reversão de emergência: no dashboard do Vercel, "Promote to Production" em um deploy anterior;
  ou `git revert HEAD` + push.
