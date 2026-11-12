# TV IPTV · Plano 3 de 3: ecrãs Portais do Olimpo

> **For agentic workers:** Use superpowers:subagent-driven-development. Follow the task briefs and preserve existing plan-2 changes. No commits until the commit-small review gate is resolved.

**Goal:** Substituir a TV antiga pelos nove ecrãs aprovados, ligados às APIs paginadas de catálogo, reprodução e guia.
**Architecture:** `pages/TV.tsx` monta o módulo; `pages/tv/` contém estado partilhado, componentes e ecrãs. TanStack Query guarda respostas por lista e filtros; preferências IPTV ficam em `state.tv[listId]`. Navegação em `/tv` usa parâmetros seguros (`lista`, `sec`, `pasta`, `id`, `vista`) e histórico do browser, sem URLs do fornecedor.
**Tech Stack:** React, TypeScript, TanStack Query, Hls.js, CSS; API Hono existente. MPEG-TS utiliza suporte browser apropriado, nunca ligações directas ao fornecedor.
**Spec:** `docs/superpowers/specs/2026-11-12-tv-iptv-design.md`; referência obrigatória `tv-c-final.html` e `tv-c-guia.html` ao lado do spec.

## Global Constraints

- PT-PT. Cinema/Add-ons/Conta/Admin continuam independentes e funcionais.
- Nove ecrãs aprovados: portal, leitor, séries, detalhe de série, filmes, detalhe de filme, pesquisa, pastas, guia; gestão de listas adicional.
- Fundo #04070a; aurora por país/conteúdo; vidro em três níveis; ciano #7de3f0, vermelho só em directo; sem ouro. Arte realista existente em `/art/img`.
- 1440 px e 375 px, sem overflow horizontal. Foco visível, teclado/setas/Enter/Esc/⌘K, modais com foco contido e restaurado; reduced-motion.
- Catálogo por categoria/página; sem descarregar a lista inteira para renderizar. Índice compacto de pesquisa carregado uma vez por lista, renovado com alterações de visibilidade.
- Escondido é escondido também na pesquisa, destaques, favoritos e progresso. Adultos escondidos por omissão; até quatro pastas fixadas por secção.
- Reprodução exclusivamente `/api/iptv/play/...`. Uma ligação por lista; destruir leitores e cancelar pedidos ao mudar/sair.
- Persistir favoritos, pastas, último canal e progresso por lista/Membro; serializar alterações para evitar perda de gravações concorrentes.
- Sem commits/push durante implementação: a revisão de cortes commit-small está pendente; preservar todos os ficheiros existentes.

## Review Focus

1. Troca de lista enquanto há pedidos em curso: nunca mostrar dados da anterior; testes de browser.
2. Esconder pasta elimina resultados e conteúdos destacados já em cache; teste de pesquisa/visibilidade.
3. Vários cliques em favorito e progresso em simultâneo não perdem preferências; teste do actualizador serializado.
4. Erro de reprodução/guia mostra mensagem PT-PT e tentar de novo; cancelamento não reabre stream antigo.
5. Navegação mobile/teclado funciona sem overflow, sem prender foco ou esconder o botão de fechar.

## Tarefa 1 — Base, portais, pesquisa e gestão

**Files:** replace `apps/web/src/pages/TV.tsx`; create `apps/web/src/pages/tv/{types.ts,data.ts,state.tsx,ui.tsx,Live.tsx,Search.tsx,Folders.tsx,Lists.tsx,tv.css}`; retain unrelated old helpers and styles unless no longer imported.
**Interfaces:** `TVProvider` exposes list/listId/lists, summary, section/category navigation, prefs, updatePrefs(fn), play(target), openDetail(section,id), openSearch/openFolders/openLists. `PlaybackTarget={section:'live'|'movie'|'series',id,episodeId?,title?,categoryId?,start?}`. `TVApp` renders children by selected view; later modules integrate via exported components. Types match actual API DTOs. Shared `Modal`, `Poster`, `ChannelCard`, `Outline`, `EmptyState` and `useTV` documented in report for later tasks.
- [x] Test behaviour of serial preference updates, search normalization/visibility, navigation encoding at public helper seam (`tests/tv-state.test.ts`).
- [x] Implement typed API wrappers/query keys and provider; use `useMemberState.save` with latest queued state; no optimistic saved indicators on failed writes.
- [x] Implement capsule header, dynamic sections/list selector, state skeleton/error/empty handling, live portal entrance and category channels with now/next, search and tags/favorites. Load by pages; bound rendered rows (virtual window or explicit pagination).
- [x] Implement ⌘K modal instant local search with grouped/highlighted results and current-folder scope; folder manager order/drag+keyboard, four-pin limit and visibility updates; list CRUD/refresh modal with hidden password and errors.
- [x] Verify typecheck and focused tests; deliver report and scoped diff for independent review.

## Tarefa 2 — Filmes, séries e detalhes

**Files:** create `pages/tv/{Catalog.tsx,Details.tsx}`; integrate `TV.tsx`/provider as needed; append scoped CSS.
**Consumes:** provider and DTOs of task1; category pagination and detail API; per-list preferences.
- [x] Implement Séries editorial hero/category counts/Top10 and recent/pinned/continue rows; editorial suggestions ordered deterministically and labelled without claiming global recency or provider popularity.
- [x] Implement Filmes bento hero and mixed-size posters/category cards plus category/continue rows.
- [x] Implement series detail with real seasons/ordered episodes, artwork/synopsis/metadata/favorite and saved progress; movie detail floating glass card, cast, continue/from-start.
- [x] Derive continue rows only from visible compact index + saved progress; keys `movie:<id>` and `series:<seriesId>:<episodeId>`; episode completion threshold 95%.
- [x] Shared poster-to-detail transition where supported; reduced-motion fallback. Missing metadata never replaced by invented titles/ratings/art.
- [x] Verify typecheck and browser behaviours/screenshots at 1440 and 375; report/scoped review.

## Tarefa 3 — Leitor e guia

**Files:** create `pages/tv/{Playback.tsx,Guide.tsx}`; integrate module; API stop route if required; MPEG-TS dependency only if needed.
- [x] Start playback by POST, ignore/stop stale starts, use HLS/direct/remux/MPEG-TS playback without exposing provider URLs. Persist position every 10s/on pause/exit, restore, seek remux via `?t=` offset. Explicit stop route closes session on leaving.
- [x] Full-screen view, live channel/programme capsule/progress ring, dock of channels in same folder, left/right channel switching; captions/audio/fullscreen controls and native track fallback; controls hide after 3s and wake on interaction.
- [x] Guide with Portais/Guia tabs, yesterday/today/available next days, folder/favorites, now button, virtual/bounded rows with hours and red now-line; mobile now/next list. Current programme plays, future opens information modal.
- [x] Verify fake upstream playback, API stop ownership, stale request cancellation and errors; browser keyboard/mobile.

## Tarefa 4 — Integração e validação final

**Files:** `tests/tv-browser.mjs`, browser fixtures as necessary; plan status/results.
- [x] Build isolated test member/provider fixtures: all nine screens, no real secrets; exercise list changes, visibility, favorites, episodes, search and guide with Playwright.
- [x] Screenshots 1440/375; inspect visually against mockups and fix discrepancies, check overflow/errors and reduced-motion.
- [x] Run `npm test`, `npm run typecheck`, `npm run build`, `npm run test:browser` and new TV browser test.
- [x] Repeat real-provider validation with sanitized status/codec results; do not call external failure a successful playback.
- [x] Final independent review, fix required findings, update plans and prepare revised commit-small cuts for approval.

## Estado verificado — 12 de Novembro de 2026

Implementação e QA das quatro tarefas concluídas; revisão independente final aprovada, sem problemas bloqueantes. A activação inclui os nove ecrãs aprovados, gestão de listas, reprodução privada pela API e guia com dias civis locais/DST. O browser recebe metadados públicos das listas; valores de configuração guardados ficam no servidor e campos omitidos numa edição são preservados. O endpoint bruto antigo foi retirado.

- `npm test`: 134/134. Typecheck e build web/API passaram.
- `npm run test:browser`: bootstrap/TOTP/onboarding reais em schema isolado e 12 ecrãs protegidos, 1440/375.
- `npm run test:tv`: quatro transportes com frames/tempo reais a partir de media local sintética; 50 mil entradas de pesquisa com 90 resultados renderizados; mudanças de lista, caches escondidas, gravações concorrentes, teclado, modais sobrepostos, guia do canal, erros/retry e edição pública de listas. 24 capturas.
- `npm run test:visual`: contratos visuais da TV e geometria dos Estados preservados a 1440/375.
- Validação separada da lista privada: resultados sanitizados na secção Estado verificado do Plano 2; não foi repetida a ligação privada durante a QA local.

O MP4 fragmentado do teste de browser é gerado localmente e valida o consumo pelo leitor; o remux real tem cobertura API separada. A selecção de múltiplas faixas reais e compatibilidade universal DRM/codecs não são alegadas. Mantém-se o aviso conhecido de bundles grandes. As sugestões editoriais são uma selecção limitada da pasta, sem afirmação de popularidade global.

Os 13 cortes `commit-small` foram aprovados pelo utilizador e executados após a revisão final. A verificação de tipos da árvore completa precede o único push à branch de trabalho.
